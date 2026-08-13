/**
 * Read-only overview data for the Client Portal home. EVERY query is hard-scoped
 * to the authenticated `clientId`, and only client-appropriate fields are read —
 * never `key_info` or any coach-private column.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { CoachingGoal } from '@/lib/supabase/types'

export type PortalOverview = {
  client: { id: string; name: string; timezone: string | null }
  goals: CoachingGoal[]
  nextAppointment: { scheduled_at: string; duration_minutes: number } | null
  transcripts: { id: string; title: string | null; session_date: string | null }[]
  messages: { id: string; type: string; subject: string | null; preview: string | null; sent_at: string }[]
}

export async function loadPortalOverview(clientId: string): Promise<PortalOverview | null> {
  const supabase = getSupabaseAdmin()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, timezone, coaching_goals')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return null

  const nowIso = new Date().toISOString()
  const [apptRes, txRes, commRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('scheduled_at, duration_minutes, status')
      .eq('client_id', clientId)
      .eq('status', 'scheduled')
      .gte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(1),
    supabase
      .from('transcripts')
      .select('id, title, session_date')
      .eq('client_id', clientId)
      .order('session_date', { ascending: false, nullsFirst: false })
      .limit(20),
    supabase
      .from('communications')
      .select('id, type, subject, preview, sent_at')
      .eq('client_id', clientId)
      .eq('direction', 'outbound')
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(10),
  ])

  const appt = apptRes.data?.[0]
  return {
    client: { id: client.id, name: client.name, timezone: client.timezone },
    goals: Array.isArray(client.coaching_goals) ? (client.coaching_goals as CoachingGoal[]) : [],
    nextAppointment: appt
      ? { scheduled_at: appt.scheduled_at, duration_minutes: appt.duration_minutes }
      : null,
    transcripts: txRes.data ?? [],
    messages: commRes.data ?? [],
  }
}
