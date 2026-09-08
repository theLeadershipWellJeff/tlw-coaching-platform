/**
 * Portal reminders (migration 063) — three kinds, one daily cron, at most one
 * email per client per day:
 *
 *   welcome         invited, never signed in → day 3, day 10 after the latest
 *                   invitation, then stop.
 *   quarterly_goals the first Monday of Jan / Apr / Jul / Oct (a 7-day window
 *                   so a missed cron day still sends once) → "time to look at
 *                   your goals for the quarter". Only for people who have been
 *                   in the portal at least once.
 *   comeback        gone quiet → 14 days and 35 days since last seen, then
 *                   quarterly only. The period key carries the last-seen date,
 *                   so the ladder restarts after they come back and go quiet
 *                   again.
 *
 * Precedence when several apply on one day: welcome (they don't know the
 * portal yet) → quarterly → comeback. Every send is claimed in
 * `portal_reminders` (unique per client/kind/period) BEFORE sending, so a
 * reminder can never go twice; a failed send keeps the claim with its error so
 * support can see it, and the next rung still fires on schedule.
 *
 * Skipped entirely: no email, archived / inactive clients, expired portal
 * access, and anyone who switched reminders off in Settings
 * (portal_features.reminders === false).
 *
 * The pure decision (`decideReminder`) has no I/O so it can be checked in a
 * script; `runPortalReminders` does the reads, the sends, and the ledger.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getBaseUrl } from '@/lib/url'
import { loadPortalStates } from '@/lib/admin/portal-status'
import { createLoginToken } from './tokens'
import { resolveClientCoach } from './coach'
import { deliverPortalEmail } from './send'
import { buildReminderEmailHtml } from './email'
import { logPortalEvent } from './events'
import type { PortalFeatures, PortalReminderKind } from '@/lib/supabase/types'

export type ReminderCandidate = {
  id: string
  name: string | null
  email: string | null
  status: string | null
  clientType: string | null
  timezone: string | null
  portalFeatures: PortalFeatures | null
  accessExpiresAt: string | null
  invitedAt: string | null
  lastSeenAt: string | null
}

export type ReminderDecision = { kind: PortalReminderKind; periodKey: string }

const DAY = 86400_000
export const WELCOME_DAYS = [3, 10] as const
export const COMEBACK_DAYS = [14, 35] as const
export const QUARTER_WINDOW_DAYS = 7

/** YYYY-MM-DD of `now` in the client's zone (UTC when unknown/invalid). */
export function localDate(now: Date, timeZone?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

/** The first Monday of the quarter containing `ymd` (YYYY-MM-DD), and the quarter key. */
export function quarterAnchor(ymd: string): { firstMonday: string; key: string } {
  const [y, m] = ymd.split('-').map(Number)
  const q = Math.floor((m - 1) / 3) + 1
  const startMonth = (q - 1) * 3 + 1
  const first = new Date(Date.UTC(y, startMonth - 1, 1))
  const shift = (8 - first.getUTCDay()) % 7 // days from the 1st to the first Monday
  const monday = new Date(Date.UTC(y, startMonth - 1, 1 + shift))
  return { firstMonday: monday.toISOString().slice(0, 10), key: `goals-${y}Q${q}` }
}

function daysBetween(ymdA: string, ymdB: string): number {
  return Math.round((Date.parse(ymdB + 'T00:00:00Z') - Date.parse(ymdA + 'T00:00:00Z')) / DAY)
}

export function remindersEnabled(features: PortalFeatures | null | undefined): boolean {
  return features?.reminders !== false
}

/**
 * Which reminder (if any) this client should get today. `sent` holds
 * `${kind}:${periodKey}` for everything already in the ledger.
 */
export function decideReminder(c: ReminderCandidate, now: Date, sent: Set<string>): ReminderDecision | null {
  if (!c.email) return null
  if (c.status === 'archived' || c.status === 'inactive') return null
  if (!remindersEnabled(c.portalFeatures)) return null
  if (c.accessExpiresAt && Date.parse(c.accessExpiresAt) < now.getTime()) return null
  const has = (d: ReminderDecision) => sent.has(`${d.kind}:${d.periodKey}`)
  const today = localDate(now, c.timezone)

  // 1. Never been in: the welcome ladder, keyed on the invitation date.
  if (!c.lastSeenAt) {
    if (!c.invitedAt) return null
    const inviteDay = localDate(new Date(c.invitedAt), c.timezone)
    const age = daysBetween(inviteDay, today)
    for (const d of [...WELCOME_DAYS].reverse()) {
      if (age >= d) {
        const decision = { kind: 'welcome' as const, periodKey: `welcome-${d}d-${inviteDay}` }
        return has(decision) ? null : decision
      }
    }
    return null
  }

  // 2. Quarterly goals, inside the first week of the quarter.
  const { firstMonday, key } = quarterAnchor(today)
  const sinceMonday = daysBetween(firstMonday, today)
  if (sinceMonday >= 0 && sinceMonday < QUARTER_WINDOW_DAYS) {
    const decision = { kind: 'quarterly_goals' as const, periodKey: key }
    if (!has(decision)) return decision
  }

  // 3. Gone quiet: the come-back ladder, keyed on the last-seen date.
  const seenDay = localDate(new Date(c.lastSeenAt), c.timezone)
  const quiet = daysBetween(seenDay, today)
  for (const d of [...COMEBACK_DAYS].reverse()) {
    if (quiet >= d) {
      const decision = { kind: 'comeback' as const, periodKey: `comeback-${d}d-${seenDay}` }
      return has(decision) ? null : decision
    }
  }
  return null
}

export const REMINDER_SUBJECTS: Record<PortalReminderKind, string> = {
  welcome: 'Your coaching portal is ready when you are',
  comeback: 'A quiet nudge from your coaching portal',
  quarterly_goals: 'A new quarter — a good moment for your goals',
}

/** Everyone with a portal presence: participants, the 360 flag, or ever invited. */
async function loadCandidates(): Promise<ReminderCandidate[]> {
  const supabase = getSupabaseAdmin()
  const { data: invited } = await supabase.from('client_tokens').select('client_id').eq('purpose', 'login')
  const invitedIds = Array.from(new Set((invited || []).map((t) => t.client_id)))
  const filters = ['client_type.eq.portal', 'portal_features->>assessments.eq.true']
  if (invitedIds.length) filters.push(`id.in.(${invitedIds.join(',')})`)
  const { data: rows } = await supabase
    .from('clients')
    .select('id, name, email, status, client_type, timezone, portal_features, portal_access_expires_at')
    .or(filters.join(','))
    .neq('client_type', 'coach')
    .limit(2000)
  const clients = rows || []
  const states = await loadPortalStates(supabase, clients.map((c) => c.id))
  return clients.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    status: c.status,
    clientType: c.client_type,
    timezone: c.timezone,
    portalFeatures: (c.portal_features as PortalFeatures) || null,
    accessExpiresAt: c.portal_access_expires_at,
    invitedAt: states[c.id]?.invitedAt ?? null,
    lastSeenAt: states[c.id]?.lastSeenAt ?? null,
  }))
}

