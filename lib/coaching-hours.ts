/**
 * Coaching hours — the shared loader behind the hours API and the ICF PDF
 * export. Merges two sources into one chronological log:
 *
 *   1. Note-derived sessions (`notes.duration_minutes`, the in-app record) —
 *      source 'note'.
 *   2. Imported/historical entries (`coaching_hours_entries`, migration 049) —
 *      source 'imported': CSV rows, hand-logged historical sessions, or a
 *      single 'aggregate' block of prior hours ("Prior coaching hours
 *      2015–2024"), so the app can be the canonical lifetime record.
 *
 * The imported-entries read is DEFENSIVE: if migration 049 hasn't been applied
 * yet the table read errors and we fall back to notes-only (the log still
 * works; only import/export of historical hours needs the table).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Coach, Database } from '@/lib/supabase/types'
import { accessibleClientIds } from '@/lib/client-access'
import { billedHours } from '@/lib/billing'

export type HoursPeriod = 'week' | 'month' | 'year' | 'all'

export interface HoursSession {
  id: string
  session_date: string
  duration_minutes: number
  billed_hours: number
  title: string | null
  client_id: string | null
  client_name: string
  source: 'note' | 'imported'
  kind: 'session' | 'aggregate'
  paid: boolean
}

export interface HoursLog {
  total_minutes: number
  total_hours: number
  paid_minutes: number
  pro_bono_minutes: number
  sessions: HoursSession[]
  /** False when the coaching_hours_entries table isn't reachable (049 not applied). */
  imports_available: boolean
}

export function periodStart(period: string): string {
  const now = new Date()
  if (period === 'all') return '0001-01-01'
  if (period === 'year') {
    return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
  }
  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  }
  // week: Monday of the current week
  const day = now.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(now)
  mon.setDate(now.getDate() + diff)
  return mon.toISOString().slice(0, 10)
}

export function roundHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10
}

export async function loadCoachingHours(
  supabase: SupabaseClient<Database>,
  coach: Coach,
  period: HoursPeriod
): Promise<HoursLog> {
  const start = periodStart(period)
  const sessions: HoursSession[] = []

  // 1) Note-derived sessions (in-app record). Client sessions are paid work.
  const ids = await accessibleClientIds(supabase, coach.id)
  if (ids.length > 0) {
    const { data: notes, error } = await supabase
      .from('notes')
      .select('id, session_date, duration_minutes, title, client_id')
      .in('client_id', ids)
      .gte('session_date', start)
      .order('session_date', { ascending: false })
    if (error) throw new Error(error.message)

    const clientIds = Array.from(new Set((notes || []).map((n) => n.client_id)))
    const { data: clients } = clientIds.length
      ? await supabase.from('clients').select('id, name').in('id', clientIds)
      : { data: [] }
    const nameMap: Record<string, string> = {}
    for (const c of clients || []) nameMap[c.id] = c.name

    for (const n of notes || []) {
      const minutes = n.duration_minutes ?? 60
      sessions.push({
        id: n.id,
        session_date: n.session_date,
        duration_minutes: minutes,
        billed_hours: billedHours(minutes),
        title: n.title,
        client_id: n.client_id,
        client_name: nameMap[n.client_id] || 'Unknown client',
        source: 'note',
        kind: 'session',
        paid: true,
      })
    }
  }

  // 2) Imported/historical entries. Defensive: pre-migration the table read
  // errors — degrade to notes-only rather than breaking the whole log.
  let importsAvailable = true
  const { data: entries, error: entriesError } = await supabase
    .from('coaching_hours_entries')
    .select('id, session_date, duration_minutes, client_label, title, kind, paid')
    .eq('coach_id', coach.id)
    .gte('session_date', start)
    .order('session_date', { ascending: false })
  if (entriesError) {
    importsAvailable = false
  } else {
    for (const e of entries || []) {
      sessions.push({
        id: e.id,
        session_date: e.session_date,
        duration_minutes: e.duration_minutes,
        // Historical hours aren't billed through the app — report actual hours.
        billed_hours: roundHours(e.duration_minutes),
        title: e.title,
        client_id: null,
        client_name: e.client_label,
        source: 'imported',
        kind: e.kind === 'aggregate' ? 'aggregate' : 'session',
        paid: e.paid !== false,
      })
    }
  }

  sessions.sort((a, b) => b.session_date.localeCompare(a.session_date))

  const total_minutes = sessions.reduce((s, n) => s + n.duration_minutes, 0)
  const paid_minutes = sessions.filter((s) => s.paid).reduce((s, n) => s + n.duration_minutes, 0)

  return {
    total_minutes,
    total_hours: roundHours(total_minutes),
    paid_minutes,
    pro_bono_minutes: total_minutes - paid_minutes,
    sessions,
    imports_available: importsAvailable,
  }
}
