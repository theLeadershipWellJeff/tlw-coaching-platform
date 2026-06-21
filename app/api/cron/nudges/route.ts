import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { sendNudge } from '@/lib/nudges/send'
import type { Coach, Nudge } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * Nudge dispatcher. Vercel Cron hits this hourly. Sends every coach-APPROVED
 * nudge whose scheduled time has arrived (status = 'scheduled', scheduled_for in
 * the past). Each send goes through lib/nudges/send.ts, which enforces the spacing
 * rule and logs to communications — so a nudge blocked by spacing is simply left
 * for the coach (it stays 'scheduled' and is retried next run; the coach can
 * reschedule). Nothing here drafts or auto-approves: only the coach moves a nudge
 * to 'scheduled'.
 *
 * Protected by CRON_SECRET (Bearer), same as the reminders cron.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()

  const { data: due, error } = await supabase
    .from('nudges')
    .select('*')
    .eq('status', 'scheduled')
    .not('scheduled_for', 'is', null)
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!due || due.length === 0) return NextResponse.json({ sent: 0, considered: 0 })

  const coachIds = Array.from(new Set(due.map((n) => n.coach_id)))
  const { data: coaches } = await supabase.from('coaches').select('*').in('id', coachIds)
  const coachMap = new Map((coaches || []).map((c) => [c.id, c as Coach]))

  let sent = 0
  for (const nudge of due as Nudge[]) {
    const coach = coachMap.get(nudge.coach_id)
    if (!coach) continue
    const result = await sendNudge(supabase, coach, nudge).catch(() => ({ ok: false }))
    if (result.ok) sent++
  }

  return NextResponse.json({ sent, considered: due.length })
}
