import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import {
  getOrCreateCoachStripeCustomer,
  createCoachSubscriptionCheckout,
  type CoachBillingInterval,
} from '@/lib/billing/stripe'
import { getBaseUrl } from '@/lib/url'

export const runtime = 'nodejs'

/**
 * POST /api/subscription/checkout {interval: 'month'|'year'} — the signed-in
 * coach starts (or restarts) their own platform subscription. Reachable from
 * the paywall (a lapsed coach) and from Account → Subscription (a beta coach
 * converting). No free trial here: both have already used the platform.
 * Promotion codes are accepted on the hosted page. The plan flips to
 * 'paying' when the checkout.session.completed webhook lands, never here.
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin()
  let coach
  try {
    coach = await requireCoach(supabase, { allowLocked: true })
  } catch (e) {
    return toErrorResponse(e)
  }

  const body = await req.json().catch(() => ({}))
  const interval: CoachBillingInterval = body?.interval === 'year' ? 'year' : 'month'

  if (
    (coach as any).stripe_subscription_id &&
    ['active', 'trialing', 'past_due'].includes((coach as any).subscription_status ?? '') &&
    coach.plan === 'paying'
  ) {
    return NextResponse.json({ error: 'You already have a live subscription — manage it from the billing portal.' }, { status: 409 })
  }

  try {
    const customerId = await getOrCreateCoachStripeCustomer({
      stripeCustomerId: (coach as any).stripe_customer_id ?? null,
      coachId: coach.id,
      name: coach.name,
      email: coach.email,
    })
    if (customerId !== (coach as any).stripe_customer_id) {
      await supabase
        .from('coaches')
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() } as any)
        .eq('id', coach.id)
    }
    const base = getBaseUrl()
    const session = await createCoachSubscriptionCheckout({
      customerId,
      coachId: coach.id,
      interval,
      successUrl: `${base}/subscription/return?state=success`,
      cancelUrl: `${base}/subscription/return?state=cancelled`,
    })
    if (!session.url) throw new Error('Stripe returned no checkout URL')
    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Stripe checkout failed' }, { status: 500 })
  }
}
