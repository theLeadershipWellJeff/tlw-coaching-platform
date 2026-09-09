/**
 * Coach attention queue — task generation (Phase 1 of the Coach Attention
 * Queue build; migration 067, `coach_tasks`).
 *
 * Runs as a pass inside the hourly `/api/cron/reminders` handler. For every
 * coach, every appointment that ENDED ≥ 3 hours ago gets exactly one task:
 *
 *   no session note for the appointment            → write_note
 *   a note exists and is still a draft             → send_note
 *   the note was sent (050 stamp or status 'sent') → task resolved 'sent'
 *   the note was filed (status 'filed')            → task resolved 'filed'
 *
 * The pass is a RECONCILE, not just a creator: a pending write_note becomes a
 * send_note once the coach has written the note, and a pending task resolves
 * itself when the coach sends or files outside the task flow. A task that was
 * already resolved (any state) is never recreated for that appointment.
 *
 * Note ↔ appointment matching: `notes.calendar_event_id = appointments
 * .google_event_id` when both are set (the write_note flow will stamp it),
 * else the most recent note for the same client whose session_date is the
 * appointment's date in the coach's timezone. Without the fallback, every note
 * written today outside the task flow would look like "no note".
 *
 * Forward-only: appointments that ended before COACH_TASKS_EPOCH never get a
 * task (no backfill of history). The lookback window bounds the query and lets
 * a dead cron catch up when it comes back.
 *
 * Isolation: the cron loops coaches and every query is scoped to that coach —
 * appointments by coach_id, tasks by coach_id, notes by the client ids of that
 * coach's own appointments. No cross-coach read or write is possible here.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CoachTaskState, CoachTaskType, Database } from '../supabase/types'
import { ymdInTimeZone } from '../datetime'

type Db = SupabaseClient<Database>

/** Appointment end + this delay = the task's due_at. Locked at 3 hours. */
export const TASK_DELAY_MS = 3 * 60 * 60 * 1000
/** Tasks generate forward from deploy only — nothing before this instant. */
export const COACH_TASKS_EPOCH = '2026-09-09T00:00:00Z'
/** How far back a run looks (catch-up after a dead cron), bounded by the epoch. */
export const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000

export type ApptLike = {
  id: string
  coach_id: string | null
  client_id: string | null
  scheduled_at: string
  duration_minutes: number
  google_event_id: string | null
  status: string
}

export type NoteLike = {
  id: string
  client_id: string
  session_date: string
  calendar_event_id: string | null
  status?: string | null
  sent_to_client_at?: string | null
  filed_at?: string | null
  created_at?: string
}

export type TaskLike = {
  id: string
  appointment_id: string | null
  task_type: string
  state: string
}

export type Classification =
  | { kind: 'not_due' }
  | { kind: 'task'; taskType: CoachTaskType; dueAt: string; noteId: string | null }
  | { kind: 'resolved'; as: Extract<CoachTaskState, 'sent' | 'filed'>; dueAt: string; noteId: string }

export function appointmentEndMs(appt: Pick<ApptLike, 'scheduled_at' | 'duration_minutes'>): number {
  const dur = Number.isFinite(appt.duration_minutes) && appt.duration_minutes > 0 ? appt.duration_minutes : 60
  return new Date(appt.scheduled_at).getTime() + dur * 60 * 1000
}

/** A note counts as sent on EITHER signal — the 050 stamp is the standing truth. */
export function noteIsSent(note: Pick<NoteLike, 'status' | 'sent_to_client_at'>): boolean {
  return note.status === 'sent' || !!note.sent_to_client_at
}

export function noteIsFiled(note: Pick<NoteLike, 'status' | 'filed_at'>): boolean {
  return note.status === 'filed' || !!note.filed_at
}

/** Pick the note that belongs to this appointment (event id first, then same local date). */
export function findNoteForAppointment(appt: ApptLike, notes: NoteLike[], coachTimeZone: string): NoteLike | null {
  const own = notes.filter((n) => n.client_id === appt.client_id)
  if (own.length === 0) return null
  if (appt.google_event_id) {
    const byEvent = own.filter((n) => n.calendar_event_id === appt.google_event_id)
    if (byEvent.length > 0) return newest(byEvent)
  }
  const day = ymdInTimeZone(new Date(appt.scheduled_at), coachTimeZone)
  const byDate = own.filter((n) => !n.calendar_event_id && n.session_date === day)
  return byDate.length > 0 ? newest(byDate) : null
}

function newest(notes: NoteLike[]): NoteLike {
  return [...notes].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]
}

/** Pure: what this appointment needs right now. */
export function classifyAppointment(appt: ApptLike, notes: NoteLike[], coachTimeZone: string, nowMs: number): Classification {
  const endMs = appointmentEndMs(appt)
  if (Number.isNaN(endMs)) return { kind: 'not_due' }
  if (endMs < new Date(COACH_TASKS_EPOCH).getTime()) return { kind: 'not_due' }
  if (nowMs - endMs < TASK_DELAY_MS) return { kind: 'not_due' }
  const dueAt = new Date(endMs + TASK_DELAY_MS).toISOString()
  const note = findNoteForAppointment(appt, notes, coachTimeZone)
  if (!note) return { kind: 'task', taskType: 'write_note', dueAt, noteId: null }
  if (noteIsSent(note)) return { kind: 'resolved', as: 'sent', dueAt, noteId: note.id }
  if (noteIsFiled(note)) return { kind: 'resolved', as: 'filed', dueAt, noteId: note.id }
  return { kind: 'task', taskType: 'send_note', dueAt, noteId: note.id }
}

