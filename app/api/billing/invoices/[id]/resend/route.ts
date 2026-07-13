/**
 * POST /api/billing/invoices/[id]/resend
 *
 * Re-delivers an already-sent invoice: Stripe re-emails the hosted invoice to
 * the billing email, and the branded cover email (coach note + tracked
 * "View & pay" link) goes out again from the coach's Gmail. Allowed for
 * sent / overdue / failed invoices with a stripe_invoice_id. Status is
 * unchanged — this is delivery, not a state transition; last_resent_at is
 * stamped for the audit trail.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { resendInvoice } from '@/lib/billing/send'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: check } = await supabase
    .from('invoices')
    .select('id, status, stripe_invoice_id')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (!check) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!['sent', 'overdue', 'failed'].includes(check.status)) {
    return NextResponse.json(
      { error: `Invoice must be sent, overdue, or failed to re-send (current: ${check.status})` },
      { status: 409 },
    )
  }
  if (!(check as any).stripe_invoice_id) {
    return NextResponse.json(
      { error: 'This invoice has no Stripe invoice to re-send. Use Send instead.' },
      { status: 409 },
    )
  }

  try {
    const result = await resendInvoice(supabase, coach.id, params.id, coach as any)
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 402 })
    }
    return NextResponse.json({ ok: true, stripeId: result.stripeId, resentAt: new Date().toISOString() })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
