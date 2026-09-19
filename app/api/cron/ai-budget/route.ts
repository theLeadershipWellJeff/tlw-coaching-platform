import { NextRequest, NextResponse } from 'next/server'
import { cronHandler } from '@/lib/cron-runs'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { releaseStale } from '@/lib/ai/budget'
import { checkOrgAlerts } from '@/lib/ai/alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * AI budget housekeeping (hourly, CRON_SECRET Bearer):
 *   1. release `reserved` ledger rows older than 15 minutes — a serverless
 *      function killed mid-call never settled them, and until released they
 *      count against every cap at their worst-case value;
 *   2. sweep the org-ceiling thresholds (50/80/100 %) in case the after-settle
 *      check was cut off. Claim-before-send inside, so nothing double-sends.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = getSupabaseAdmin()
  const released = await releaseStale(supabase, 15)
  const { data: orgs } = await supabase.from('organizations').select('id')
  for (const o of orgs || []) await checkOrgAlerts(supabase, o.id)
  return NextResponse.json({ ok: true, released, orgs: orgs?.length ?? 0 })
}

export const GET = cronHandler('ai-budget', handle)
