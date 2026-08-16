/**
 * Client Portal username + password (migration 054).
 *
 * Hashing uses Node's built-in `scrypt` — a memory-hard KDF designed for exactly
 * this — rather than adding a bcrypt/argon2 dependency. Parameters are stored
 * alongside each hash so they can be raised later without invalidating existing
 * passwords.
 *
 * The password is a one-way hash: nobody, coach included, can read it back. The
 * coach-facing affordances are "resend the sign-in link" and "the client can set
 * a new one" — never "show me their password".
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import { getSupabaseAdmin } from '@/lib/supabase/server'

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number }
) => Promise<Buffer>

// ~64 MB of memory per hash: costly for an attacker, unnoticeable for one login.
const PARAMS = { N: 16384, r: 8, p: 1 }
const KEYLEN = 32

export const MIN_PASSWORD_LENGTH = 10
export const MAX_FAILED_ATTEMPTS = 8
const LOCKOUT_MINUTES = 15

/** Hash a password to a self-describing string (params travel with the hash). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, KEYLEN, PARAMS)
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$')
}

/** Constant-time verify against a stored hash. Returns false on any malformity. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split('$')
    if (scheme !== 'scrypt') return false
    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(hashB64, 'base64')
    const derived = await scrypt(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    })
    if (derived.length !== expected.length) return false
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/** Usernames are lowercased; letters, digits, dot, dash, underscore. */
const USERNAME_RE = /^[a-z0-9._-]{3,40}$/

export function normalizeUsername(raw: string): string {
  return String(raw || '').trim().toLowerCase()
}

export function validateUsername(raw: string): { ok: true; username: string } | { ok: false; error: string } {
  const username = normalizeUsername(raw)
  if (!USERNAME_RE.test(username)) {
    return {
      ok: false,
      error: 'Use 3–40 characters: letters, numbers, dots, dashes or underscores.',
    }
  }
  return { ok: true, username }
}

export function validatePassword(raw: string): { ok: true } | { ok: false; error: string } {
  const password = String(raw || '')
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if (password.length > 200) return { ok: false, error: 'That password is too long.' }
  return { ok: true }
}

export type PortalCredentialRow = {
  client_id: string
  username: string
  password_hash: string
  failed_attempts: number
  locked_until: string | null
  last_login_at: string | null
}

/**
 * Verify a username + password. Returns the clientId on success.
 *
 * Every failure returns the same shape regardless of cause (unknown username,
 * wrong password, locked) so the response can't be used to enumerate accounts.
 * Repeated failures lock the row for a cooling-off period — the magic-link
 * limiter does not cover this path, and a password field invites guessing in a
 * way a link does not.
 */
export async function verifyPortalLogin(
  rawUsername: string,
  password: string
): Promise<{ ok: true; clientId: string } | { ok: false }> {
  const username = normalizeUsername(rawUsername)
  if (!username || !password) return { ok: false }

  const supabase = getSupabaseAdmin()
  const { data: row } = await supabase
    .from('client_credentials')
    .select('client_id, username, password_hash, failed_attempts, locked_until, last_login_at')
    .eq('username', username)
    .maybeSingle<PortalCredentialRow>()
  if (!row) return { ok: false }

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return { ok: false }
  }

  const valid = await verifyPassword(password, row.password_hash)
  if (!valid) {
    const attempts = (row.failed_attempts ?? 0) + 1
    await supabase
      .from('client_credentials')
      .update({
        failed_attempts: attempts,
        locked_until:
          attempts >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString()
            : null,
        updated_at: new Date().toISOString(),
      })
      .eq('client_id', row.client_id)
    return { ok: false }
  }

  await supabase
    .from('client_credentials')
    .update({
      failed_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('client_id', row.client_id)

  return { ok: true, clientId: row.client_id }
}

/** Create or replace this client's credentials. Username must be free. */
export async function setPortalCredentials(
  clientId: string,
  rawUsername: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = validateUsername(rawUsername)
  if (!u.ok) return { ok: false, error: u.error }
  const p = validatePassword(password)
  if (!p.ok) return { ok: false, error: p.error }

  const supabase = getSupabaseAdmin()
  const { data: taken } = await supabase
    .from('client_credentials')
    .select('client_id')
    .eq('username', u.username)
    .maybeSingle()
  if (taken && taken.client_id !== clientId) {
    return { ok: false, error: 'That username is already taken.' }
  }

  const { data: client } = await supabase
    .from('clients')
    .select('org_id')
    .eq('id', clientId)
    .maybeSingle()

  const password_hash = await hashPassword(password)
  const { error } = await supabase.from('client_credentials').upsert(
    {
      client_id: clientId,
      org_id: client?.org_id,
      username: u.username,
      password_hash,
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' }
  )
  if (error) return { ok: false, error: 'Could not save those credentials.' }
  return { ok: true }
}

/**
 * What the COACH is allowed to see about a client's portal sign-in. Deliberately
 * excludes `password_hash` — there is nothing here that could reveal a password.
 */
export async function getPortalLoginStatus(clientId: string): Promise<{
  username: string | null
  hasPassword: boolean
  lastLoginAt: string | null
  locked: boolean
}> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('client_credentials')
    .select('username, last_login_at, locked_until')
    .eq('client_id', clientId)
    .maybeSingle()
  return {
    username: data?.username ?? null,
    hasPassword: !!data,
    lastLoginAt: data?.last_login_at ?? null,
    locked: !!data?.locked_until && new Date(data.locked_until).getTime() > Date.now(),
  }
}
