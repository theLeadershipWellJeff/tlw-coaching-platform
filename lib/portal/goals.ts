/**
 * Goal helpers shared by the portal write path and the coach-side save.
 *
 * `clients.coaching_goals` is one jsonb array edited from two directions: the
 * coach (workspace GoalsCard / notes-panel modal, both via PATCH /api/clients/[id])
 * and, since Phase 3 of the assessment debrief, the client in their portal.
 * Each goal carries `author`; the rule that keeps the two from fighting is:
 *
 *   the coach-side save never clobbers a client-authored goal.
 *
 * Pure functions here so the rule is testable without a database.
 */
import type { CoachingGoal } from '@/lib/supabase/types'

export const MAX_GOALS = 12
export const MAX_METRICS = 3

const norm = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')

export type ClientGoalInput = { title: string; description?: string; metrics: string[] }

/** Validate + normalise a client-authored goal. Metrics are REQUIRED in the portal flow. */
export function cleanClientGoal(input: unknown): { ok: true; goal: CoachingGoal } | { ok: false; error: string } {
  const g = (input || {}) as Record<string, unknown>
  const title = String(g.title || '').trim().slice(0, 160)
  const description = String(g.description || '').trim().slice(0, 1000)
  const metrics = (Array.isArray(g.metrics) ? g.metrics : [])
    .map((m) => String(m || '').trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, MAX_METRICS)
  if (!title) return { ok: false, error: 'Give the goal a short title.' }
  if (metrics.length === 0) return { ok: false, error: 'Add at least one way you will know this goal is working.' }
  return { ok: true, goal: { title, description, metrics, source: 'manual', author: 'client' } }
}

/**
 * Merge a coach's saved goal list over the stored one.
 *  - Every incoming goal keeps/gains an `author`: a client-authored goal edited
 *    by the coach stays `client`; otherwise coach (or `ai` for a generated draft).
 *  - Client-authored goals missing from the incoming list are put back. The
 *    coach's editor may have loaded before the client added one, and a silent
 *    drop is the failure mode this exists to prevent.
 */
export function mergeCoachGoalSave(existing: CoachingGoal[], incoming: CoachingGoal[]): CoachingGoal[] {
  const byTitle = new Map(existing.map((g) => [norm(g.title), g]))
  const merged: CoachingGoal[] = incoming.map((raw) => {
    const prior = byTitle.get(norm(raw.title))
    // The coach's editor never carries progress fields; the client's report on
    // a title-matched goal survives a coach re-save.
    const g: CoachingGoal = prior && raw.progress === undefined ? { ...raw, ...progressFields(prior) } : raw
    if (g.author) return g
    if (prior?.author === 'client') return { ...g, author: 'client' }
    return { ...g, author: g.source === 'generated' ? 'ai' : 'coach' }
  })
  const seen = new Set(merged.map((g) => norm(g.title)))
  for (const g of existing) {
    if (g.author === 'client' && !seen.has(norm(g.title))) merged.push(g)
  }
  return merged
}

/** Only the client's own goals are editable by the client. */
export function isClientEditable(goal: CoachingGoal | undefined): boolean {
  return !!goal && goal.author === 'client'
}

// ── Progress (the client's own report, any goal) ─────────────────────────────

export function clampProgress(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, Math.round(n)))
}

/** Just the progress fields of a goal (for carrying them across a coach save). */
export function progressFields(g: CoachingGoal): Pick<CoachingGoal, 'progress' | 'progress_updated_at' | 'completed_at'> {
  const out: Pick<CoachingGoal, 'progress' | 'progress_updated_at' | 'completed_at'> = {}
  if (g.progress !== undefined) out.progress = g.progress
  if (g.progress_updated_at !== undefined) out.progress_updated_at = g.progress_updated_at
  if (g.completed_at !== undefined) out.completed_at = g.completed_at
  return out
}

/**
 * Apply a progress report. `justCompleted` is true only on the transition INTO
 * 100 (completed_at stamped); dropping below 100 clears completed_at so a
 * later return to 100 celebrates again.
 */
export function applyProgress(goal: CoachingGoal, progress: number, now = new Date().toISOString()): { goal: CoachingGoal; justCompleted: boolean } {
  const wasComplete = (goal.progress ?? 0) >= 100 && !!goal.completed_at
  const next: CoachingGoal = { ...goal, progress, progress_updated_at: now }
  if (progress >= 100) {
    next.completed_at = wasComplete ? goal.completed_at : now
    return { goal: next, justCompleted: !wasComplete }
  }
  next.completed_at = null
  return { goal: next, justCompleted: false }
}
