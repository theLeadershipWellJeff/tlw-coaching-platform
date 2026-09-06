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
  const merged: CoachingGoal[] = incoming.map((g) => {
    if (g.author) return g
    const prior = byTitle.get(norm(g.title))
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
