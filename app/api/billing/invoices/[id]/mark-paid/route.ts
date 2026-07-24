import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { markStripeInvoicePaidOutOfBand } from '@/lib/billing/stripe'
import { cancelReminders } from '@/lib/billing/reminders'
import { sendPaymentThankYou } from '@/lib/billing/send'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

/**
 * Manually mark an invoice paid (bank transfer, check, cash — a payment that
 * bypassed Stripe's card flow). Beyond flipping our status we:
 *  1. reconcile Stripe via `paid_out_of_band` so the invoice reads Paid in the
 *     Dashboard, the customer's history, and exports (single source of truth);
 *  2. cancel any pending payment reminders;
 *  3. send the client a branded thank-you (best-effort, logged to communications).
 *
 * Our status is set to 'paid' BEFORE the Stripe reconcile, so the `invoice.paid`
 * webhook that `paid_out_of_band` triggers sees us already-paid and skips its own
 * thank-you — the client gets exactly one.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing } = (await supabase
    .from('invoices')
    .select('id, status, stripe_invoice_id, total, currency, period_start, period_end, billing_accounts ( name, billing_email, billing_cc )')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()) as {
    data:
      | {
          id: string
          status: string
          stripe_invoice_id: string | null
          total: number
          currency: string
          period_start: string | null
          period_end: string | null
          billing_accounts: { name: string; billing_email: string; billing_cc: string | null } | null
        }
      | null
  }

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!['sent', 'overdue', 'failed'].includes(existing.status)) {
    return NextResponse.json(
      { error: 'Only sent, overdue, or failed invoices can be marked paid' },
      { status: 409 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const now = new Date().toISOString()

  // Flip to paid first — guarded on the current status so a concurrent webhook
  // payment can't be double-counted. `.select()` tells us if WE made the transition.
  const { data: updated, error } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: body.paid_at ?? now,
      updated_at: now,
    } as any)
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .in('status', ['sent', 'overdue', 'failed'])
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated) {
    // Someone/thing else already paid it (e.g. the Stripe webhook) — that path
    // owns the reconcile + thank-you, so just report the current state.
    const { data: current } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', params.id)
      .eq('coach_id', coach.id)
      .maybeSingle()
    return NextResponse.json({ invoice: current, stripeSynced: true, emailed: false })
  }

  // Cancel any pending reminders now that it's settled — best-effort.
  await cancelReminders(supabase, params.id).catch(() => {})

  // Reconcile Stripe so the invoice reads Paid everywhere it lives.
  let stripeSynced = true
  let stripeWarning: string | undefined
  if (existing.stripe_invoice_id) {
    const res = await markStripeInvoicePaidOutOfBand(existing.stripe_invoice_id)
    stripeSynced = res.synced
    if (!res.synced) stripeWarning = res.reason
  }

  // Branded thank-you to the client — best-effort, never blocks the paid state.
  const account = existing.billing_accounts
  let emailed = false
  if (account) {
    emailed = await sendPaymentThankYou(supabase, coach as any, coach.id, account, {
      total: existing.total,
      currency: existing.currency,
      period_start: existing.period_start,
      period_end: existing.period_end,
    }).catch(() => false)
  }

  return NextResponse.json({ invoice: updated, stripeSynced, stripeWarning, emailed })
}
