import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse, requireCoach } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

// The coach's cross-client Nudge Queue — every pending nudge (draft / scheduled /
// snoozed) they need to review, newest first, enriched with the client name so the
// review screen reads at a glance. Coach-scoped: only this coach's nudges.
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)

    const { data: nudges, error } = await supabase
      .from('nudges')
      .select(
        'id, client_id, type, origin, status, trigger_excerpt, rationale, draft_subject, draft_body, coach_note, scheduled_for, created_at'
      )
      .eq('coach_id', coach.id)
      .in('status', ['draft', 'scheduled', 'snoozed'])
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Relationship types aren't generated, so resolve client names in a second
    // query (same pattern as the reminder cron / lib/clientNames).
    const clientIds = Array.from(new Set((nudges || []).map((n) => n.client_id)))
    const nameMap = new Map<string, string>()
    if (clientIds.length) {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name')
        .in('id', clientIds)
      for (const c of clients || []) nameMap.set(c.id, c.name)
    }

    const enriched = (nudges || []).map((n) => ({
      ...n,
      client_name: nameMap.get(n.client_id) || 'Unknown client',
    }))

    return NextResponse.json({ nudges: enriched })
  } catch (e) {
    return toErrorResponse(e)
  }
}
