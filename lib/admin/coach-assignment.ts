/**
 * Assigning a portal client to a coach (multi-coach rollout, e.g. an
 * enterprise cohort coached by several coaches). Supervisor-only callers.
 *
 * The assignment IS the `coach_clients` primary link — the same link that puts
 * a client in a coach's roster, scopes that coach's calendar-watch booking
 * capture (lib/booking-sync.ts matches only the coach's own clients), and
 * decides whose booking link / assistant the portal shows
 * (lib/portal/data.ts). Nothing else stores "who coaches this person".
 *
 * Assigning a coach also turns a portal-only participant (client_type
 * 'portal') into a coaching client ('client'): they appear in the coach's
 * roster and the portal says "your coach" (hasCoach). Removing the coach is
 * the reverse and is only allowed for enterprise/cohort participants, whose
 * record can safely go back to the house-coach link without vanishing from a
 * roster someone relies on.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Coach, Database } from '@/lib/supabase/types'
import { AdminError, resolveHouseCoach } from './debrief'

export type AssignableCoach = {
  id: string
  name: string | null
  email: string
  role: string
  /** Has signed in and granted Google access (calendar sync + email need it). */
  connected: boolean
  booking_url: string | null
  scheduling_assistant_name: string | null
  scheduling_assistant_email: string | null
  /** How many clients list this coach as primary (portal + coaching). */
  primary_client_count: number
}

/** Every coach on the platform, with their scheduling contact. Defensive pre-074. */
export async function listAssignableCoaches(supabase: SupabaseClient<Database>): Promise<{ coaches: AssignableCoach[]; assistantAvailable: boolean }> {
  const { data, error } = await supabase
    .from('coaches')
    .select('id, name, email, role, google_refresh_token, booking_url, plan')
    .order('name', { ascending: true })
  if (error) throw new AdminError(500, error.message)
  const rows = data || []
  const ids = rows.map((c) => c.id)

  // Migration 074 columns, read on their own so a missing column costs only them.
  const assistants = new Map<string, { name: string | null; email: string | null }>()
  let assistantAvailable = true
  if (ids.length) {
    const r = await supabase.from('coaches').select('id, scheduling_assistant_name, scheduling_assistant_email').in('id', ids)
    if (r.error) assistantAvailable = false
    for (const a of (r.data || []) as Array<{ id: string; scheduling_assistant_name: string | null; scheduling_assistant_email: string | null }>) {
      assistants.set(a.id, { name: a.scheduling_assistant_name, email: a.scheduling_assistant_email })
    }
  }

  const counts = new Map<string, number>()
  if (ids.length) {
    const { data: links } = await supabase.from('coach_clients').select('coach_id').eq('role', 'primary').in('coach_id', ids)
    for (const l of links || []) counts.set(l.coach_id, (counts.get(l.coach_id) || 0) + 1)
  }

  return {
    assistantAvailable,
    coaches: rows.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      role: c.role,
      connected: Boolean(c.google_refresh_token),
      booking_url: c.booking_url ?? null,
      scheduling_assistant_name: assistants.get(c.id)?.name ?? null,
      scheduling_assistant_email: assistants.get(c.id)?.email ?? null,
      primary_client_count: counts.get(c.id) || 0,
    })),
  }
}

/** Primary coach per client for a batch of clients (null = none / structural house link only). */
export async function loadAssignedCoaches(
  supabase: SupabaseClient<Database>,
  clients: Array<{ id: string; client_type: string }>
): Promise<Map<string, { id: string; name: string | null }>> {
  const out = new Map<string, { id: string; name: string | null }>()
  const ids = clients.filter((c) => c.client_type !== 'portal').map((c) => c.id)
  if (!ids.length) return out
  const { data: links } = await supabase.from('coach_clients').select('client_id, coach_id, role').in('client_id', ids)
  const byClient = new Map<string, string>()
  for (const l of links || []) {
    if (l.role === 'primary' || !byClient.has(l.client_id)) byClient.set(l.client_id, l.coach_id)
  }
  const coachIds = Array.from(new Set(Array.from(byClient.values())))
  if (!coachIds.length) return out
  const { data: coaches } = await supabase.from('coaches').select('id, name, email').in('id', coachIds)
  const names = new Map((coaches || []).map((c) => [c.id, c.name || c.email]))
  for (const [clientId, coachId] of Array.from(byClient.entries())) out.set(clientId, { id: coachId, name: names.get(coachId) ?? null })
  return out
}

/**
 * Make `coachId` this client's primary coach (null = no coach: back to the
 * house-coach link as a portal-only participant). Every other primary link is
 * removed; shared links are kept. Returns the previous primary coach id.
 */
export async function assignClientCoach(
  supabase: SupabaseClient<Database>,
  actor: Coach,
  clientId: string,
  coachId: string | null
): Promise<{ previousCoachId: string | null; coachId: string | null; clientType: string }> {
  const { data: client } = await supabase
    .from('clients')
    .select('id, client_type, company_id, cohort_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) throw new AdminError(404, 'Client not found.')
  if (client.client_type === 'coach') throw new AdminError(409, 'This record is a team coach, not a client.')

  const { data: links } = await supabase.from('coach_clients').select('coach_id, role').eq('client_id', clientId)
  const previousPrimary = (links || []).find((l) => l.role === 'primary')?.coach_id ?? null
  const previousCoachId = client.client_type === 'portal' ? null : previousPrimary

  let targetCoachId: string
  let clientType: string
  if (coachId) {
    const { data: coach } = await supabase.from('coaches').select('id').eq('id', coachId).maybeSingle()
    if (!coach) throw new AdminError(404, 'Coach not found.')
    targetCoachId = coach.id
    clientType = client.client_type === 'portal' ? 'client' : client.client_type
  } else {
    if (client.client_type !== 'portal' && !client.company_id && !client.cohort_id) {
      throw new AdminError(409, 'This is a coaching client. Pick the coach who should hold them instead of removing the coach.')
    }
    targetCoachId = (await resolveHouseCoach(supabase, actor)).id
    clientType = 'portal'
  }

  // Link the new primary FIRST, so a failure can never leave the client with no
  // coach link at all (every tenant gate would then lose them).
  const { error: upsertError } = await supabase
    .from('coach_clients')
    .upsert({ coach_id: targetCoachId, client_id: clientId, role: 'primary' }, { onConflict: 'coach_id,client_id' })
  if (upsertError) throw new AdminError(500, upsertError.message)

  const stale = (links || []).filter((l) => l.role === 'primary' && l.coach_id !== targetCoachId).map((l) => l.coach_id)
  if (stale.length) {
    const { error: delError } = await supabase.from('coach_clients').delete().eq('client_id', clientId).eq('role', 'primary').in('coach_id', stale)
    if (delError) throw new AdminError(500, delError.message)
  }

  if (clientType !== client.client_type) {
    const { error: typeError } = await supabase.from('clients').update({ client_type: clientType } as any).eq('id', clientId)
    if (typeError) throw new AdminError(500, typeError.message)
  }

  return { previousCoachId, coachId: coachId ? targetCoachId : null, clientType }
}
