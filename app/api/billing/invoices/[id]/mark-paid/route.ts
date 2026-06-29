/**
 * POST /api/billing/invoices/[id]/mark-paid
 * Body: { note?: string }  e.g. "Bank transfer received 2026-06-29"
 *
 * Manually marks a sent or overdue invoice as paid. Used when payment
 * arrives outside Stripe (wire / ACH / check). Sets status='paid',
 * paid_at=now, and records an optional payment_note.
 *
 * Idempotent — calling again on an already-paid invoice is a no-op.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { cancelReminders } from '@/lib/billing/reminders'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'void')
    return NextResponse.json({ error: 'Cannot mark a voided invoice as paid' }, { status: 409 })

  // Already paid — idempotent.
  if (existing.status === 'paid') {
    const { data } = await supabase.from('invoices').select('*').eq('id', params.id).single()
    return NextResponse.json({ invoice: data })
  }

  const body = await req.json().catch(() => ({}))
  const note: string | null = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: now,
      payment_note: note,
      stripe_error: null,
      updated_at: now,
    } as any)
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Cancel any pending payment reminders.
  await cancelReminders(supabase, params.id).catch(() => {})

  return NextResponse.json({ invoice: data })
}
