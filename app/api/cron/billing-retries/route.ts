/**
 * GET /api/cron/billing-retries
 *
 * Hourly Vercel Cron (gated by CRON_SECRET Bearer). Runs the billing maintenance
 * sweep: due charge retries (capped), dormancy marking, and 24-month inactivity
 * auto-detach. See lib/billing/retries.ts.
 *
 * Add to vercel.json: { "path": "/api/cron/billing-retries", "schedule": "0 * * * *" }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { runBillingMaintenance } from '@/lib/billing/retries'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = getSupabaseAdmin()
  const result = await runBillingMaintenance(supabase)
  return NextResponse.json(result)
}