export type TaskChange =
  | { op: 'none' }
  | { op: 'insert'; taskType: CoachTaskType; dueAt: string }
  | { op: 'convert'; taskId: string; taskType: CoachTaskType }
  | { op: 'resolve'; taskId: string; state: 'sent' | 'filed' }

/** Pure: given the appointment's existing tasks and its classification, the one change to make. */
export function planTaskChange(existing: TaskLike[], c: Classification): TaskChange {
  if (c.kind === 'not_due') return { op: 'none' }
  const pending = existing.find((t) => t.state === 'pending')
  if (pending) {
    if (c.kind === 'resolved') return { op: 'resolve', taskId: pending.id, state: c.as }
    if (pending.task_type !== c.taskType) return { op: 'convert', taskId: pending.id, taskType: c.taskType }
    return { op: 'none' }
  }
  // A resolved task (any terminal state) means this appointment is done — never recreate.
  if (existing.length > 0) return { op: 'none' }
  if (c.kind === 'resolved') return { op: 'none' } // handled outside the queue before a task was ever due
  return { op: 'insert', taskType: c.taskType, dueAt: c.dueAt }
}

export type GenerateSummary = {
  coaches: number
  considered: number
  created: number
  converted: number
  resolved: number
  duplicates: number
  errors: string[]
}

/** The cron pass. Loops coaches; every query scoped to the coach in hand. */
export async function generateCoachTasks(supabase: Db, opts: { now?: Date } = {}): Promise<GenerateSummary> {
  const now = opts.now ?? new Date()
  const nowMs = now.getTime()
  const summary: GenerateSummary = { coaches: 0, considered: 0, created: 0, converted: 0, resolved: 0, duplicates: 0, errors: [] }

  const { data: coaches, error: coachErr } = await supabase.from('coaches').select('id, timezone')
  if (coachErr) throw new Error(`coaches: ${coachErr.message}`)

  const sinceIso = new Date(Math.max(nowMs - LOOKBACK_MS, new Date(COACH_TASKS_EPOCH).getTime())).toISOString()
  const untilIso = new Date(nowMs - TASK_DELAY_MS).toISOString() // ended ≥3h ago ⇒ started before this

  for (const coach of coaches || []) {
    summary.coaches++
    try {
      const { data: appts, error: apptErr } = await supabase
        .from('appointments')
        .select('id, coach_id, client_id, scheduled_at, duration_minutes, google_event_id, status')
        .eq('coach_id', coach.id)
        .in('status', ['scheduled', 'completed'])
        .not('client_id', 'is', null)
        .gte('scheduled_at', sinceIso)
        .lte('scheduled_at', untilIso)
      if (apptErr) throw new Error(`appointments: ${apptErr.message}`)
      if (!appts || appts.length === 0) continue

      const apptIds = appts.map((a) => a.id)
      const clientIds = Array.from(new Set(appts.map((a) => a.client_id).filter((id): id is string => !!id)))
      const [{ data: notes, error: noteErr }, { data: tasks, error: taskErr }] = await Promise.all([
        supabase
          .from('notes')
          .select('id, client_id, session_date, calendar_event_id, status, sent_to_client_at, filed_at, created_at')
          .in('client_id', clientIds)
          .gte('session_date', sinceIso.slice(0, 10)),
        supabase.from('coach_tasks').select('id, appointment_id, task_type, state').eq('coach_id', coach.id).in('appointment_id', apptIds),
      ])
      if (noteErr) throw new Error(`notes: ${noteErr.message}`)
      if (taskErr) throw new Error(`coach_tasks: ${taskErr.message}`)

      const tz = coach.timezone || process.env.DEFAULT_TIMEZONE || 'UTC'
      for (const appt of appts as ApptLike[]) {
        const c = classifyAppointment(appt, (notes || []) as NoteLike[], tz, nowMs)
        if (c.kind === 'not_due') continue
        summary.considered++
        const change = planTaskChange((tasks || []).filter((t) => t.appointment_id === appt.id), c)
        if (change.op === 'none') continue
        if (change.op === 'insert') {
          const { error } = await supabase.from('coach_tasks').insert({
            coach_id: coach.id,
            client_id: appt.client_id,
            appointment_id: appt.id,
            subject_type: 'session_note',
            task_type: change.taskType,
            state: 'pending',
            due_at: change.dueAt,
          })
          if (error) {
            // 23505 = the partial unique index fired (a concurrent run got there first). Benign.
            if (error.code === '23505') summary.duplicates++
            else throw new Error(`insert task for appointment ${appt.id}: ${error.message}`)
          } else summary.created++
        } else if (change.op === 'convert') {
          const { error } = await supabase
            .from('coach_tasks')
            .update({ task_type: change.taskType })
            .eq('id', change.taskId)
            .eq('coach_id', coach.id)
            .eq('state', 'pending')
          if (error) throw new Error(`convert task ${change.taskId}: ${error.message}`)
          summary.converted++
        } else if (change.op === 'resolve') {
          const { error } = await supabase
            .from('coach_tasks')
            .update({
              state: change.state,
              resolved_at: now.toISOString(),
              resolved_by: null,
              resolution_note: `Reconciled by cron: note already ${change.state}`,
            })
            .eq('id', change.taskId)
            .eq('coach_id', coach.id)
            .eq('state', 'pending')
          if (error) throw new Error(`resolve task ${change.taskId}: ${error.message}`)
          summary.resolved++
        }
      }
    } catch (e) {
      // One coach's failure must not stop the others — but it is never silent:
      // the errors list makes the run read as failed in cron_runs.
      summary.errors.push(`coach ${coach.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return summary
}
