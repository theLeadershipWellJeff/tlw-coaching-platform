import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getCoachByEmail } from '@/lib/coach'
import { createCoachSignupCheckout, configuredCoachIntervals, type CoachBillingInterval } from '@/lib/billing/stripe'
import { COACH_PRICING } from '@/lib/access'
import { getBaseUrl } from '@/lib/url'

export const runtime = 'nodejs'

/**
 * POST /api/join/checkout {name, email, interval} — PUBLIC. Starts the
 * self-serve signup: a Stripe hosted Checkout in subscription mode with the
 * 14-day trial (card required) and promotion codes enabled. No coaches row is
 * created here — that happens on completion (lib/coach-signup.ts), so an
 * abandoned checkout leaves nothing behind. An email that already has a
 * coaches row gets NO trial (they have already used the platform); their row
 * is updated on completion, never duplicated.
 *
 * Abuse surface: creating Checkout sessions is cheap and Stripe rate-limits
 * its own API; the inputs are validated and nothing is written on our side.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const name = String(body?.name ?? '').trim().slice(0, 120)
  const email = String(body?.email ?? '').trim().toLowerCase().slice(0, 200)
  const interval: CoachBillingInterval = body?.interval === 'year' ? 'year' : 'month'

  if (!name) return NextResponse.json({ error: 'Please tell us your name.' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }
  if (!configuredCoachIntervals().includes(interval)) {
    return NextResponse.json({ error: 'That plan is not available yet.' }, { status: 400 })
  }

  let trialDays: number = COACH_PRICING.trialDays
  try {
    const existing = await getCoachByEmail(getSupabaseAdmin(), email)
    if (existing) trialDays = 0
  } catch (e) {
    // A lookup hiccup should not block a signup; the trial is the only thing at stake.
    console.error('[join] coach lookup failed:', e)
  }

  try {
    const base = getBaseUrl()
    const session = await createCoachSignupCheckout({
      email,
      name,
      interval,
      trialDays,
      successUrl: `${base}/join/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/join?cancelled=1`,
    })
    if (!session.url) throw new Error('Stripe returned no checkout URL')
    return NextResponse.json({ url: session.url, trialDays })
  } catch (e: any) {
    console.error('[join] checkout failed:', e)
    return NextResponse.json({ error: 'We could not start checkout just now. Please try again in a moment.' }, { status: 500 })
  }
}
