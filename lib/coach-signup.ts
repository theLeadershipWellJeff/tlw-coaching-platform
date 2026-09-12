/**
 * Self-serve coach signup — turning a completed Stripe Checkout into a
 * `coaches` row (the sign-in allowlist) and a sign-in invitation.
 *
 * Two callers converge here and BOTH must be safe to run twice:
 *   - the checkout.session.completed webhook (may land first, or minutes
 *     later, or be retried);
 *   - the /join/welcome page the coach is redirected to (so the row exists by
 *     the time they click "Sign in", even if the webhook is slow).
 *
 * Identity: the coaches row is keyed on the email typed at checkout, and the
 * sign-in gate matches the Google account on that same email — the invite
 * email says so in bold. An existing row (a beta coach subscribing from the
 * public page, a lapsed coach coming back) is UPDATED, never duplicated.
 */
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Coach, Database } from '@/lib/supabase/types'
import { getCoachByEmail } from '@/lib/coach'
import { tagCoachSubscription } from '@/lib/billing/stripe'
import { logAdminAction } from '@/lib/admin/audit'
import { sendCoachInviteEmail } from '@/lib/admin/coach-invite'

type Admin = SupabaseClient<Database>

export type ProvisionResult =
  | { ok: true; coach: Coach; created: boolean; invited: boolean; inviteError?: string }
  | { ok: false; error: string }

/** The firm's own coach row — sender of last resort for system mail. */
export async function houseCoach(supabase: Admin): Promise<Coach | null> {
  const email = (process.env.DEFAULT_COACH_EMAIL || '').trim().toLowerCase()
  if (email) {
    const c = await getCoachByEmail(supabase, email)
    if (c) return c
  }
  const { data } = await supabase
    .from('coaches')
    .select('*')
    .eq('role', 'supervisor')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as Coach | null) ?? null
}

export async function provisionCoachFromCheckout(
  supabase: Admin,
  session: Stripe.Checkout.Session
): Promise<ProvisionResult> {
  if (session.mode !== 'subscription') return { ok: false, error: 'Not a subscription checkout.' }
  // Stripe marks the session complete once the subscription is created — for a
  // trial, payment_status is 'no_payment_required'; for an immediate charge, 'paid'.
  if (session.status !== 'complete') return { ok: false, error: 'Checkout is not complete.' }

  const email = (session.metadata?.tlw_signup_email || session.customer_details?.email || session.customer_email || '')
    .trim()
    .toLowerCase()
  if (!email) return { ok: false, error: 'Checkout carries no email.' }
  const name = (session.metadata?.tlw_signup_name || session.customer_details?.name || email.split('@')[0]).trim()

  const sub = typeof session.subscription === 'string' ? null : (session.subscription as Stripe.Subscription | null)
  const subId = typeof session.subscription === 'string' ? session.subscription : sub?.id ?? null
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null
  const status = sub?.status ?? 'active'
  const now = new Date().toISOString()

  const existing = await getCoachByEmail(supabase, email)
  let coach: Coach
  let created = false
  if (!existing) {
    const { data, error } = await supabase
      .from('coaches')
      .insert({
        name,
        email,
        role: 'coach',
        timezone: '',
        plan: 'paying',
        plan_note: 'self-serve signup',
        stripe_customer_id: customerId,
        stripe_subscription_id: subId,
        subscription_status: status,
      } as any)
      .select('*')
      .single()
    if (error) {
      // A concurrent provision (webhook + welcome page) can race the insert —
      // the unique email makes the loser re-read the winner's row.
      const winner = error.code === '23505' ? await getCoachByEmail(supabase, email) : null
      if (!winner) return { ok: false, error: `Could not create the coach account: ${error.message}` }
      coach = winner
    } else {
      coach = data as Coach
      created = true
    }
  } else {
    await supabase
      .from('coaches')
      .update({
        plan: 'paying',
        stripe_customer_id: customerId ?? (existing as any).stripe_customer_id ?? null,
        stripe_subscription_id: subId ?? (existing as any).stripe_subscription_id ?? null,
        subscription_status: status,
        updated_at: now,
      } as any)
      .eq('id', existing.id)
    coach = { ...(existing as any), plan: 'paying', stripe_customer_id: customerId, stripe_subscription_id: subId, subscription_status: status }
  }

  // Later customer.subscription.* events resolve the coach by this metadata
  // (the webhook also falls back to the stored subscription id). Best-effort.
  try {
    await tagCoachSubscription({ subscriptionId: subId, customerId, coachId: coach.id })
  } catch (e) {
    console.error('[coach signup] could not tag the subscription:', e)
  }

  // Invite once per checkout session — the audit row is the dedupe.
  let invited = false
  let inviteError: string | undefined
  const { data: prior } = await supabase
    .from('admin_audit_log' as any)
    .select('id')
    .eq('action', 'coach_invite_sent')
    .eq('target_coach_id', coach.id)
    .contains('detail', { checkout_session: session.id })
    .limit(1)
  if (!prior || prior.length === 0) {
    const sender = await houseCoach(supabase)
    const sent = await sendCoachInviteEmail({ coach, sender })
    invited = sent.ok
    inviteError = sent.ok ? undefined : sent.error
    if (sent.ok) {
      await logAdminAction(supabase, {
        actorCoachId: null,
        action: 'coach_invite_sent',
        targetCoachId: coach.id,
        detail: { to: coach.email, via: sent.via, source: 'signup', checkout_session: session.id, warning: sent.warning ?? null },
      })
    }
    if (created) {
      await logAdminAction(supabase, {
        actorCoachId: null,
        action: 'coach_signup',
        targetCoachId: coach.id,
        detail: { email, checkout_session: session.id, subscription: subId, status },
      })
    }
  }

  return { ok: true, coach, created, invited, inviteError }
}
