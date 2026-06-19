import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { sendAppointmentReminder, syncAppointmentFromCalendar } from '@/lib/appointments'
import type { Coach } from '@/lib/supabase/types'

export const runtime = 'nodejs'

/**
 * Reminder engine. Vercel Cron hits this hourly. Each run first RECONCILES every
 * upcoming session with its Google Calendar event (so a session the coach dragged
 * to a new time has its stored time — and its 24h nudge — shifted to match, and a
 * deleted event cancels the appointment), then sends the 24h-before nudge for any
 * scheduled session now inside the next 24 hours that hasn't been nudged yet.
 * Idempotent via the appointment_reminders unique index, so running it every hour
 * only ever sends each nudge once.
 *
 * Protected by CRON_SECRET — Vercel Cron passes it as a Bearer token. The route
 * refuses to run if the secret isn't configured, so it can't be triggered openly.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const now = Date.now()
  const windowEnd = new Date(now + 24 * 60 * 60 * 1000).toISOString()

  // Pass 1 — reconcile upcoming sessions with the calendar. Look back a couple of
  // days (an appointment moved later) and ahead far enough to catch one dragged
  // closer; volume is small, so syncing all of them each hour is cheap.
  const { data: toSync } = await supabase
    .from('appointments')
    .select('id, coach_id, scheduled_at, google_event_id, status')
    .eq('status', 'scheduled')
    .not('google_event_id', 'is', null)
    .gte('scheduled_at', new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString())
    .lte('scheduled_at', new Date(now + 45 * 24 * 60 * 60 * 1000).toISOString())
  if (toSync && toSync.length > 0) {
    const syncCoachIds = Array.from(new Set(toSync.map((a) => a.coach_id).filter(Boolean) as string[]))
    const { data: syncCoaches } = await supabase.from('coaches').select('*').in('id', syncCoachIds)
    const syncCoachMap = new Map((syncCoaches || []).map((c) => [c.id, c as Coach]))
    for (const appt of toSync) {
      const coach = appt.coach_id ? syncCoachMap.get(appt.coach_id) : null
      if (coach) await syncAppointmentFromCalendar(supabase, coach, appt)
    }
  }

  // Pass 2 — send the nudge. Re-read against the now-reconciled times.
  const { data: due, error } = await supabase
    .from('appointments')
    .select('id, coach_id, client_id, scheduled_at')
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date(now).toISOString())
    .lte('scheduled_at', windowEnd)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!due || due.length === 0) return NextResponse.json({ sent: 0, considered: 0 })

  // Already-nudged appointments — skip them without loading coach/client.
  const ids = due.map((a) => a.id)
  const { data: alreadySent } = await supabase
    .from('appointment_reminders')
    .select('appointment_id')
    .eq('kind', 'nudge_24h')
    .in('appointment_id', ids)
  const sentSet = new Set((alreadySent || []).map((r) => r.appointment_id))
  const pending = due.filter((a) => !sentSet.has(a.id))
  if (pending.length === 0) return NextResponse.json({ sent: 0, considered: due.length })

  // Batch-load the coaches and clients the pending nudges need.
  const coachIds = Array.from(new Set(pending.map((a) => a.coach_id).filter(Boolean) as string[]))
  const clientIds = Array.from(new Set(pending.map((a) => a.client_id)))
  const [{ data: coaches }, { data: clients }] = await Promise.all([
    supabase.from('coaches').select('*').in('id', coachIds),
    supabase.from('clients').select('id, name, email, timezone').in('id', clientIds),
  ])
  const coachMap = new Map((coaches || []).map((c) => [c.id, c as Coach]))
  const clientMap = new Map((clients || []).map((c) => [c.id, c]))

  let sent = 0
  for (const appt of pending) {
    const coach = appt.coach_id ? coachMap.get(appt.coach_id) : null
    const client = clientMap.get(appt.client_id)
    if (!coach || !client) continue
    const ok = await sendAppointmentReminder(supabase, coach, appt, client, 'nudge_24h')
    if (ok) sent++
  }

  return NextResponse.json({ sent, considered: due.length })
}
