/**
 * Coach identity. Phase 1 is effectively single-coach (Jeff), but every
 * transcript and report carries a coach_id so a supervisor can roll up across
 * coaches later without a migration. Coaches are keyed by the email on their
 * signed-in Google account.
 *
 * SECURITY (2026-09-09): the `coaches` table IS the sign-in allowlist. Sign-in,
 * the session lookup, and every webhook/cron are GET-ONLY — none of them may
 * create a coach row. `getOrCreateCoach` is retained solely for an explicit
 * admin onboarding path (not wired to any route today); never call it from
 * auth, a webhook, or a cron.
 */
import { getServerSession } from 'next-auth'
import { coachIsLocked } from './access'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authOptions } from './authOptions'
import type { Database, Coach } from './supabase/types'

export const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'America/Los_Angeles'

/**
 * The coach row for an email, or null when none exists. Throws on a read
 * ERROR (as opposed to "no row") so callers can tell an outage from a
 * stranger — the sign-in gate fails closed on either.
 */
export async function getCoachByEmail(
  supabase: SupabaseClient<Database>,
  email: string
): Promise<Coach | null> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return null
  const { data, error } = await supabase
    .from('coaches')
    .select('*')
    .eq('email', normalizedEmail)
    .maybeSingle()
  if (error) throw new Error(`Supabase (coaches read): ${error.message}`)
  return data ?? null
}

/**
 * ADMIN-ONLY. Get-or-create a coach row. Reserved for an explicit supervisor
 * onboarding path; it is deliberately NOT called from sign-in, the session
 * lookup, the ingest webhook, or any cron (the Command Center adds coaches via
 * a direct insert in POST /api/coaches). Kept so that path can be built
 * without re-deriving the create-race handling below.
 */
export async function getOrCreateCoach(
  supabase: SupabaseClient<Database>,
  email: string,
  name: string
): Promise<Coach> {
  const normalizedEmail = email.trim().toLowerCase()

  const existing = await getCoachByEmail(supabase, normalizedEmail)
  if (existing) return existing

  const { data: created, error: insErr } = await supabase
    .from('coaches')
    .insert({ email: normalizedEmail, name: name || normalizedEmail, role: 'coach', timezone: DEFAULT_TIMEZONE })
    .select('*')
    .single()
  if (insErr) {
    // Lost a create race — read the row the other writer inserted.
    const raced = await getCoachByEmail(supabase, normalizedEmail)
    if (raced) return raced
    throw new Error(`Supabase (coaches insert): ${insErr.message}`)
  }
  return created
}

/**
 * Persist the coach's Google refresh token on sign-in, so the background
 * webhook can read their calendar server-side. Google only returns a refresh
 * token when offline access is (re)granted; sign-in uses prompt=consent so we
 * get one each time. Never clobber a stored token with null. GET-ONLY: an
 * email with no coaches row is ignored here (the signIn callback has already
 * refused it — this event only runs for admitted accounts).
 */
export async function storeCoachRefreshToken(
  supabase: SupabaseClient<Database>,
  email: string,
  refreshToken: string | null | undefined
): Promise<void> {
  const coach = await getCoachByEmail(supabase, email)
  if (!coach) return
  if (!refreshToken) return
  if (coach.google_refresh_token === refreshToken) return
  await supabase.from('coaches').update({ google_refresh_token: refreshToken }).eq('id', coach.id)
}

/**
 * The coach for the signed-in session, or null if not authenticated OR the
 * session's email no longer has a coaches row (a valid JWT can outlive a
 * removed coach by up to 30 days). Callers must treat null as 401 — never
 * re-create the row here.
 */
export async function getSessionCoach(
  supabase: SupabaseClient<Database>,
  opts: { allowLocked?: boolean } = {}
): Promise<Coach | null> {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email
  if (!email) return null
  const coach = await getCoachByEmail(supabase, email)
  // THE PAYWALL (lib/access.ts). A lapsed coach is signed in but not
  // authorized: every route that resolves the coach through here sees null
  // (→ 401), so no data leaves the wall. Only the subscription, export, and
  // layout callers pass allowLocked to see who is standing at it.
  if (coach && !opts.allowLocked && coachIsLocked(coach)) return null
  return coach
}

/** The signed-in coach even when locked behind the paywall (wall + subscription routes). */
export async function getSessionCoachAny(supabase: SupabaseClient<Database>): Promise<Coach | null> {
  return getSessionCoach(supabase, { allowLocked: true })
}

/**
 * How the app addresses the coach in greetings and headers: the preferred name
 * they set on Account → Profile ("Dr. Jeff"), else the first word of their full
 * name, else "there". Never the raw email.
 */
export function coachGreetingName(
  coach: Pick<Coach, 'name' | 'preferred_name' | 'email'> | null | undefined
): string {
  const preferred = coach?.preferred_name?.trim()
  if (preferred) return preferred
  const first = (coach?.name || '').trim().split(/\s+/)[0]
  if (first && !first.includes('@')) return first
  return 'there'
}

/**
 * The coach's full display name for emails, prompts, and sign-offs — the
 * profile name when set, else the email. A coach who never edited their profile
 * keeps the name Google supplied at first sign-in.
 */
export function coachDisplayName(coach: Pick<Coach, 'name' | 'email'> | null | undefined): string {
  const name = (coach?.name || '').trim()
  return name || coach?.email || 'the coach'
}
