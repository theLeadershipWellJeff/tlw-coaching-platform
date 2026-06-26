/**
 * GET /api/billing/reminders
 *
 * Query params:
 *   status      — scheduled | sent | cancelled (default: scheduled)
 *   withinDays  — only reminders with send_at within N days from now
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
  const status = sp.get('status') ?? 'scheduled'
  const withinDays = parseInt(sp.get('withinDays') ?? '0', 10) || 0

  // Join through invoices to scope to this coach.
  let query = supabase
    .from('invoice_reminders')
    .select('*, invoices!inner ( coach_id )')
    .eq('invoices.coach_id', coach.id)
    .eq('status', status)
    .order('send_at', { ascending: true })

  if (withinDays > 0) {
    const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString()
    query = query.lte('send_at', cutoff)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reminders: data })
}
