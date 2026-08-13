/**
 * Server-only portal helpers (import from route handlers / server components,
 * NEVER from middleware — this uses next/headers). The Edge-safe sign/verify
 * primitives live in ./session.
 */
import { cookies } from 'next/headers'
import { PORTAL_COOKIE, verifyPortalToken } from './session'

/** The authenticated portal clientId for this request, or null. */
export async function getPortalClientId(): Promise<string | null> {
  const token = cookies().get(PORTAL_COOKIE)?.value
  const s = await verifyPortalToken(token)
  return s?.clientId ?? null
}
