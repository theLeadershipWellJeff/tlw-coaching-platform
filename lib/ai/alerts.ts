/**
 * AI spend alerts (Phase 2). Two audiences:
 *   • Jeff (the house coach / supervisor) at 50 / 80 / 100 % of the org's
 *     portal ceiling;
 *   • a client's coach when that client reaches the soft cap (assistant
 *     downgraded) or the hard cap (assistant paused — the coach can extend).
 * Every send is claimed first in `ai_alerts` (unique per kind/scope/month/
 * threshold), so an alert can never double-send, and every send is
 * best-effort: a mail failure never touches the call that triggered it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiAlertKind, Coach, Database } from '@/lib/supabase/types'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { houseCoach } from '@/lib/coach-signup'
import { getBaseUrl } from '@/lib/url'
import { formatUsd } from './pricing'
import { budgetStatus, DEFAULT_ORG_ID, formatResetDate } from './budget'

type Db = SupabaseClient<Database>

export const ORG_ALERT_THRESHOLDS = [50, 80, 100] as const

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function shell(title: string, body: string, cta?: { href: string; label: string }): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;background:#DDD9D3;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#111226;">
  <div style="max-width:520px;margin:6vh auto 0;background:#fff;border-radius:16px;padding:36px 32px;box-shadow:0 10px 40px rgba(17,18,38,.08);">
    <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8B8680;margin:0 0 14px;">theLeadershipWell</p>
    <h1 style="font-size:19px;font-weight:600;margin:0 0 12px;">${esc(title)}</h1>
    ${body}
    ${cta ? `<p style="margin:22px 0 0;"><a href="${cta.href}" style="display:inline-block;background:#111226;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:11px 18px;border-radius:8px;">${esc(cta.label)}</a></p>` : ''}
  </div>
</body></html>`
}

function p(text: string): string {
  return `<p style="font-size:14px;color:#403832;line-height:1.6;margin:0 0 10px;">${text}</p>`
}

/** Insert the claim row; false when this alert already went out this month. */
async function claim(supabase: Db, args: { orgId: string; kind: AiAlertKind; scopeId: string; periodMonth: string; threshold?: number; detail?: Record<string, unknown> }): Promise<boolean> {
  const { error } = await supabase.from('ai_alerts').insert({
    org_id: args.orgId,
    kind: args.kind,
    scope_id: args.scopeId,
    period_month: args.periodMonth,
    threshold: args.threshold ?? 0,
    detail: args.detail ?? null,
  })
  if (!error) return true
  if (error.code === '23505') return false
  console.error('[ai alerts] claim failed:', error.message)
  return false
}

async function primaryCoachForClient(supabase: Db, clientId: string): Promise<Coach | null> {
  const { data: link } = await supabase.from('coach_clients').select('coach_id').eq('client_id', clientId).order('role', { ascending: true }).limit(1).maybeSingle()
  if (!link?.coach_id) return null
  const { data } = await supabase.from('coaches').select('*').eq('id', link.coach_id).maybeSingle()
  return (data as Coach | null) ?? null
}

/**
 * Org ceiling thresholds. Called after every settled client-principal call and
 * from the hourly sweep. Never throws.
 */
export async function checkOrgAlerts(supabase: Db, orgId: string | null): Promise<void> {
  try {
    const org = orgId ?? DEFAULT_ORG_ID
    const status = await budgetStatus(supabase, { orgId: org, clientId: null, principal: 'client', purpose: null })
    const cap = status.org?.cap
    if (!cap) return
    const spent = status.org?.spent ?? 0
    const pct = Math.floor((spent * 100) / cap)
    for (const t of ORG_ALERT_THRESHOLDS) {
      if (pct < t) continue
      const claimed = await claim(supabase, { orgId: org, kind: 'org_threshold', scopeId: org, periodMonth: status.period_month, threshold: t, detail: { spent, cap, pct } })
      if (!claimed) continue
      const to = await houseCoach(supabase)
      if (!to?.email) continue
      const html = shell(
        `Portal AI spend is at ${pct}% of this month's ceiling`,
        p(`Client-side assistant usage across the firm has reached <strong>${formatUsd(spent)}</strong> of the <strong>${formatUsd(cap)}</strong> monthly ceiling (${t}% threshold).`) +
          p(t >= 100 ? 'Every client assistant is now paused until the ceiling resets on ' + esc(formatResetDate(status.resets_on)) + ', unless the ceiling is raised.' : 'Nothing is paused yet. At 100% every client assistant pauses until the month resets.') +
          p('Raise or review the ceiling in <code>ai_budgets</code> (scope <code>org</code>).'),
        { href: `${getBaseUrl()}/command-center`, label: 'Open the Command Center' }
      )
      await sendCoachHtmlEmail(to, { to: to.email, subject: `AI spend: ${pct}% of the monthly portal ceiling`, html }).catch((e) => console.error('[ai alerts] org email failed:', e?.message || e))
    }
  } catch (e: any) {
    console.error('[ai alerts] org check failed:', e?.message || e)
  }
}

/**
 * Tell the client's coach their client's assistant was downgraded (soft) or
 * paused (hard). Once per client per month per kind. Never throws.
 */
export async function notifyClientCap(
  supabase: Db,
  args: { orgId: string | null; clientId: string; kind: 'client_soft' | 'client_hard'; spent: number; cap: number; periodMonth: string; resetsOn: string }
): Promise<void> {
  try {
    const org = args.orgId ?? DEFAULT_ORG_ID
    const claimed = await claim(supabase, { orgId: org, kind: args.kind, scopeId: args.clientId, periodMonth: args.periodMonth, detail: { spent: args.spent, cap: args.cap } })
    if (!claimed) return
    const coach = await primaryCoachForClient(supabase, args.clientId)
    if (!coach?.email) return
    const { data: client } = await supabase.from('clients').select('name').eq('id', args.clientId).maybeSingle()
    const name = client?.name || 'A client'
    const link = { href: `${getBaseUrl()}/clients/${args.clientId}`, label: `Open ${name}'s workspace` }
    const html =
      args.kind === 'client_hard'
        ? shell(
            `${name}'s assistant is paused for the month`,
            p(`${esc(name)} has used their full monthly assistant allowance (<strong>${formatUsd(args.spent)}</strong> of <strong>${formatUsd(args.cap)}</strong>). Their reflection space is paused until <strong>${esc(formatResetDate(args.resetsOn))}</strong>.`) +
              p('You can extend it any time from the <em>Assistant usage</em> card in their workspace.'),
            link
          )
        : shell(
            `${name} is near their monthly assistant allowance`,
            p(`${esc(name)} has used <strong>${formatUsd(args.spent)}</strong> of their <strong>${formatUsd(args.cap)}</strong> monthly assistant allowance. To keep them going, the assistant has switched to a lighter model for the rest of the month.`) +
              p('If this client is doing deep work you can extend their allowance from the <em>Assistant usage</em> card in their workspace.'),
            link
          )
    await sendCoachHtmlEmail(coach, {
      to: coach.email,
      subject: args.kind === 'client_hard' ? `${name}'s assistant is paused — extend?` : `${name} is near their assistant allowance`,
      html,
    }).catch((e) => console.error('[ai alerts] client email failed:', e?.message || e))
  } catch (e: any) {
    console.error('[ai alerts] client notify failed:', e?.message || e)
  }
}
