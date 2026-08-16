import { NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { resolvePortalBillingAccount } from '@/lib/portal/billing'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getOrCreateStripeCustomer, createSetupCheckoutSession } from '@/lib/billing/stripe'
import { getBaseUrl } from '@/lib/url'

export const runtime = 'nodejs'

/**
 * Start a Stripe hosted Checkout session (setup mode) so the client can put a
 * card on file themselves.
 *
 * Card details are entered on Stripe's page and never touch a TLW page — the
 * same PCI SAQ-A posture as the coach-initiated authorization flow, reusing its
 * helpers rather than duplicating them. The `setup_intent.succeeded` webhook
 * already attaches the card and flips the account to `active`, so there is no
 * new completion path to secure here.
 *
 * 404s (never 403) when the client has no account or is on an enterprise
 * account, so the response can't confirm an account exists.
 */
export async function POST() {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await resolvePortalBillingAccount(clientId)
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const supabase = getSupabaseAdmin()
    const customerId = await getOrCreateStripeCustomer({
      stripeCustomerId: account.stripeCustomerId,
      accountName: account.name,
      billingEmail: account.billingEmail,
    })
    // Persist a newly minted customer so later charges reuse it, exactly as the
    // coach-initiated authorization flow does.
    if (!account.stripeCustomerId) {
      await supabase.from('billing_accounts').update({ stripe_customer_id: customerId }).eq('id', account.id)
    }
    const base = getBaseUrl()
    const session = await createSetupCheckoutSession({
      customerId,
      billingAccountId: account.id,
      coachId: account.coachId,
      successUrl: `${base}/portal?card=saved`,
      cancelUrl: `${base}/portal`,
    })
    if (!session.url) throw new Error('Stripe returned no checkout URL')
    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    console.error('portal card setup failed:', e)
    return NextResponse.json(
      { error: 'Could not start the secure card form. Please try again.' },
      { status: 502 }
    )
  }
}
