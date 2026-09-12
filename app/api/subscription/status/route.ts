import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import { coachAccess, COACH_PRICING } from '@/lib/access'
import { coachSubscriptionSummary, configuredCoachIntervals } from '@/lib/billing/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/subscription/status — what the Account → Subscription card and the
 * wall show: plan, locked?, the live Stripe summary (trial end / renewal /
 * cancel-at-period-end) when a subscription exists, and which intervals are
 * on sale. Works while locked.
 */
export async function GET() {
  const supabase = getSupabaseAdmin()
  let coach
  try {
    coach = await requireCoach(supabase, { allowLocked: true })
  } catch (e) {
    return toErrorResponse(e)
  }
  const access = coachAccess(coach)
  const subId = (coach as any).stripe_subscription_id as string | null
  const summary = subId ? await coachSubscriptionSummary(subId) : null
  return NextResponse.json({
    plan: access.plan,
    locked: access.locked,
    reason: access.reason,
    planNote: (coach as any).plan_note ?? null,
    subscriptionStatus: (coach as any).subscription_status ?? null,
    hasCustomer: !!(coach as any).stripe_customer_id,
    subscription: summary,
    pricing: COACH_PRICING,
    intervals: configuredCoachIntervals(),
  })
}
