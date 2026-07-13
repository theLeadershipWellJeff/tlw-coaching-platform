/**
 * POST /api/billing/invoices/[id]/approve
 *
 * Approves a single draft invoice. Records approved_by (coach email) and
 * approved_at. Moves status draft → approved.
 *
 * Nothing sends or charges — that is Phase 4.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: invoice, error: fetchErr } = await supabase
    .from('invoices')
    .select('id, status, total')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (invoice.status !== 'draft')
    return NextResponse.json({ error: `Cannot approve an invoice with status '${invoice.status}'` }, { status: 409 })
  // Discount lines can drag a draft to zero or below — Stripe can't charge that.
  if (!((invoice as any).total > 0))
    return NextResponse.json({ error: 'Invoice total must be greater than zero after discounts' }, { status: 409 })

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('invoices')
    .update({
      status: 'approved',
      approved_by: coach.email,
      approved_at: now,
      updated_at: now,
    })
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoice: data })
}
