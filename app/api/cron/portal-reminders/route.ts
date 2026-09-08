import { NextRequest, NextResponse } from 'next/server'
import { runPortalReminders } from '@/lib/portal/reminders'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Portal reminders — Vercel Cron hits this once a day (vercel.json, 15:00 UTC:
 * morning on the US west coast, late afternoon in Amman). Decides per client
 * whether a welcome / come-back / quarterly-goals reminder is due today and
 * sends at most one, claimed in portal_reminders first so nothing repeats.
 * `?dryRun=1` lists what would go without sending. CRON_SECRET (Bearer), same
 * as the other crons.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runPortalReminders({ dryRun: req.nextUrl.searchParams.get('dryRun') === '1' })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
