/**
 * Coach identity. Phase 1 is effectively single-coach (Jeff), but every
 * transcript and report carries a coach_id so a supervisor can roll up across
 * coaches later without a migration. Coaches are keyed by the email on their
 * signed-in Google account and created on first use.
 */
import { getServerSession } from 'next-auth'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authOptions } from './authOptions'
import type { Database, Coach } from './supabase/types'

export async function getOrCreateCoach(
  supabase: SupabaseClient<Database>,
  email: string,
  name: string
): Promise<Coach> {
  const normalizedEmail = email.trim().toLowerCase()

  const { data: existing, error: readErr } = await supabase
    .from('coaches')
    .select('*')
    .eq('email', normalizedEmail)
    .maybeSingle()
  if (readErr) throw new Error(`Supabase (coaches read): ${readErr.message}`)
  if (existing) return existing

  const { data: created, error: insErr } = await supabase
    .from('coaches')
    .insert({ email: normalizedEmail, name: name || normalizedEmail, role: 'coach' })
    .select('*')
    .single()
  if (insErr) {
    // Lost a create race — read the row the other writer inserted.
    const { data: raced } = await supabase
      .from('coaches')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle()
    if (raced) return raced
    throw new Error(`Supabase (coaches insert): ${insErr.message}`)
  }
  return created
}

/** The coach for the signed-in session, or null if not authenticated. */
export async function getSessionCoach(
  supabase: SupabaseClient<Database>
): Promise<Coach | null> {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email
  if (!email) return null
  return getOrCreateCoach(supabase, email, session.user?.name || email)
}
