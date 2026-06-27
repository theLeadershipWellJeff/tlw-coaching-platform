/**
 * GET /api/billing/invoices
 * POST /api/billing/invoices  — create a manual draft invoice
 *
 * Query params:
 *   status      — comma-separated status values to filter (e.g. "sent,overdue")
 *   limit       — max rows (default 50)
 *   accountId   — filter to one billing account
 *   periodStart — ISO date; filter invoices where period_start >= this value
 *   periodEnd   — ISO date; filter invoices where period_end <= this value
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const statusParam = sp.get('status')
  const limitParam = sp.get('limit')
  const accountId = sp.get('accountId')
  const periodStart = sp.get('periodStart')
  const periodEnd = sp.get('periodEnd')
  const limit = Math.min(parseInt(limitParam ?? '50', 10) || 50, 200)

  let query = supabase
    .from('invoices')
    .select('*, billing_accounts ( id, name, type )')
    .eq('coach_id', coach.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (statusParam) {
    const statuses = statusParam.split(',').map((s) => s.trim()).filter(Boolean)
    if (statuses.length === 1) {
      query = query.eq('status', statuses[0] as any)
    } else if (statuses.length > 1) {
      query = query.in('status', statuses as any[])
    }
  }

  if (accountId) {
    query = query.eq('billing_account_id', accountId)
  }

  if (periodStart) {
    query = query.gte('period_start', periodStart)
  }

  if (periodEnd) {
    query = query.lte('period_end', periodEnd)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoices: data })
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    billing_account_id?: string
    period_start?: string
    period_end?: string
    lines?: { description: string; amount: number }[]
    currency?: string
  }

  if (!body.billing_account_id)
    return NextResponse.json({ error: 'billing_account_id is required' }, { status: 400 })
  if (!body.lines || body.lines.length === 0)
    return NextResponse.json({ error: 'At least one line is required' }, { status: 400 })

  // Verify the account belongs to this coach.
  const { data: account } = await supabase
    .from('billing_accounts')
    .select('id')
    .eq('id', body.billing_account_id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!account) return NextResponse.json({ error: 'Billing account not found' }, { status: 404 })

  const subtotal = Math.round(body.lines.reduce((s, l) => s + (l.amount ?? 0), 0) * 100) / 100

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      coach_id: coach.id,
      billing_account_id: body.billing_account_id,
      period_start: body.period_start ?? null,
      period_end: body.period_end ?? null,
      status: 'draft',
      subtotal,
      total: subtotal,
      currency: body.currency ?? 'usd',
    })
    .select('id')
    .single()

  if (invErr || !invoice)
    return NextResponse.json({ error: invErr?.message ?? 'Failed to create invoice' }, { status: 500 })

  const lineRows = body.lines.map((l) => ({
    invoice_id: invoice.id,
    coachee_id: null,
    description: l.description,
    quantity: 1,
    unit_amount: Math.round(l.amount * 100) / 100,
    amount: Math.round(l.amount * 100) / 100,
    source: 'manual' as any,
  }))

  const { error: lineErr } = await supabase.from('invoice_lines').insert(lineRows)
  if (lineErr)
    return NextResponse.json({ error: lineErr.message }, { status: 500 })

  return NextResponse.json({ invoiceId: invoice.id }, { status: 201 })
}
