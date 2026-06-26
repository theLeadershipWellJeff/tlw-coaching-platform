/**
 * POST /api/billing/run/approve-all
 * Body: { invoiceIds: string[] }
 *
 * Batch-approves a set of draft invoices in one call. Silently skips any
 * invoice that is not in draft status or doesn't belong to the coach.
 * Returns the count approved and any ids that were skipped.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { invoiceIds } = body as { invoiceIds?: string[] }

  if (!Array.isArray(invoiceIds) || invoiceIds.length === 0)
    return NextResponse.json({ error: 'invoiceIds array is required' }, { status: 400 })

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('invoices')
    .update({
      status: 'approved',
      approved_by: coach.email,
      approved_at: now,
      updated_at: now,
    })
    .in('id', invoiceIds)
    .eq('coach_id', coach.id)
    .eq('status', 'draft')
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const approvedIds = (data ?? []).map((r: any) => r.id)
  const skippedIds = invoiceIds.filter((id) => !approvedIds.includes(id))

  return NextResponse.json({ approved: approvedIds.length, approvedIds, skippedIds })
}
