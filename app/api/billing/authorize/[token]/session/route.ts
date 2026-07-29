/**
 * POST /api/billing/authorize/[token]/session
 *
 * PUBLIC — the single-purpose authorization token is the credential. Creates a
 * Stripe Checkout session in `setup` mode and returns its redirect URL. Card
 * entry happens on Stripe's hosted page (PCI SAQ-A — never on a TLW page).
 *
 * On completion Stripe fires setup_intent.succeeded, which attaches the card and
 * flips the account to `active` (see the webhook handler).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getOrCreateStripeCustomer, createSetupCheckoutSession } from '@/lib/billing/stripe'
import { getBaseUrl } from '@/lib/url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: { token: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const token = params.token?.trim()
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: account } = await supabase
    .from('billing_accounts')
    .select('id, coach_id, name, billing_email, stripe_customer_id, payment_method_status')
    .eq('authorization_token', token)
    .maybeSingle()

  if (!account) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  if ((account as any).payment_method_status === 'active') {
    return NextResponse.json({ error: 'A card is already on file for this account.' }, { status: 409 })
  }

  // Ensure a Stripe customer to attach the setup intent to.
  let customerId: string
  try {
    customerId = await getOrCreateStripeCustomer({
      stripeCustomerId: (account as any).stripe_customer_id,
      accountName: (account as any).name,
      billingEmail: (account as any).billing_email,
    })
  } catch (e: any) {
    return NextResponse.json({ error: `Payment setup unavailable: ${e.message}` }, { status: 502 })
  }
  if (!(account as any).stripe_customer_id) {
    await supabase.from('billing_accounts').update({ stripe_customer_id: customerId }).eq('id', (account as any).id)
  }

  const base = getBaseUrl()
  try {
    const session = await createSetupCheckoutSession({
      customerId,
      billingAccountId: (account as any).id,
      coachId: (account as any).coach_id,
      successUrl: `${base}/billing/authorize/${token}/complete`,
      cancelUrl: `${base}/billing/authorize/${token}`,
    })
    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Could not start card setup.' }, { status: 502 })
  }
}
