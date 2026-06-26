import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      billing_accounts ( id, name, type, billing_email ),
      invoice_lines ( * ),
      invoice_reminders ( * )
    `)
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ invoice: data })
}

export async function PATCH(req: NextRequest, { params }: Params) {
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

  // Only draft invoices can have lines/metadata edited; status transitions happen
  // via dedicated endpoints (/approve, /send) in later phases.
  const body = await req.json().catch(() => ({}))
  const allowed = ['period_start', 'period_end'] as const
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoice: data })
}
