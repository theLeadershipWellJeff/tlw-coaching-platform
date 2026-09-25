/**
 * Server-only portal helpers (import from route handlers / server components,
 * NEVER from middleware — this uses next/headers). The Edge-safe sign/verify
 * primitives live in ./session.
 */
import { cookies } from 'next/headers'
import { PORTAL_COOKIE, verifyPortalToken } from './session'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { isPortalArchived } from './archive'

/** The authenticated portal clientId for this request, or null. */
export async function getPortalClientId(): Promise<string | null> {
  const token = cookies().get(PORTAL_COOKIE)?.value
  const s = await verifyPortalToken(token)
  const clientId = s?.clientId ?? null
  if (!clientId) return null
  // An archived portal user loses access immediately, even mid-session. A
  // failed lookup fails open: the cookie is the security boundary, and a
  // database blip must not sign every client out.
  try {
    const { data } = await getSupabaseAdmin().from('clients').select('portal_features').eq('id', clientId).maybeSingle()
    if (data && isPortalArchived(data.portal_features)) return null
  } catch {
    /* fail open */
  }
  return clientId
}
