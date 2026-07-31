/**
 * POST /api/billing/accounts/[id]/authorization/send
 *
 * Mint (or reuse) the account's single-purpose authorization token and email the
 * client an invitation to store a card for automatic billing.
 *
 * The AGREEMENT GATE (§4.2) is enforced here, server-side: the link cannot be
 * sent unless every client attached to the account has agreement_on_file = true.
 * The send is also rate-limited to 5 per account per hour (§10). Every send logs
 * a link_sent event + a communications row (type 'billing_authorization').
 *
 * Body: { announcement?: boolean } — when true this is the one-time "new option"
 * announcement (Phase 6), which additionally excludes CA-owned accounts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getBillingActor } from '@/lib/billing/access'
import { getOrCreateStripeCustomer } from '@/lib/billing/stripe'
import {
  accountPassesAgreementGate,
  accountIsCoachAccountableOwned,
  authorizationSendRateLimited,
  ensureAuthorizationToken,
  logAuthorizationEvent,
} from '@/lib/billing/payment-methods'
import { sendAuthorizationInvite } from '@/lib/billing/receipt'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const actor = await getBillingActor(supabase)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.canWrite) return NextResponse.json({ error: 'Read-only role' }, { status: 403 })
  const coach = actor.coach

  const body = await req.json().catch(() => ({})) as { announcement?: boolean }

  const { data: account } = await supabase
    .from('billing_accounts')
    .select('*')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Phase 6 announcement excludes accounts still billed through Coach Accountable.
  if (body.announcement && (await accountIsCoachAccountableOwned(supabase, params.id))) {
    return NextResponse.json(
      { error: 'This account is still billed through Coach Accountable — excluded from the authorization announcement.' },
      { status: 422 },
    )
  }

  // Agreement gate — hard precondition.
  const gate = await accountPassesAgreementGate(supabase, params.id)
  if (!gate.ok) {
    return NextResponse.json(
      {
        error: 'Cannot send an authorization link: a signed agreement must be on file for every client on this account first.',
        missing: gate.missing,
      },
      { status: 422 },
    )
  }

  // Rate limit.
  if (await authorizationSendRateLimited(supabase, params.id)) {
    return NextResponse.json({ error: 'Too many authorization links sent in the last hour. Try again later.' }, { status: 429 })
  }

  if (!(account as any).billing_email) {
    return NextResponse.json({ error: 'This account has no billing email.' }, { status: 422 })
  }

  // Ensure a Stripe customer exists so the setup session can attach to it.
  let stripeCustomerId: string
  try {
    stripeCustomerId = await getOrCreateStripeCustomer({
      stripeCustomerId: (account as any).stripe_customer_id,
      accountName: (account as any).name,
      billingEmail: (account as any).billing_email,
    })
  } catch (e: any) {
    return NextResponse.json({ error: `Stripe customer error: ${e.message}` }, { status: 502 })
  }
  if (!(account as any).stripe_customer_id) {
    await supabase.from('billing_accounts').update({ stripe_customer_id: stripeCustomerId }).eq('id', params.id)
  }

  const token = await ensureAuthorizationToken(supabase, params.id, (account as any).authorization_token ?? null)

  // Send the invitation (best-effort transport; a Gmail hiccup is reported).
  const sent = await sendAuthorizationInvite(supabase, coach as any, coach.id, {
    accountName: (account as any).name,
    billingEmail: (account as any).billing_email,
    billingCc: (account as any).billing_cc ?? null,
    token,
    announcement: !!body.announcement,
  })

  await logAuthorizationEvent(supabase, {
    billingAccountId: params.id,
    coachId: coach.id,
    event: 'link_sent',
    detail: { announcement: !!body.announcement, emailed: sent },
  })

  if (!sent) {
    return NextResponse.json({ ok: false, error: 'Could not email the authorization link (check the coach Gmail connection).' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
