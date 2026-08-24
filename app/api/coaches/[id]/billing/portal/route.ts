import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireSupervisor, toErrorResponse } from '@/lib/api-handler'
import { createBillingPortalSession } from '@/lib/billing/stripe'
import { getBaseUrl } from '@/lib/url'

export const runtime = 'nodejs'

/**
 * POST /api/coaches/[id]/billing/portal — a Stripe customer Billing Portal
 * link for this coach (update card, view invoices, cancel). Supervisor-only;
 * the returned URL can be opened or sent to the coach. Requires the Customer
 * portal to be configured once in the Stripe Dashboard.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin()
  try {
    await requireSupervisor(supabase)
  } catch (e) {
    return toErrorResponse(e)
  }

  const { data: coach } = await supabase
    .from('coaches')
    .select('id, stripe_customer_id')
    .eq('id', params.id)
    .maybeSingle()
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
  if (!(coach as any).stripe_customer_id) {
    return NextResponse.json({ error: 'This coach has no Stripe billing set up yet.' }, { status: 400 })
  }

  try {
    const session = await createBillingPortalSession(
      (coach as any).stripe_customer_id,
      `${getBaseUrl()}/business-center/coaches`
    )
    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Stripe billing portal failed' }, { status: 500 })
  }
}
