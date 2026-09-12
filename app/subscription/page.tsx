import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoachAny } from '@/lib/coach'
import { coachAccess } from '@/lib/access'
import { SubscriptionWall } from './SubscriptionWall'

export const dynamic = 'force-dynamic'

/**
 * THE PAYWALL. A signed-in coach whose plan is lapsed lands here from the
 * authenticated layout and can do exactly three things: subscribe (Stripe
 * hosted Checkout), download their data (a ZIP of their whole tenant), or
 * sign out. Deliberately outside the app shell — no sidebar, no navigation,
 * nothing that reads tenant data. A coach who still has access is sent to
 * the dashboard (their subscription lives on Account).
 */
export default async function SubscriptionPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/')
  const coach = await getSessionCoachAny(getSupabaseAdmin())
  if (!coach) redirect('/auth/error?error=AccessDenied')
  if (!coachAccess(coach).locked) redirect('/dashboard')

  return (
    <SubscriptionWall
      name={coach.name || coach.email}
      email={coach.email}
      subscriptionStatus={(coach as any).subscription_status ?? null}
      hasCustomer={!!(coach as any).stripe_customer_id}
    />
  )
}
