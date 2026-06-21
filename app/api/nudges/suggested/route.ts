import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse, requireCoach } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

// Suggested nudges for the homepage card: the coach's draft (needs-review) nudges,
// each with the client name and that client's most recent past appointment, newest
// first. Coach-scoped. Clicking a row deep-links to the nudge in the queue.
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)

    const { data: nudges, error } = await supabase
      .from('nudges')
      .select('id, client_id, type, created_at')
      .eq('coach_id', coach.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const clientIds = Array.from(new Set((nudges || []).map((n) => n.client_id)))

    // Client names + each client's most recent past (non-cancelled) appointment.
    const nameMap = new Map<string, string>()
    const lastApptMap = new Map<string, string>()
    if (clientIds.length) {
      const nowIso = new Date().toISOString()
      const [{ data: clients }, { data: appts }] = await Promise.all([
        supabase.from('clients').select('id, name').in('id', clientIds),
        supabase
          .from('appointments')
          .select('client_id, scheduled_at')
          .in('client_id', clientIds)
          .neq('status', 'cancelled')
          .lte('scheduled_at', nowIso)
          .order('scheduled_at', { ascending: false }),
      ])
      for (const c of clients || []) nameMap.set(c.id, c.name)
      // Rows are newest-first → the first seen per client is their last appointment.
      for (const a of appts || []) {
        if (!lastApptMap.has(a.client_id)) lastApptMap.set(a.client_id, a.scheduled_at)
      }
    }

    const suggestions = (nudges || []).map((n) => ({
      id: n.id,
      client_id: n.client_id,
      client_name: nameMap.get(n.client_id) || 'Unknown client',
      type: n.type,
      last_appointment: lastApptMap.get(n.client_id) || null,
    }))

    return NextResponse.json({ suggestions })
  } catch (e) {
    return toErrorResponse(e)
  }
}
