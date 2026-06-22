import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Nudges lego — the coach's SENT nudges (history), across all clients. Read-only;
 * the card reuses the Nudge page's NudgeItem rendering for the detail view. The
 * send path may not be producing records yet, so an empty result is normal.
 */
export async function GET() {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: rows }, { count }] = await Promise.all([
    supabase
      .from('nudges')
      .select(
        'id, client_id, type, origin, status, trigger_excerpt, rationale, draft_subject, draft_body, scheduled_for, sent_at, created_at'
      )
      .eq('coach_id', coach.id)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(50),
    supabase
      .from('nudges')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', coach.id)
      .eq('status', 'sent'),
  ])

  const nudges = rows || []
  const seen: Record<string, true> = {}
  const ids: string[] = []
  for (const n of nudges) {
    if (n.client_id && !seen[n.client_id]) {
      seen[n.client_id] = true
      ids.push(n.client_id)
    }
  }
  const { data: clients } = ids.length
    ? await supabase.from('clients').select('id, name').in('id', ids)
    : { data: [] as { id: string; name: string }[] }
  const nameById: Record<string, string> = {}
  for (const c of clients || []) nameById[c.id] = c.name

  const items = nudges.map((n) => ({
    ...n,
    client_name: (n.client_id && nameById[n.client_id]) || undefined,
  }))

  return NextResponse.json({ count: count || 0, items })
}
