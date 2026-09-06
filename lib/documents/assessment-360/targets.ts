/**
 * Development-target model (theLeadershipWell method) — build prompt §5b.
 *
 * Three circles must overlap for a competency to be a natural development
 * target: it sits BELOW its own 90th-percentile norm (proximity), the people
 * around the leader voted it important (business need), and the leader named
 * it a passion. The three-circle idea is the instrument's own; what is
 * proprietary here is the proximity-to-90th targeting and the role-weighted
 * importance. The weights and the ranking live in this config and are NEVER
 * explained to a participant — the AI surfaces where the circles overlap and
 * asks what the participant makes of it. It never recommends a goal.
 */
import type { CompetencyRanking, DevelopmentCandidate, ImportanceRow } from './types'

export type TargetWeights = {
  manager: number
  peers: number
  others: number
  direct_reports: number
  self: number
}

/** Manager heaviest, self lowest. Tunable without touching the ranking logic. */
export const DEFAULT_TARGET_WEIGHTS: TargetWeights = {
  manager: 3,
  peers: 2,
  others: 1.5,
  direct_reports: 1.5,
  self: 0.5,
}

const r2 = (v: number) => Math.round(v * 100) / 100

/** Fill weighted_score / weighted_importance on the importance rows (in place, returns them). */
export function weightImportance(rows: ImportanceRow[], w: TargetWeights = DEFAULT_TARGET_WEIGHTS): ImportanceRow[] {
  for (const r of rows) {
    r.weighted_score = r2(r.manager * w.manager + r.peers * w.peers + r.others * w.others + r.direct_reports * w.direct_reports + r.self * w.self)
  }
  const max = Math.max(0, ...rows.map((r) => r.weighted_score))
  for (const r of rows) r.weighted_importance = max > 0 ? r2(r.weighted_score / max) : 0
  return rows
}

/**
 * Rank candidates: most circles first, then business need (weighted), then the
 * shortest climb to the 90th. Competencies already at/above the 90th are
 * excluded from the proximity circle — those are Profound Strengths to build
 * from, not gaps to close.
 */
export function computeDevelopmentCandidates(
  rankings: CompetencyRanking[],
  importance: ImportanceRow[],
  w: TargetWeights = DEFAULT_TARGET_WEIGHTS
): DevelopmentCandidate[] {
  weightImportance(importance, w)
  const byName = new Map(importance.map((i) => [i.competency, i]))
  const out: DevelopmentCandidate[] = []
  for (const c of rankings) {
    if (c.distance_to_90th === null) continue
    const imp = byName.get(c.competency)
    const proximity = c.band !== 'Profound Strength' && c.distance_to_90th > 0
    const need = (imp?.weighted_score ?? 0) > 0
    const passion = imp?.is_passion ?? false
    const missing: DevelopmentCandidate['missing'] = []
    if (!proximity) missing.push('proximity')
    if (!need) missing.push('need')
    if (!passion) missing.push('passion')
    out.push({
      competency: c.competency,
      total: c.total,
      band: c.band,
      distance_to_90th: c.distance_to_90th,
      weighted_importance: imp?.weighted_importance ?? 0,
      total_votes: imp?.total_votes ?? 0,
      is_passion: passion,
      circles_met: 3 - missing.length,
      missing,
    })
  }
  return out
    .filter((c) => c.circles_met >= 2 && !c.missing.includes('proximity'))
    .sort(
      (a, b) =>
        b.circles_met - a.circles_met ||
        b.weighted_importance - a.weighted_importance ||
        a.distance_to_90th - b.distance_to_90th
    )
}