export type ReminderRunResult = {
  considered: number
  sent: Array<{ clientId: string; kind: PortalReminderKind; periodKey: string; via: string }>
  failed: Array<{ clientId: string; kind: PortalReminderKind; periodKey: string; error: string }>
  skipped: number
  dryRun: boolean
}

export async function runPortalReminders(opts: { now?: Date; dryRun?: boolean; limit?: number } = {}): Promise<ReminderRunResult> {
  const now = opts.now || new Date()
  const supabase = getSupabaseAdmin()
  const candidates = await loadCandidates()
  const ids = candidates.map((c) => c.id)
  const { data: ledger, error: ledgerErr } = ids.length
    ? await supabase.from('portal_reminders').select('client_id, kind, period_key').in('client_id', ids)
    : { data: [], error: null }
  if (ledgerErr) throw new Error(`portal_reminders unavailable (apply migration 063): ${ledgerErr.message}`)
  const sentByClient = new Map<string, Set<string>>()
  for (const r of ledger || []) {
    const set = sentByClient.get(r.client_id) || new Set<string>()
    set.add(`${r.kind}:${r.period_key}`)
    sentByClient.set(r.client_id, set)
  }

  const result: ReminderRunResult = { considered: candidates.length, sent: [], failed: [], skipped: 0, dryRun: !!opts.dryRun }
  const limit = opts.limit ?? 200
  for (const c of candidates) {
    if (result.sent.length + result.failed.length >= limit) break
    const decision = decideReminder(c, now, sentByClient.get(c.id) || new Set())
    if (!decision) {
      result.skipped++
      continue
    }
    if (opts.dryRun) {
      result.sent.push({ clientId: c.id, kind: decision.kind, periodKey: decision.periodKey, via: 'dry-run' })
      continue
    }
    // Claim first (unique index) — a second runner in the same minute loses.
    const { data: client } = await supabase.from('clients').select('org_id').eq('id', c.id).maybeSingle()
    const { data: claim, error: claimErr } = await supabase
      .from('portal_reminders')
      .insert({ client_id: c.id, org_id: client?.org_id, kind: decision.kind, period_key: decision.periodKey, via: null, error: 'pending' } as never)
      .select('id')
      .maybeSingle()
    if (claimErr || !claim) {
      result.skipped++
      continue
    }
    try {
      const coach = await resolveClientCoach(c.id)
      const raw = await createLoginToken(c.id, client?.org_id || '')
      const base = getBaseUrl()
      const html = buildReminderEmailHtml({
        firstName: (c.name || '').split(' ')[0] || 'there',
        kind: decision.kind,
        link: `${base}/portal/verify?token=${raw}`,
        settingsLink: `${base}/portal/settings`,
        // A participant's house-coach link is structural; the firm signs off.
        coachName: coach && c.clientType !== 'portal' ? coach.name : null,
      })
      const r = await deliverPortalEmail({
        client: { id: c.id, name: c.name, email: c.email! },
        coach,
        subject: REMINDER_SUBJECTS[decision.kind],
        html,
        type: 'reminder',
        preview: `Portal reminder · ${decision.kind.replace(/_/g, ' ')}`,
      })
      await supabase.from('portal_reminders').update({ via: r.via, error: r.ok ? r.warning ?? null : r.error ?? 'send failed' }).eq('id', claim.id)
      if (r.ok) {
        result.sent.push({ clientId: c.id, kind: decision.kind, periodKey: decision.periodKey, via: r.via })
        await logPortalEvent(c.id, 'reminder_sent', { kind: decision.kind, period_key: decision.periodKey, via: r.via })
      } else {
        result.failed.push({ clientId: c.id, kind: decision.kind, periodKey: decision.periodKey, error: r.error || 'send failed' })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await supabase.from('portal_reminders').update({ via: 'none', error: msg }).eq('id', claim.id)
      result.failed.push({ clientId: c.id, kind: decision.kind, periodKey: decision.periodKey, error: msg })
    }
  }
  return result
}
