/**
 * Cancel a coach's account from the Command Center — the ONE path that ends
 * a coach's platform subscription and walls their access, shared by
 * `POST /api/coaches/[id]/billing/cancel` (cancel, keep the row) and
 * `DELETE /api/coaches/[id]` (remove — which must never orphan a live Stripe
 * subscription that keeps charging a deleted coach).
 *
 * Order matters: Stripe first, then our row. If Stripe refuses, nothing here
 * changes and the caller reports the error — a walled coach with a charging
 * subscription is the one outcome this must never produce.
 *
 *   when = 'now'         → subscription cancelled immediately, plan → lapsed
 *                          (the wall — lib/access.ts), status → canceled.
 *   when = 'period_end'  → Stripe flags cancel_at_period_end; the coach keeps
 *                          access until the paid period ends, when the
 *                          customer.subscription.deleted webhook lands the
 *                          wall. A coach with no live subscription (beta, a
 *                          comp) has no period, so this behaves like 'now'.
 *
 * The wall is not deletion: every note, transcript, report and client stays,
 * and "Download my data" on /subscription keeps working while locked.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Coach } from '@/lib/supabase/types'
import { cancelCoachSubscription, type CoachCancelWhen } from '@/lib/billing/stripe'
import { logAdminAction } from '@/lib/admin/audit'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { getBaseUrl } from '@/lib/url'

const LIVE_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete']

export type CancelCoachAccountResult = {
  /** What actually happened to access. */
  effective: 'now' | 'period_end'
  plan: string
  subscription_status: string | null
  /** ISO — when access ends for a period_end cancel (null when immediate). */
  access_ends_at: string | null
  /** true when a Stripe subscription was cancelled (or flagged) by this call. */
  stripe_cancelled: boolean
  emailed: boolean
}

export async function cancelCoachAccount(
  supabase: SupabaseClient<Database>,
  opts: {
    coachId: string
    when: CoachCancelWhen
    /** The acting supervisor (audit actor + the Gmail the confirmation goes out from). */
    actor: Coach
    /** Email the coach a confirmation (best-effort; never blocks the cancel). */
    email: boolean
    /** Free-text reason for the audit row (e.g. "asked by email 9/14"). */
    reason?: string | null
  },
): Promise<CancelCoachAccountResult> {
  const { data: coachRow, error } = await supabase
    .from('coaches')
    .select('id, name, email, role, plan, plan_note, stripe_subscription_id, subscription_status')
    .eq('id', opts.coachId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!coachRow) throw new Error('Coach not found')
  const coach = coachRow as any

  // ── 1. Stripe first ──────────────────────────────────────────────────────
  let stripeCancelled = false
  let periodEnd: string | null = null
  let stripeStatus: string | null = coach.subscription_status ?? null
  const subId: string | null = coach.stripe_subscription_id ?? null
  const live = !!subId && LIVE_STATUSES.includes(coach.subscription_status ?? '')

  if (subId) {
    // Any stored subscription id is checked against Stripe — a stale
    // `subscription_status` must not leave a charging subscription behind.
    const result = await cancelCoachSubscription(subId, opts.when)
    stripeStatus = result.status
    if (!result.alreadyEnded) {
      stripeCancelled = true
      if (opts.when === 'period_end') periodEnd = result.currentPeriodEnd
    }
  }

  // No period to run out → the wall is immediate.
  const effective: 'now' | 'period_end' =
    opts.when === 'period_end' && live && stripeCancelled && periodEnd ? 'period_end' : 'now'

  // ── 2. Our row ───────────────────────────────────────────────────────────
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }
  if (effective === 'now') {
    updates.plan = 'lapsed'
    updates.subscription_status = subId ? 'canceled' : coach.subscription_status ?? null
    updates.plan_note = `Account cancelled ${now.slice(0, 10)}`
  } else {
    // Access continues until the period ends; the webhook flips the plan.
    // The note makes the pending end visible on the Command Center row even
    // if the webhook is slow, and survives a missing webhook registration.
    updates.subscription_status = stripeStatus
    updates.plan_note = `Cancels ${periodEnd!.slice(0, 10)}`
  }
  const { error: updErr } = await supabase.from('coaches').update(updates as any).eq('id', coach.id)
  if (updErr) throw new Error(`Subscription ${stripeCancelled ? 'cancelled in Stripe but ' : ''}the account update failed: ${updErr.message}`)

  // ── 3. Audit ─────────────────────────────────────────────────────────────
  await logAdminAction(supabase, {
    actorCoachId: opts.actor.id,
    action: 'coach_account_cancelled',
    targetCoachId: coach.id,
    detail: {
      requested: opts.when,
      effective,
      reason: opts.reason ?? null,
      previous_plan: coach.plan ?? null,
      stripe_subscription_id: subId,
      stripe_cancelled: stripeCancelled,
      stripe_status: stripeStatus,
      access_ends_at: effective === 'period_end' ? periodEnd : now,
    },
  })

  // ── 4. Tell the coach (best-effort) ──────────────────────────────────────
  let emailed = false
  if (opts.email && coach.email && opts.actor.google_refresh_token) {
    try {
      emailed = await sendCoachHtmlEmail(opts.actor, {
        to: coach.email,
        cc: '',
        subject: 'Your theLeadershipWell account has been cancelled',
        html: buildCancelEmailHtml({
          firstName: (coach.name || '').split(' ')[0] || 'there',
          effective,
          accessEndsAt: periodEnd,
          hadSubscription: stripeCancelled,
          supervisorName: opts.actor.name,
        }),
      })
    } catch (e) {
      console.error('[coach cancel] confirmation email failed:', e)
    }
  }

  return {
    effective,
    plan: effective === 'now' ? 'lapsed' : coach.plan ?? 'lapsed',
    subscription_status: (updates.subscription_status as string | null) ?? null,
    access_ends_at: effective === 'period_end' ? periodEnd : null,
    stripe_cancelled: stripeCancelled,
    emailed,
  }
}

