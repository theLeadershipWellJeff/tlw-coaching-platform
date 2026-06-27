/**
 * POST /api/billing/invoices/[id]/send
 *
 * Sends an approved invoice via Stripe.
 * - arrears / per_engagement  → Stripe hosted invoice, emailed to billing_email
 * - subscription              → off-session PaymentIntent
 *
 * On Stripe failure the stripe_error is written to the invoice and returned
 * as { ok: false, error } with HTTP 402 so the UI can surface it inline.
 * The invoice status stays 'approved' so the coach can retry or void.
 *
 * Requires STRIPE_SECRET_KEY in env.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { sendInvoice } from '@/lib/billing/send'
import { scheduleReminder } from '@/lib/billing/reminders'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Quick status check before doing anything.
  const { data: check } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (!check) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (check.status !== 'approved') {
    return NextResponse.json(
      { error: `Invoice must be in 'approved' status to send (current: ${check.status})` },
      { status: 409 },
    )
  }

  try {
    const result = await sendInvoice(supabase, coach.id, params.id, coach as any)
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 402 })
    }
    // Schedule a 14-day follow-up reminder (best-effort, never blocks the response).
    scheduleReminder(supabase, params.id).catch(() => {})
    return NextResponse.json({ ok: true, stripeId: result.stripeId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
