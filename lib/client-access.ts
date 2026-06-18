/**
 * Client tenant-scoping (Block Registry spec, Tier 0). Access to a client — and
 * everything hanging off it (notes, actions, transcripts, agreements, …) — is
 * gated by a row in `coach_clients` linking the signed-in coach to that client.
 *
 * This is the isolation boundary. It is enforced HERE, server-side, against the
 * session coach — not via Supabase RLS (we're on NextAuth). Every client route
 * runs through `requireClientCoach`; the roster list filters through
 * `accessibleClientIds`; client creation/import calls `linkCoachToClient`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError, requireCoach } from './api-handler'
import type { Coach, Database } from './supabase/types'

/** Every client id this coach may access (owned or shared). */
export async function accessibleClientIds(
  supabase: SupabaseClient<Database>,
  coachId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('coach_clients')
    .select('client_id')
    .eq('coach_id', coachId)
  if (error) throw new Error(`Supabase (coach_clients read): ${error.message}`)
  return (data ?? []).map((r) => r.client_id)
}

/** True iff the coach is linked to the client. */
export async function coachCanAccessClient(
  supabase: SupabaseClient<Database>,
  coachId: string,
  clientId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('coach_clients')
    .select('client_id')
    .eq('coach_id', coachId)
    .eq('client_id', clientId)
    .maybeSingle()
  return !!data
}

/**
 * Require that the signed-in coach can access this client. Resolves the coach
 * and returns it. Throws ApiError(401) when not signed in, ApiError(404) when
 * the coach isn't linked to the client — 404, not 403, so we never reveal that a
 * client id exists to a coach who shouldn't see it.
 */
export async function requireClientCoach(
  supabase: SupabaseClient<Database>,
  clientId: string
): Promise<Coach> {
  const coach = await requireCoach(supabase)
  if (!(await coachCanAccessClient(supabase, coach.id, clientId))) {
    throw new ApiError(404, 'Client not found')
  }
  return coach
}

/** Link a coach to a client (idempotent). Called when a client is created/imported. */
export async function linkCoachToClient(
  supabase: SupabaseClient<Database>,
  coachId: string,
  clientId: string,
  role: 'primary' | 'shared' = 'primary'
): Promise<void> {
  const { error } = await supabase
    .from('coach_clients')
    .upsert({ coach_id: coachId, client_id: clientId, role }, { onConflict: 'coach_id,client_id' })
  if (error) throw new Error(`Supabase (coach_clients link): ${error.message}`)
}
