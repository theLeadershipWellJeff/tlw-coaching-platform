/**
 * Coach attention queue — the coach-facing read + resolve paths (Phase 2).
 *
 * Every function here takes the signed-in coach and scopes every query by
 * `coach_id` (and, for notes, by the client ids of that coach's own tasks).
 * There are no RLS policies on coach_tasks — this file IS the isolation.
 *
 * Resolution vocabulary (kept distinct in the UI):
 *   file    — a session note EXISTS and stays internal (note → 'filed')
 *   dismiss — no note is needed for this session (nothing written to notes)
 * Both stamp resolved_at + resolved_by (the acting coach) + a resolution_note.
 * No snooze.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Coach, Database } from '../supabase/types'
import { ApiError } from '../api-handler'
import { ymdInTimeZone } from '../datetime'
import { LOOKBACK_MS, findNoteForAppointment, type ApptLike, type NoteLike } from './generate'

type Db = SupabaseClient<Database>

export type QueueTask = {
  id: string
  task_type: string
  state: string
  due_at: string
  created_at: string
  digest_count: number
  client: { id: string; name: string } | null
  appointment: { id: string; scheduled_at: string; duration_minutes: number } | null
  note: { id: string; title: string | null } | null
}

const NOTE_COLS = 'id, client_id, session_date, calendar_event_id, status, sent_to_client_at, filed_at, created_at, title'
type NoteRow = NoteLike & { title: string | null }

/** Load the notes that could belong to these clients' recent sessions (coach-scoped by construction). */
async function loadCandidateNotes(supabase: Db, clientIds: string[]): Promise<NoteRow[]> {
  if (clientIds.length === 0) return []
  const since = new Date(Date.now() - LOOKBACK_MS - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data, error } = await supabase.from('notes').select(NOTE_COLS).in('client_id', clientIds).gte('session_date', since)
  if (error) throw new ApiError(500, `notes: ${error.message}`)
  return (data || []) as NoteRow[]
}

