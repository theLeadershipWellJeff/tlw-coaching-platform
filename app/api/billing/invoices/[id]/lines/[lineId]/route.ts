import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

type Params = { params: { id: string; lineId: string } }

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

export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify invoice belongs to coach and is draft.
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (invoice.status !== 'draft')
    return NextResponse.json({ error: 'Lines can only be edited on draft invoices' }, { status: 409 })

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}

  if ('description' in body) updates.description = String(body.description).trim()
  if ('quantity' in body) updates.quantity = Number(body.quantity)
  if ('unit_amount' in body) updates.unit_amount = Number(body.unit_amount)

  // Recalculate amount if quantity or unit_amount changed.
  if ('quantity' in updates || 'unit_amount' in updates) {
    const { data: existing } = await supabase
      .from('invoice_lines')
      .select('quantity, unit_amount')
      .eq('id', params.lineId)
      .eq('invoice_id', params.id)
      .maybeSingle()
    if (existing) {
      const qty = Number(updates.quantity ?? existing.quantity)
      const unit = Number(updates.unit_amount ?? existing.unit_amount)
      updates.amount = Math.round(qty * unit * 100) / 100
    }
  }

  const { data, error } = await supabase
    .from('invoice_lines')
    .update(updates as any)
    .eq('id', params.lineId)
    .eq('invoice_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recalcTotal(supabase, params.id)
  return NextResponse.json({ line: data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (invoice.status !== 'draft')
    return NextResponse.json({ error: 'Lines can only be removed from draft invoices' }, { status: 409 })

  const { error } = await supabase
    .from('invoice_lines')
    .delete()
    .eq('id', params.lineId)
    .eq('invoice_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recalcTotal(supabase, params.id)
  return NextResponse.json({ ok: true })
}
