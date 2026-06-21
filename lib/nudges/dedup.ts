/**
 * Dedup + restraint cap (§3.2, §3.3). Run AFTER extraction and BEFORE drafting so
 * the coach's queue is already trimmed to, at most, the single most important
 * still-open action plus the single most relevant insight.
 *
 * Dedup here is conservative on purpose:
 *  - Skip a candidate type that already has a live (draft/approved/scheduled)
 *    nudge for this client — re-running the generator must not pile up duplicates.
 *  - Skip a type already SENT for this same source session — never re-nudge the
 *    same session for the same reason.
 * Action check-ins are deliberately NOT deduped against the prior "send to client"
 * email: they fire on still-open actions and are framed as follow-ups, not
 * re-sends (§3.2).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { NudgeCandidate } from './types'
import { MAX_NUDGES_PER_WINDOW } from './settings'

export async function applyDedupAndCap(
  supabase: SupabaseClient<Database>,
  clientId: string,
  sourceSessionId: string | null,
  candidates: NudgeCandidate[]
): Promise<NudgeCandidate[]> {
  if (!candidates.length) return []

  // Types with a live nudge already in the queue for this client.
  const { data: live } = await supabase
    .from('nudges')
    .select('type, status, source_session_id')
    .eq('client_id', clientId)
    .in('status', ['draft', 'approved', 'scheduled'])
  const liveTypes = new Set((live || []).map((n) => n.type))

  // Types already sent for this same source session.
  const sentTypesForSession = new Set<string>()
  if (sourceSessionId) {
    const { data: sent } = await supabase
      .from('nudges')
      .select('type')
      .eq('client_id', clientId)
      .eq('source_session_id', sourceSessionId)
      .eq('status', 'sent')
    for (const n of sent || []) sentTypesForSession.add(n.type)
  }

  const survivors = candidates.filter(
    (c) => !liveTypes.has(c.type) && !sentTypesForSession.has(c.type)
  )

  // Cap: keep at most one of each type, in priority order — an action check-in
  // (most actionable), then a framework re-surfacing, then an insight — up to the
  // per-window maximum (so a relevant framework bumps the insight nudge).
  const ordered = [
    ...survivors.filter((c) => c.type === 'action_checkin').slice(0, 1),
    ...survivors.filter((c) => c.type === 'framework').slice(0, 1),
    ...survivors.filter((c) => c.type === 'insight').slice(0, 1),
  ]
  return ordered.slice(0, MAX_NUDGES_PER_WINDOW)
}