/** Pending tasks for the coach, newest session first, enriched for the card. */
export async function listPendingTasks(supabase: Db, coach: Coach): Promise<QueueTask[]> {
  const { data: tasks, error } = await supabase
    .from('coach_tasks')
    .select('id, task_type, state, due_at, created_at, digest_count, client_id, appointment_id')
    .eq('coach_id', coach.id)
    .eq('state', 'pending')
    .order('due_at', { ascending: false })
  if (error) throw new ApiError(500, `coach_tasks: ${error.message}`)
  if (!tasks || tasks.length === 0) return []

  const clientIds = Array.from(new Set(tasks.map((t) => t.client_id).filter((id): id is string => !!id)))
  const apptIds = Array.from(new Set(tasks.map((t) => t.appointment_id).filter((id): id is string => !!id)))
  const [{ data: clients }, { data: appts }, notes] = await Promise.all([
    clientIds.length ? supabase.from('clients').select('id, name').in('id', clientIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    apptIds.length
      ? supabase.from('appointments').select('id, coach_id, client_id, scheduled_at, duration_minutes, google_event_id, status').in('id', apptIds).eq('coach_id', coach.id)
      : Promise.resolve({ data: [] as ApptLike[] }),
    loadCandidateNotes(supabase, clientIds),
  ])
  const clientMap = new Map((clients || []).map((c) => [c.id, c]))
  const apptMap = new Map(((appts || []) as ApptLike[]).map((a) => [a.id, a]))
  const tz = coach.timezone || 'UTC'

  return tasks.map((t) => {
    const appt = t.appointment_id ? apptMap.get(t.appointment_id) ?? null : null
    const note = appt ? (findNoteForAppointment(appt, notes, tz) as NoteRow | null) : null
    const client = t.client_id ? clientMap.get(t.client_id) ?? null : null
    return {
      id: t.id,
      task_type: t.task_type,
      state: t.state,
      due_at: t.due_at,
      created_at: t.created_at,
      digest_count: t.digest_count,
      client: client ? { id: client.id, name: client.name } : null,
      appointment: appt ? { id: appt.id, scheduled_at: appt.scheduled_at, duration_minutes: appt.duration_minutes } : null,
      note: note ? { id: note.id, title: note.title ?? null } : null,
    }
  })
}

type PendingTaskRow = {
  id: string
  client_id: string | null
  appointment_id: string | null
  task_type: string
}

/** The coach's own pending task, or 404. */
async function loadPendingTask(supabase: Db, coach: Coach, taskId: string): Promise<PendingTaskRow> {
  const { data, error } = await supabase
    .from('coach_tasks')
    .select('id, client_id, appointment_id, task_type')
    .eq('id', taskId)
    .eq('coach_id', coach.id)
    .eq('state', 'pending')
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Task not found.')
  return data
}

async function loadTaskAppointment(supabase: Db, coach: Coach, task: PendingTaskRow): Promise<ApptLike | null> {
  if (!task.appointment_id) return null
  const { data } = await supabase
    .from('appointments')
    .select('id, coach_id, client_id, scheduled_at, duration_minutes, google_event_id, status')
    .eq('id', task.appointment_id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  return (data as ApptLike | null) ?? null
}

/** The session note this task is about, if one exists (same matching as the generator). */
export async function findTaskNote(supabase: Db, coach: Coach, task: PendingTaskRow): Promise<NoteRow | null> {
  const appt = await loadTaskAppointment(supabase, coach, task)
  if (!appt || !task.client_id) return null
  const notes = await loadCandidateNotes(supabase, [task.client_id])
  return findNoteForAppointment(appt, notes, coach.timezone || 'UTC') as NoteRow | null
}

export type ResolveAction = 'file' | 'dismiss'

/**
 * Resolve a pending task. The update is conditional on `state = 'pending'` and
 * selected back, so two tabs resolving the same task see exactly one success
 * (the second gets 409). Filing also marks the note itself 'filed'.
 */
export async function resolveTask(supabase: Db, coach: Coach, taskId: string, action: ResolveAction) {
  const task = await loadPendingTask(supabase, coach, taskId)
  const now = new Date().toISOString()
  let noteId: string | null = null

  if (action === 'file') {
    const note = await findTaskNote(supabase, coach, task)
    if (!note) {
      throw new ApiError(400, 'There is no session note for this session to file. Use Dismiss if no note is needed.')
    }
    const { error } = await supabase
      .from('notes')
      .update({ status: 'filed', filed_at: now })
      .eq('id', note.id)
      .eq('client_id', task.client_id!)
    if (error) throw new ApiError(500, `Could not file the note: ${error.message}`)
    noteId = note.id
  }

  const state = action === 'file' ? 'filed' : 'dismissed'
  const { data, error } = await supabase
    .from('coach_tasks')
    .update({
      state,
      resolved_at: now,
      resolved_by: coach.id,
      resolution_note: action === 'file' ? 'Filed from the dashboard (note kept internal)' : 'Dismissed from the dashboard (no note needed)',
    })
    .eq('id', task.id)
    .eq('coach_id', coach.id)
    .eq('state', 'pending')
    .select('id, state, resolved_at, resolved_by')
  if (error) throw new ApiError(500, error.message)
  if (!data || data.length === 0) throw new ApiError(409, 'This task was already resolved.')
  return { task: data[0], noteId }
}

/**
 * The note a `write_note` task should open — found if one already exists for
 * the session, otherwise created and STAMPED with the appointment's calendar
 * event id so the generator (and this queue) can tie it to the session
 * without guessing by date. Returns where the editor should navigate.
 */
export async function noteForTask(supabase: Db, coach: Coach, taskId: string): Promise<{ clientId: string; noteId: string; created: boolean }> {
  const task = await loadPendingTask(supabase, coach, taskId)
  if (!task.client_id) throw new ApiError(400, 'This task has no client.')
  const existing = await findTaskNote(supabase, coach, task)
  if (existing) return { clientId: task.client_id, noteId: existing.id, created: false }

  const appt = await loadTaskAppointment(supabase, coach, task)
  const tz = coach.timezone || 'UTC'
  const sessionDate = appt ? ymdInTimeZone(new Date(appt.scheduled_at), tz) : ymdInTimeZone(new Date(), tz)
  const { data: client } = await supabase.from('clients').select('id, name').eq('id', task.client_id).maybeSingle()
  const dateLabel = new Date(sessionDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const title = client?.name ? `${client.name} · ${dateLabel}` : dateLabel

  const { data: note, error } = await supabase
    .from('notes')
    .insert({
      client_id: task.client_id,
      session_date: sessionDate,
      title,
      content: '',
      duration_minutes: appt?.duration_minutes && appt.duration_minutes > 0 ? appt.duration_minutes : 60,
      calendar_event_id: appt?.google_event_id ?? null,
    })
    .select('id')
    .single()
  if (error) throw new ApiError(500, `Could not create the note: ${error.message}`)
  return { clientId: task.client_id, noteId: note.id, created: true }
}