function buildCancelEmailHtml(o: {
  firstName: string
  effective: 'now' | 'period_end'
  accessEndsAt: string | null
  hadSubscription: boolean
  supervisorName: string
}): string {
  const base = getBaseUrl()
  const endsOn = o.accessEndsAt
    ? new Date(o.accessEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null
  const accessLine =
    o.effective === 'period_end' && endsOn
      ? `Your access continues through <strong>${endsOn}</strong>, the end of the period you have already paid for. After that the app closes to you and nothing further is charged.`
      : 'Your access to the app has ended today.'
  const billingLine = o.hadSubscription
    ? 'Your subscription has been cancelled with Stripe — there will be no further charges.'
    : 'There is no active subscription on your account, so nothing is being charged.'
  return `
<div style="font-family:Georgia,'Times New Roman',serif;color:#111226;line-height:1.55;max-width:520px;">
  <p style="margin:0 0 16px;">Hi ${o.firstName},</p>
  <p style="margin:0 0 16px;">As requested, we have cancelled your theLeadershipWell coaching platform account.</p>
  <p style="margin:0 0 16px;">${billingLine}</p>
  <p style="margin:0 0 16px;">${accessLine}</p>
  <p style="margin:0 0 16px;">Your work is yours. Your notes, transcripts, scorecards, session plans and client records are kept, and you can download all of it as a single file at any time from <a href="${base}/subscription" style="color:#1a1f5e;">${base}/subscription</a> — sign in with the same Google account. If you decide to come back, subscribing again from that same page reopens everything exactly where you left it.</p>
  <p style="margin:0 0 16px;">If this cancellation was not what you intended, just reply to this email.</p>
  <p style="margin:0;">Warmly,<br/>${o.supervisorName || 'theLeadershipWell'}</p>
</div>`
}
