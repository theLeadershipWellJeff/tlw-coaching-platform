/**
 * POST /api/billing/accounts/[id]/payment-method/reconfirm
 *
 * A card retained at engagement close is marked `dormant`; it cannot be charged
 * until re-confirmed before the first charge of a new engagement (§4.3, decision
 * record). This is the coach's affirmative re-confirmation that the client has
 * returned: it flips a dormant card back to `active`, stamps reconfirmed_at, and
 * logs a 'reconfirmed' event. Only a dormant card can be reconfirmed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getBillingActor } from '@/lib/billing/access'
import { logAuthorizationEvent, setPaymentMethodStatus } from '@/lib/billing/payment-methods'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const actor = await getBillingActor(supabase)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.canWrite) return NextResponse.json({ error: 'Read-only role' }, { status: 403 })

  const { data: account } = await supabase
    .from('billing_accounts')
    .select('id, payment_method_status, stripe_payment_method_id')
    .eq('id', params.id)
    .eq('coach_id', actor.coach.id)
    .maybeSingle()
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if ((account as any).payment_method_status !== 'dormant') {
    return NextResponse.json({ error: 'Only a dormant card can be re-confirmed.' }, { status: 409 })
  }
  if (!(account as any).stripe_payment_method_id) {
    return NextResponse.json({ error: 'No stored card to re-confirm — send a new authorization link.' }, { status: 409 })
  }

  await setPaymentMethodStatus(supabase, params.id, 'active', { reconfirmed_at: new Date().toISOString() })
  await logAuthorizationEvent(supabase, { billingAccountId: params.id, coachId: actor.coach.id, event: 'reconfirmed' })

  return NextResponse.json({ ok: true })
}
