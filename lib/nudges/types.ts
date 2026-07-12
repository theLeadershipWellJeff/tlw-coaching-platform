/**
 * Nudge domain types — the candidate contract the extraction step returns and the
 * drafting step consumes (handoff §7). Kept separate from the DB row type (Nudge
 * in lib/supabase/types.ts) so the pipeline shape can evolve independently of
 * storage.
 */

// Phase A produces action_checkin + insight; framework arrived in Phase B.
// 'goals' is a manual-only type (created from the Create Nudge modal around the
// client's engagement goals); reengagement is reserved for a later phase.
export type NudgeType = 'action_checkin' | 'insight' | 'framework' | 'goals' | 'reengagement'
export type NudgeOrigin = 'mentioned' | 'suggested' | 'auto' | 'manual'
export type NudgeStatus = 'draft' | 'approved' | 'scheduled' | 'sent' | 'skipped' | 'snoozed'

/** The three flavors of a goals nudge — see lib/nudges/draft.ts voice rules. */
export type GoalsNudgeAngle = 'reminder' | 'assessment' | 'win'

/** Context handed to drafting for a goals nudge: the angle + the goal(s) in focus. */
export type GoalsDraftContext = {
  angle: GoalsNudgeAngle
  /** The selected goal, or every goal when the coach picked "All goals". */
  goals: { title: string; description?: string; metrics?: string[] }[]
  allGoals: boolean
}

/**
 * One nudge candidate from extraction, before dedup/cap and before drafting.
 * `proposed_send_window` is a hint the model returns; actual scheduling is decided
 * in the generator (bounded midpoint) and is editable by the coach.
 */
export type NudgeCandidate = {
  type: NudgeType
  origin: NudgeOrigin
  // The note/transcript snippet that grounds this nudge (shown to the coach).
  trigger_excerpt: string
  // One line: why this was proposed (shown to the coach).
  rationale: string
  // For an action_checkin: the exact still-open action description it follows up
  // on, so dedup can match it and drafting can reference it precisely.
  action_description?: string
  // Reserved for later phases.
  framework_slug?: string
  linked_resource_slug?: string
}

/** A drafted message: subject + body, in the coach's voice (§7). */
export type NudgeDraft = {
  subject: string
  body: string
}
