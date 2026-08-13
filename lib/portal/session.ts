/**
 * Client Portal session token — a signed cookie carrying only the authenticated
 * `clientId`. This is DISTINCT from the coach's NextAuth session: the portal is a
 * separate surface, and a coach session is never accepted here (nor vice-versa).
 *
 * Signed/verified with Web Crypto (HMAC-SHA256) so the exact same code runs in
 * both the Edge middleware and Node route handlers. Signing key = NEXTAUTH_SECRET
 * (already a strong server secret — no new env var). No Node `crypto`/`Buffer`
 * here, so this module is safe to import from middleware.
 */

export const PORTAL_COOKIE = 'tlw_portal_session'
export const PORTAL_SESSION_TTL_SECONDS = 7 * 24 * 3600 // 7 days

function b64urlFromBytes(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlFromString(str: string): string {
  return b64urlFromBytes(new TextEncoder().encode(str))
}

function bytesFromB64url(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function stringFromB64url(b64url: string): string {
  return new TextDecoder().decode(bytesFromB64url(b64url))
}

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is not set — required to sign portal sessions.')
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

/** Sign a portal session token for this client. */
export async function signPortalToken(
  clientId: string,
  ttlSeconds = PORTAL_SESSION_TTL_SECONDS
): Promise<string> {
  const header = b64urlFromString(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payload = b64urlFromString(
    JSON.stringify({ sub: clientId, portal: true, iat: now, exp: now + ttlSeconds })
  )
  const data = `${header}.${payload}`
  const key = await getKey()
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
  return `${data}.${b64urlFromBytes(sig)}`
}

/** Verify a portal session token; returns the clientId or null (bad sig/expired). */
export async function verifyPortalToken(
  token: string | undefined | null
): Promise<{ clientId: string } | null> {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, sig] = parts
  try {
    const key = await getKey()
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      bytesFromB64url(sig) as BufferSource,
      new TextEncoder().encode(`${header}.${payload}`) as BufferSource
    )
    if (!ok) return null
    const claims = JSON.parse(stringFromB64url(payload)) as {
      sub?: string
      portal?: boolean
      exp?: number
    }
    if (!claims.sub || claims.portal !== true || typeof claims.exp !== 'number') return null
    if (claims.exp < Math.floor(Date.now() / 1000)) return null
    return { clientId: claims.sub }
  } catch {
    return null
  }
}

/** Cookie attributes for the portal session (set on login, cleared on logout). */
export function portalCookieOptions(maxAge = PORTAL_SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}
