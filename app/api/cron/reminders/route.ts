import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { sendAppointmentReminder } from '@/lib/appointments'
import type { Coach } from '@/lib/supabase/types'

export const runtime = 'nodejs'

/**
 * Reminder engine. Vercel Cron hits this hourly; it sends the 24h-before nudge
 * for any scheduled session falling inside the next 24 hours that hasn't been
 * nudged yet. Idempotent via the appointment_reminders unique index, so running
 * it every hour only ever sends each nudge once.
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
