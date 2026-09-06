/**
 * Longitudinal comparison (build prompt §5d) — computed when a client has a
 * prior completed assessment on the SAME instrument, stored on the newer one.
 *
 * Guardrails baked into the shape: band movement and change in distance-to-90th
 * are the headline (both normed); raw deltas are secondary. No totals, no
 * ranking of deltas, no overall change score — that framing turns reflection
 * into a scorecard. Comparability caveats travel with the data so the brief
 * can surface them the first time change is discussed.
 */
import type { Assessment360Data, Comparison, ComparisonEntry, RaterCounts } from './types'

const BAND_ORDER = ['Potential Fatal Flaw', 'Below Average', 'Above Average', 'Promising Profound Strength', 'Profound Strength']
const r2 = (v: number) => Math.round(v * 100) / 100

function countsDiffer(a: RaterCounts | null, b: RaterCounts | null): boolean {
  if (!a || !b) return true
  return a.manager !== b.manager || a.peers !== b.peers || a.direct_reports !== b.direct_reports || a.others !== b.others || a.self !== b.self
}

function monthsBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const da = new Date(a)
  const db = new Date(b)
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null
  return Math.max(0, Math.round((db.getTime() - da.getTime()) / (30.44 * 86400000)))
}

export function compareAssessments(
  current: Assessment360Data,
  prior: Assessment360Data,
  priorDocumentId: string
): Comparison {
  const priorBy = new Map(prior.competency_rankings.map((c) => [c.competency, c]))
  const by_competency: ComparisonEntry[] = []
  for (const cur of current.competency_rankings) {
    const p = priorBy.get(cur.competency)
    if (!p) continue
    const bandDelta = BAND_ORDER.indexOf(cur.band) - BAND_ORDER.indexOf(p.band)
    const normed =
      p.distance_to_90th !== null && cur.distance_to_90th !== null ? r2(p.distance_to_90th - cur.distance_to_90th) : null
    by_competency.push({
      competency: cur.competency,
      prior_total: p.total,
      current_total: cur.total,
      raw_delta: r2(cur.total - p.total),
      prior_band: p.band,
      current_band: cur.band,
      band_moved: bandDelta > 0 ? 'up' : bandDelta < 0 ? 'down' : 'same',
      prior_distance_to_90th: p.distance_to_90th,
      current_distance_to_90th: cur.distance_to_90th,
      normed_delta: normed,
    })
  }
  const rater_sets_differ = countsDiffer(prior.rater_counts, current.rater_counts)
  // Norms are re-published by the vendor; a different norm for the same
  // competency between the two reports means the comparison group moved.
  const norm_vintage_differs = by_competency.some((e) => {
    const p = priorBy.get(e.competency)
    const c = current.competency_rankings.find((x) => x.competency === e.competency)
    return p && c && p.norm_90th !== null && c.norm_90th !== null && Math.abs(p.norm_90th - c.norm_90th) > 0.02
  })
  const confidence: Comparison['comparability']['confidence'] =
    !rater_sets_differ && !norm_vintage_differs ? 'high' : rater_sets_differ && norm_vintage_differs ? 'low' : 'moderate'
  return {
    prior_document_id: priorDocumentId,
    prior_assessment_date: prior.assessment_date,
    months_elapsed: monthsBetween(prior.assessment_date, current.assessment_date),
    comparability: {
      rater_sets_differ,
      prior_rater_counts: prior.rater_counts,
      current_rater_counts: current.rater_counts,
      norm_vintage_differs,
      confidence,
    },
    by_competency,
  }
}
