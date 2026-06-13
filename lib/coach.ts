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

export const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'America/Los_Angeles'

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
    .insert({ email: normalizedEmail, name: name || normalizedEmail, role: 'coach', timezone: DEFAULT_TIMEZONE })
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

/**
 * Persist the coach's Google refresh token (and ensure the coach row exists) on
 * sign-in, so the background webhook can read their calendar server-side. Google
 * only returns a refresh token when offline access is (re)granted; sign-in uses
 * prompt=consent so we get one each time. Never clobber a stored token with null.
 */
export async function storeCoachRefreshToken(
  supabase: SupabaseClient<Database>,
  email: string,
  name: string,
  refreshToken: string | null | undefined
): Promise<void> {
  const coach = await getOrCreateCoach(supabase, email, name)
  if (!refreshToken) return
  if (coach.google_refresh_token === refreshToken) return
  await supabase.from('coaches').update({ google_refresh_token: refreshToken }).eq('id', coach.id)
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
