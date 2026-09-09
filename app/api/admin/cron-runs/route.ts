import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The cron failure queue (migration 067, `cron_runs`) — supervisor-only.
 * `?status=failed` narrows to failures (default: everything), `?job=` to one
 * job, `?limit=` up to 500. Runs still `running` after an hour are reported
 * as `stale` — the function was killed before it could close its row.
 */
export async function GET(req: NextRequest) {
  try {
    const { supabase } = await adminContext()
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const job = url.searchParams.get('job')
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100))

    let q = supabase.from('cron_runs').select('*').order('started_at', { ascending: false }).limit(limit)
    if (status === 'failed') q = q.neq('status', 'ok')
    else if (status) q = q.eq('status', status)
    if (job) q = q.eq('job', job)
    const { data, error } = await q
    if (error) {
      if (/cron_runs/.test(error.message)) {
        return NextResponse.json({ runs: [], unavailable: true, error: 'Apply migration 067 (cron_runs).' })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const staleBefore = Date.now() - 60 * 60 * 1000
    const runs = (data || []).map((r) => ({
      ...r,
      stale: r.status === 'running' && new Date(r.started_at).getTime() < staleBefore,
    }))
    return NextResponse.json({ runs })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
