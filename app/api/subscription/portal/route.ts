import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import { createBillingPortalSession } from '@/lib/billing/stripe'
import { getBaseUrl } from '@/lib/url'

export const runtime = 'nodejs'

/**
 * POST /api/subscription/portal — the signed-in coach's own Stripe Billing
 * Portal (card, invoices, cancel, switch monthly/annual if the portal config
 * allows it). Works while locked so a lapsed coach can fix a card.
 */
export async function POST() {
  const supabase = getSupabaseAdmin()
  let coach
  try {
    coach = await requireCoach(supabase, { allowLocked: true })
  } catch (e) {
    return toErrorResponse(e)
  }
  const customerId = (coach as any).stripe_customer_id as string | null
  if (!customerId) {
    return NextResponse.json({ error: 'No billing account yet — start a subscription first.' }, { status: 400 })
  }
  try {
    const session = await createBillingPortalSession(customerId, `${getBaseUrl()}/account`)
    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Stripe billing portal failed' }, { status: 500 })
  }
}
