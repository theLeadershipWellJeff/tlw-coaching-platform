/**
 * Invoice line CRUD — only on draft invoices.
 *
 * GET    /api/billing/invoices/[id]/lines
 * POST   /api/billing/invoices/[id]/lines          — add a line
 * PATCH  /api/billing/invoices/[id]/lines/[lineId] — edit description/amount
 * DELETE /api/billing/invoices/[id]/lines/[lineId] — remove a line
 *
 * Every mutation recalculates and saves the invoice subtotal/total.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

async function requireDraftInvoice(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  coachId: string,
  invoiceId: string,
) {
  const { data } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('id', invoiceId)
    .eq('coach_id', coachId)
    .maybeSingle()
  return data
}

async function recalcTotal(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  invoiceId: string,
) {
  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('amount')
    .eq('invoice_id', invoiceId)
  const total = Math.round(
    ((lines ?? []).reduce((s: number, l: any) => s + (l.amount ?? 0), 0)) * 100,
  ) / 100
  await supabase
    .from('invoices')
    .update({ subtotal: total, total, updated_at: new Date().toISOString() })
    .eq('id', invoiceId)
}

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invoice = await requireDraftInvoice(supabase, coach.id, params.id)
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('invoice_lines')
    .select('*')
    .eq('invoice_id', params.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lines: data })
}

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invoice = await requireDraftInvoice(supabase, coach.id, params.id)
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (invoice.status !== 'draft')
    return NextResponse.json({ error: 'Lines can only be added to draft invoices' }, { status: 409 })

  const body = await req.json().catch(() => ({}))
  const { description, quantity = 1, unit_amount, coachee_id, source = 'session' } = body

  if (!description?.trim()) return NextResponse.json({ error: 'description is required' }, { status: 400 })
  if (!unit_amount || isNaN(Number(unit_amount)))
    return NextResponse.json({ error: 'unit_amount is required' }, { status: 400 })

  const qty = Number(quantity)
  const unit = Number(unit_amount)
  const amount = Math.round(qty * unit * 100) / 100

  const { data, error } = await supabase
    .from('invoice_lines')
    .insert({
      invoice_id: params.id,
      coachee_id: coachee_id ?? null,
      description: description.trim(),
      quantity: qty,
      unit_amount: unit,
      amount,
      source,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recalcTotal(supabase, params.id)
  return NextResponse.json({ line: data }, { status: 201 })
}

// PATCH and DELETE operate on a specific line — handled via a sub-route below.
// Included here as stubs so the file exports are complete; the [lineId] route
// is in a sub-directory.
