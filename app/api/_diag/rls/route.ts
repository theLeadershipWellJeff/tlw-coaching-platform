import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, getSupabaseForClaims } from '@/lib/supabase/server'
import { mintSupabaseAccessToken } from '@/lib/supabase/jwt'

// ⚠️ TEMPORARY DIAGNOSTIC — NOT FOR MERGE TO main/production.
// Runs on a PR preview (which points at the STAGING Supabase project) to
// empirically answer why the §5.3 JWT client path returns zero rows in prod:
//   - what keys the project publishes (JWKS) → symmetric HS256 vs asymmetric
//   - what token our code actually mints (header alg/kid + payload claims)
//   - whether a real query is accepted (admin control + per-org JWT probes)
// Guarded by a shared token in the query string. Read-only; counts synthetic
// rows only. Delete this route before any real fix merges.

export const dynamic = 'force-dynamic'

const DIAG_TOKEN = 'rls-diag-7f3a9c2e5b81'
const ORG1 = '00000000-0000-4000-8000-000000000001' // staging Org A (default)
const ORG2 = '00000000-0000-4000-8000-000000000002' // staging Org B

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  if (token !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '')
  const host = url.replace(/^https?:\/\//, '')

  // 1) What keys does the project publish? Empty/no oct key => symmetric-only
  //    legacy project; EC/RSA entries => asymmetric signing keys.
  let jwksKeys: unknown = null
  let jwksErr: string | null = null
  try {
    const r = await fetch(`${url}/auth/v1/.well-known/jwks.json`, { cache: 'no-store' })
    const j = await r.json()
    jwksKeys = (j?.keys || []).map((k: Record<string, unknown>) => ({
      kid: k.kid,
      kty: k.kty,
      alg: k.alg,
    }))
  } catch (e) {
    jwksErr = e instanceof Error ? e.message : String(e)
  }

  // 2) What are we sending? (decode header + payload, no verification)
  let tokenHeader: unknown = null
  let tokenPayload: unknown = null
  try {
    const t = mintSupabaseAccessToken({ orgId: ORG1, coachId: 'diag', coachRole: 'coach' })
    const [h, p] = t.split('.')
    tokenHeader = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'))
    tokenPayload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'))
  } catch (e) {
    tokenHeader = { mintError: e instanceof Error ? e.message : String(e) }
  }

  // 3) Control: the service-role admin client should see ALL rows (proves the
  //    harness reaches the DB and the seed exists).
  let adminCount: number | null = null
  let adminErr: string | null = null
  try {
    const { count, error } = await getSupabaseAdmin()
      .from('notes')
      .select('*', { count: 'exact', head: true })
    adminCount = count ?? null
    if (error) adminErr = `${error.code || ''} ${error.message}`.trim()
  } catch (e) {
    adminErr = e instanceof Error ? e.message : String(e)
  }

  // 4) The real path: the JWT client, per org. Healthy fix => org1=8, org2=4,
  //    no error. Rejected token => an error (401/JWS) or null/0 counts.
  async function probe(orgId: string) {
    try {
      const db = getSupabaseForClaims({ orgId, coachId: 'diag', coachRole: 'coach' })
      const { count, error } = await db
        .from('notes')
        .select('*', { count: 'exact', head: true })
      return {
        orgId,
        count: count ?? null,
        error: error ? `${error.code || ''} ${error.message}`.trim() : null,
      }
    } catch (e) {
      return { orgId, count: null, error: e instanceof Error ? e.message : String(e) }
    }
  }
  const jwtProbes = [await probe(ORG1), await probe(ORG2)]

  return NextResponse.json({
    host,
    jwksErr,
    jwksKeys,
    tokenHeader,
    tokenPayload,
    adminCount,
    adminErr,
    jwtProbes,
  })
}
