/**
 * POST /api/billing/accounts/[id]/payment-method/remove
 *
 * Revoke a stored mandate: detach the card in Stripe, set status → 'removed',
 * clear the display fields, and log a 'removed' authorization event.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getBillingActor } from '@/lib/billing/access'
import { detachPaymentMethod } from '@/lib/billing/stripe'
import { logAuthorizationEvent } from '@/lib/billing/payment-methods'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const actor = await getBillingActor(supabase)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.canWrite) return NextResponse.json({ error: 'Read-only role' }, { status: 403 })

  const { data: account } = await supabase
    .from('billing_accounts')
    .select('id, stripe_payment_method_id, payment_method_status')
    .eq('id', params.id)
    .eq('coach_id', actor.coach.id)
    .maybeSingle()
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const pmId = (account as any).stripe_payment_method_id as string | null
  if (pmId) {
    try {
      await detachPaymentMethod(pmId)
    } catch (e: any) {
      return NextResponse.json({ error: `Could not detach card: ${e.message}` }, { status: 502 })
    }
  }

  await supabase
    .from('billing_accounts')
    .update({
      payment_method_status: 'removed',
      stripe_payment_method_id: null,
      payment_method_brand: null,
      payment_method_last4: null,
      payment_method_exp_month: null,
      payment_method_exp_year: null,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', params.id)

  await logAuthorizationEvent(supabase, {
    billingAccountId: params.id,
    coachId: actor.coach.id,
    event: 'removed',
  })

  return NextResponse.json({ ok: true })
}
