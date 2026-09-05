/**
 * Structured extraction of a 360 assessment report — the SOLE numeric source of
 * truth the AI is allowed to quote (build prompt §5). Instrument-agnostic field
 * names; the instrument is recorded in `instrument`.
 *
 * Every score is a perception: what a specific set of raters saw. Bands come
 * from the report's own bar colours (never derived from the score), and norms
 * from the marker positions on that row (never inferred from sort order).
 */

export type Band =
  | 'Profound Strength'
  | 'Promising Profound Strength'
  | 'Above Average'
  | 'Below Average'
  | 'Potential Fatal Flaw'

export type RaterGroup = 'Manager' | 'Peers' | 'Others' | 'Self' | 'Direct Reports'

/** Where a bar end sits relative to a percentile marker on the SAME row. */
export type MarkerRelation = 'below' | 'at' | 'above'

export type RaterCounts = {
  manager: number | null
  peers: number | null
  direct_reports: number | null
  others: number | null
  self: number | null
  /** Groups as reported after small-N collapsing, when it differs from received. */
  reported_as?: Partial<Record<'manager' | 'peers' | 'direct_reports' | 'others' | 'self', number>>
  collapsed_note: string | null
}

export type RaterGroupScore = {
  group: RaterGroup
  score: number
  vs_75th: MarkerRelation | null
  vs_90th: MarkerRelation | null
  norm_75th: number | null
  norm_90th: number | null
}

export type OverallEffectiveness = {
  total: number
  band: Band | null
  norm_75th: number | null
  norm_90th: number | null
  by_rater_group: RaterGroupScore[]
}

export type Engagement =
  | { available: false; reason: string }
  | { available: true; total: number; band: Band | null }

export type TentPole = {
  name: string
  score: number
  band: Band | null
  norm_75th: number | null
  norm_90th: number | null
  competencies: string[]
}

export type CompetencyRanking = {
  rank: number
  competency: string
  total: number
  band: Band
  norm_75th: number | null
  norm_90th: number | null
  /** norm_90th − total. Negative = already at/above the 90th. */
  distance_to_90th: number | null
  vs_75th: MarkerRelation | null
  vs_90th: MarkerRelation | null
}

export type ImportanceRow = {
  competency: string
  total_votes: number
  manager: number
  peers: number
  others: number
  self: number
  direct_reports: number
  is_passion: boolean
  /** Role-weighted vote total — the constants live in config, never in output copy. */
  weighted_score: number
  /** weighted_score / max weighted_score across competencies (0–1). */
  weighted_importance: number
}

export type BehaviorScore = {
  item_number: number | null
  item: string
  competency: string
  total: number
  manager: number | null
  peers: number | null
  others: number | null
  self: number | null
  direct_reports: number | null
}

export type GapRow = {
  competency: string
  total: number
  self: number
  gap: number
  direction: 'positive' | 'negative' | 'irrelevant' | null
}

export type DevelopmentCandidate = {
  competency: string
  total: number
  band: Band
  distance_to_90th: number
  weighted_importance: number
  total_votes: number
  is_passion: boolean
  /** How many of the three circles (proximity, business need, passion) it satisfies. */
  circles_met: number
  missing: Array<'proximity' | 'need' | 'passion'>
}

export type VerbatimGroups = Partial<Record<'manager' | 'peers' | 'others' | 'self' | 'direct_reports', string[]>>

export type Verbatims = {
  strengths: VerbatimGroups
  organizational_needs: VerbatimGroups
  potential_fatal_flaws: VerbatimGroups
}

export type ItemDetail = {
  item_number: number
  item: string
  total: number | null
  n: number | null
  by_rater_group: Array<{ group: RaterGroup; score: number | null; n: number | null }>
}

export type CompetencyDetail = {
  competency: string
  tent_pole: string
  total: number | null
  by_rater_group: Array<{ group: RaterGroup; score: number | null }>
  items: ItemDetail[]
}

export type ComparisonEntry = {
  competency: string
  prior_total: number
  current_total: number
  raw_delta: number
  prior_band: Band
  current_band: Band
  band_moved: 'up' | 'down' | 'same'
  prior_distance_to_90th: number | null
  current_distance_to_90th: number | null
  /** prior_distance − current_distance: positive = moved closer to the 90th. */
  normed_delta: number | null
}

export type Comparison = {
  prior_document_id: string
  prior_assessment_date: string | null
  months_elapsed: number | null
  comparability: {
    rater_sets_differ: boolean
    prior_rater_counts: RaterCounts | null
    current_rater_counts: RaterCounts | null
    norm_vintage_differs: boolean
    confidence: 'high' | 'moderate' | 'low'
  }
  by_competency: ComparisonEntry[]
}

export type Assessment360Data = {
  participant_name: string
  report_date: string
  /** ISO date (YYYY-MM-DD) parsed from report_date, when parseable. */
  assessment_date: string | null
  instrument: string
  format_version: string
  rater_counts: RaterCounts
  overall_effectiveness: OverallEffectiveness | null
  engagement: Engagement
  tent_poles: TentPole[]
  competency_rankings: CompetencyRanking[]
  importance: ImportanceRow[]
  highest_behaviors: BehaviorScore[]
  lowest_behaviors: BehaviorScore[]
  gap_analysis: GapRow[]
  development_candidates: DevelopmentCandidate[]
  verbatims: Verbatims
  competency_details: CompetencyDetail[]
  comparison?: Comparison
  /** Non-fatal observations from the parser (e.g. legend read from fallback). */
  extraction_notes: string[]
}
