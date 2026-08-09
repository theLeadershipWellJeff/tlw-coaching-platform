/**
 * Mint a short-lived Supabase access token (JWT) from the signed-in coach's
 * tenant claims, so Postgres Row Level Security can scope by org/coach.
 *
 * We're on NextAuth, not Supabase Auth, so there is no Supabase-issued JWT to
 * ride on — we mint our own, signed with the project's `SUPABASE_JWT_SECRET`
 * (HS256), carrying the claims RLS policies will read via
 * `auth.jwt() ->> 'org_id'` etc. The top-level `role` is `authenticated` (a real
 * Postgres role RLS applies to) — never `service_role`, which would bypass RLS.
 *
 * Signed with Node's built-in crypto (no external JWT dependency).
 *
 * NOTE: this token is only consumed by `getSupabaseForClaims` and is dormant
 * until the strangler RLS rollout (Phase 1 §5.3) switches a route off the
 * service-role client. Nothing reads it before then.
 */
import { createHmac, timingSafeEqual } from 'crypto'

export type TenantClaims = {
  orgId: string
  coachId: string
  coachRole: string
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

/**
 * HS256-sign a Supabase access token for these tenant claims. `ttlSeconds`
 * defaults to one hour; `now` (ms) is injectable for testing.
 */
export function mintSupabaseAccessToken(
  claims: TenantClaims,
  opts: { ttlSeconds?: number; now?: number } = {}
): string {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) {
    throw new Error(
      'SUPABASE_JWT_SECRET is not set — required to mint request-scoped Supabase ' +
        'tokens. Find it in Supabase → Project Settings → API → JWT Settings.'
    )
  }

  const iat = Math.floor((opts.now ?? Date.now()) / 1000)
  const exp = iat + (opts.ttlSeconds ?? 3600)

  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    role: 'authenticated', // the Postgres role RLS applies to
    aud: 'authenticated',
    sub: claims.coachId,
    org_id: claims.orgId,
    coach_id: claims.coachId,
    coach_role: claims.coachRole,
    iat,
    exp,
  }

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload)
  )}`
  const signature = createHmac('sha256', secret).update(signingInput).digest()
  return `${signingInput}.${base64url(signature)}`
}

/**
 * Verify + decode a token minted by {@link mintSupabaseAccessToken}. Server-side
 * helper for tests/diagnostics — the actual RLS verification happens in Postgres.
 * Returns the payload, or throws on a bad signature / expiry.
 */
export function verifySupabaseAccessToken(token: string): Record<string, unknown> {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) throw new Error('SUPABASE_JWT_SECRET is not set.')

  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Malformed token.')
  const [headerB64, payloadB64, sigB64] = parts

  const expected = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest()
  const got = Buffer.from(sigB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    throw new Error('Bad signature.')
  }

  const payload = JSON.parse(
    Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  ) as Record<string, unknown>

  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired.')
  }
  return payload
}
