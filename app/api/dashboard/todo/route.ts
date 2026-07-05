import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse, requireCoach } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

// Dashboard "To-Do Today" data:
//   nudges  — draft nudges for clients whose last appointment was ≤6 days ago (up to 3)
//   transcripts — transcripts needing scoring/review
// Session preps are fetched client-side from /api/sessions (needs OAuth calendar token).
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)

    const now = new Date()
    const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)

    // Draft nudges needing coach review
    const { data: nudges } = await supabase
      .from('nudges')
      .select('id, client_id, type, created_at')
      .eq('coach_id', coach.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(50)

    const nudgeClientIds = Array.from(new Set((nudges || []).map((n) => n.client_id)))

    // Names and last appointments for nudge clients
    const nudgeSuggestions: {
      id: string
      client_id: string
      client_name: string
      type: string
      last_appointment: string | null
      days_since: number | null
    }[] = []

    if (nudgeClientIds.length) {
      const nowIso = now.toISOString()
      const [{ data: clients }, { data: appts }] = await Promise.all([
        supabase.from('clients').select('id, name').in('id', nudgeClientIds),
        supabase
          .from('appointments')
          .select('client_id, scheduled_at')
          .in('client_id', nudgeClientIds)
          .neq('status', 'cancelled')
          .lte('scheduled_at', nowIso)
          .order('scheduled_at', { ascending: false }),
      ])
      const nameMap = new Map<string, string>()
      const lastApptMap = new Map<string, string>()
      for (const c of clients || []) nameMap.set(c.id, c.name)
      for (const a of appts || []) {
        if (a.client_id && !lastApptMap.has(a.client_id)) lastApptMap.set(a.client_id, a.scheduled_at)
      }

      // One nudge entry per client (the most recent draft), filtered to the 6-day window
      const seenClients = new Set<string>()
      for (const n of nudges || []) {
        if (seenClients.has(n.client_id)) continue
        seenClients.add(n.client_id)

        const lastAppt = lastApptMap.get(n.client_id) || null
        let daysSince: number | null = null
        if (lastAppt) {
          daysSince = Math.floor((now.getTime() - new Date(lastAppt).getTime()) / (24 * 60 * 60 * 1000))
        }

        // Only include clients whose last session was within the past 6 days
        if (daysSince === null || daysSince > 6) continue

        nudgeSuggestions.push({
          id: n.id,
          client_id: n.client_id,
          client_name: nameMap.get(n.client_id) || 'Unknown client',
          type: n.type,
          last_appointment: lastAppt,
          days_since: daysSince,
        })
        if (nudgeSuggestions.length >= 3) break
      }
    }

    // Transcripts waiting on the coach — same definition as the Practice review
    // queue: needs_review/unmatched only. A matched transcript with no report is
    // NOT a to-do — it's the deliberate "filed without scoring" state (orientation
    // /teaching sessions); scoring later is optional, via the client workspace's
    // "score now" button.
    const { data: transcripts } = await supabase
      .from('transcripts')
      .select('id, client_id, client_initials, filename, title, session_date, match_status, created_at')
      .eq('coach_id', coach.id)
      .in('match_status', ['needs_review', 'unmatched'])
      .order('created_at', { ascending: false })
      .limit(20)

    // Client names for transcripts (a needs_review row can carry a best-guess client)
    const transcriptClientIds = Array.from(
      new Set((transcripts || []).filter((t) => t.client_id).map((t) => t.client_id as string)),
    )
    const transcriptNameMap = new Map<string, string>()
    if (transcriptClientIds.length) {
      const { data: tclients } = await supabase
        .from('clients')
        .select('id, name')
        .in('id', transcriptClientIds)
      for (const c of tclients || []) transcriptNameMap.set(c.id, c.name)
    }

    const scoringQueue = (transcripts || []).map((t) => ({
      id: t.id,
      client_id: t.client_id,
      client_name: t.client_id ? transcriptNameMap.get(t.client_id) || t.client_initials || 'Unknown' : null,
      title: t.title || t.filename || 'Untitled',
      session_date: t.session_date,
      match_status: t.match_status,
      needs_review: true,
    }))

    return NextResponse.json({ nudges: nudgeSuggestions, transcripts: scoringQueue })
  } catch (e) {
    return toErrorResponse(e)
  }
}
