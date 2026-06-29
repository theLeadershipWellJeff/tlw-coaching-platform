import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

// Manually mark an invoice as paid (e.g. bank transfer that bypasses Stripe).
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
  if (!['sent', 'overdue', 'failed'].includes(existing.status)) {
    return NextResponse.json(
      { error: 'Only sent, overdue, or failed invoices can be marked paid' },
      { status: 409 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: body.paid_at ?? now,
      updated_at: now,
    } as any)
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoice: data })
}
