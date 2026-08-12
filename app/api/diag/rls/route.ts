import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { withOrgClaim } from '@/lib/supabase/pg'

// ⚠️ TEMPORARY DIAGNOSTIC — remove after diagnosing the prod direct-Postgres
// connection. Token-guarded, read-only (row counts only). Surfaces the exact
// error from the org-scoped pg path so we can see why prod reads failed.

export const dynamic = 'force-dynamic'

const DIAG_TOKEN = 'rls-diag-7f3a9c2e5b81'
const ORG1 = '00000000-0000-4000-8000-000000000001'
const ORG2 = '00000000-0000-4000-8000-000000000002'

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  if (token !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const host = (process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')

  // Control: service-role admin client should see all rows (proves DB reachable).
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

  // The real path: direct Postgres with per-transaction org claim. If the prod
  // SUPABASE_DB_URL connection fails, the error lands here verbatim.
  async function pgProbe(orgId: string) {
    try {
      const rows = await withOrgClaim(
        { orgId, coachId: 'diag', coachRole: 'coach' },
        (tx) => tx<{ n: number }[]>`select count(*)::int as n from notes`
      )
      return { orgId, count: rows?.[0]?.n ?? null, error: null }
    } catch (e) {
      return { orgId, count: null, error: e instanceof Error ? e.message : String(e) }
    }
  }
  const dbUrlSet = !!process.env.SUPABASE_DB_URL
  const pgProbes = dbUrlSet ? [await pgProbe(ORG1), await pgProbe(ORG2)] : []

  return NextResponse.json({ host, dbUrlSet, adminCount, adminErr, pgProbes })
}
