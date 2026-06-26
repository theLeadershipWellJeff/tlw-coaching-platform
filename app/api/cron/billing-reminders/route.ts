/**
 * GET /api/cron/billing-reminders
 *
 * Hourly Vercel Cron. Sends all scheduled invoice reminders whose send_at
 * has passed. Gated by CRON_SECRET Bearer token.
 *
 * Add to vercel.json:
 *   { "path": "/api/cron/billing-reminders", "schedule": "0 * * * *" }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { sendDueReminders } from '@/lib/billing/reminders'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const result = await sendDueReminders(supabase)
  return NextResponse.json(result)
}
