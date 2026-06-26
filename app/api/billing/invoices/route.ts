/**
 * GET /api/billing/invoices
 *
 * Query params:
 *   status   — comma-separated status values to filter (e.g. "sent,overdue")
 *   limit    — max rows (default 50)
 *   accountId — filter to one billing account
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
      query = query.eq('status', statuses[0])
    } else if (statuses.length > 1) {
      query = query.in('status', statuses)
    }
  }

  if (accountId) {
    query = query.eq('billing_account_id', accountId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoices: data })
}
