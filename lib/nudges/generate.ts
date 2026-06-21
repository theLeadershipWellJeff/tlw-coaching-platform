/**
 * Nudge generation orchestrator (Phase A).
 *
 * load context → extract candidates → dedup + cap → draft → write to `nudges` as
 * `draft`. Nothing here sends; the coach reviews everything in the queue first.
 *
 * Key-info wall (§3.1): this loader selects an explicit column list that OMITS
 * clients.key_info. The private field is never read into the pipeline at all.
 *
 * Best-effort by contract: callers (the scoring store, the manual route) wrap this
 * so a failure never breaks scoring or the workspace.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CoachingGoal, Database, Nudge } from '@/lib/supabase/types'
import { extractNudgeCandidates } from './extract'
import { applyDedupAndCap } from './dedup'
import { draftNudge } from './draft'
import { loadSurfaceableLeaves, loadFrameworkContext } from './garden'

// Strip note HTML to plain text (block tags → newlines). Local copy of the
// helper in lib/notes/sync-actions.ts; kept here to avoid widening that module.
function htmlToText(html: string): string {
  return (html || '')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

export type GenerateResult = { created: number; nudges: Nudge[] }

export async function generateNudgesForClient(
  supabase: SupabaseClient<Database>,
  opts: { clientId: string; coachId: string; sourceSessionId?: string | null }
): Promise<GenerateResult> {
  const { clientId, coachId } = opts
  const sourceSessionId = opts.sourceSessionId ?? null

  // --- Load context (NO key_info) ---
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, email, coaching_goals')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return { created: 0, nudges: [] }

  const [{ data: notes }, { data: actions }, nextAppt, transcriptBody] = await Promise.all([
    supabase
      .from('notes')
      .select('content')
      .eq('client_id', clientId)
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('actions')
      .select('description')
      .eq('client_id', clientId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(20),
    loadNextAppointment(supabase, clientId),
    sourceSessionId ? loadTranscriptBody(supabase, sourceSessionId) : Promise.resolve(null),
  ])

  const goals: CoachingGoal[] = Array.isArray(client.coaching_goals) ? client.coaching_goals : []
  const openActions = Array.from(
    new Set((actions || []).map((a) => a.description).filter(Boolean))
  )
  const recentNotes = (notes || [])
    .map((n) => htmlToText(n.content))
    .filter(Boolean)
    .slice(0, 3)

  // The coach's client-surfaceable garden frameworks (Phase B). Empty = no
  // framework candidates possible this run.
  const frameworks = await loadSurfaceableLeaves(supabase, coachId)

  // --- Extract ---
  const candidates = await extractNudgeCandidates({
    clientName: client.name,
    goals: goals.map((g) => ({ title: g.title, description: g.description })),
    openActions,
    recentNotes,
    transcript: transcriptBody,
    frameworks,
  })
  if (!candidates.length) return { created: 0, nudges: [] }

  // --- Dedup + cap (before drafting) ---
  const trimmed = await applyDedupAndCap(supabase, clientId, sourceSessionId, candidates)
  if (!trimmed.length) return { created: 0, nudges: [] }

  // Bounded timing only (§Phase A): if a next session is booked, suggest the
  // midpoint between now and then; otherwise leave the time unset for the coach.
  const scheduledFor = nextAppt ? midpoint(new Date(), nextAppt) : null
  const firstName = client.name.split(/\s+/)[0] || client.name
  const upcomingContext = nextAppt ? `the client's next session is already booked` : null

  // --- Draft + persist ---
  const created: Nudge[] = []
  for (const candidate of trimmed) {
    // For a framework nudge, pull the leaf's live content + neighbours to draft from.
    const frameworkContext =
      candidate.type === 'framework' && candidate.framework_slug
        ? await loadFrameworkContext(supabase, coachId, candidate.framework_slug)
        : null
    // A framework whose context can't be loaded (e.g. leaf pruned) is skipped.
    if (candidate.type === 'framework' && !frameworkContext) continue

    const draft = await draftNudge({ clientFirstName: firstName, candidate, upcomingContext, frameworkContext })
    if (!draft) continue
    const { data: row, error } = await supabase
      .from('nudges')
      .insert({
        coach_id: coachId,
        client_id: clientId,
        source_session_id: sourceSessionId,
        type: candidate.type,
        origin: candidate.origin,
        trigger_excerpt: candidate.trigger_excerpt || null,
        rationale: candidate.rationale || null,
        framework_slug: candidate.framework_slug || null,
        draft_subject: draft.subject,
        draft_body: draft.body,
        status: 'draft',
        scheduled_for: scheduledFor ? scheduledFor.toISOString() : null,
      })
      .select('*')
      .single()
    if (!error && row) created.push(row)
  }

  return { created: created.length, nudges: created }
}

async function loadNextAppointment(
  supabase: SupabaseClient<Database>,
  clientId: string
): Promise<Date | null> {
  const { data } = await supabase
    .from('appointments')
    .select('scheduled_at')
    .eq('client_id', clientId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.scheduled_at ? new Date(data.scheduled_at) : null
}

async function loadTranscriptBody(
  supabase: SupabaseClient<Database>,
  transcriptId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('transcripts')
    .select('raw_md')
    .eq('id', transcriptId)
    .maybeSingle()
  return data?.raw_md ?? null
}

function midpoint(a: Date, b: Date): Date {
  return new Date(a.getTime() + (b.getTime() - a.getTime()) / 2)
}
