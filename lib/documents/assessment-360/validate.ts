/**
 * Validation before a document can be surfaced (build prompt §5).
 * A failing document is never client-visible and never enters chat context.
 */
import type { Assessment360Data } from './types'

export type ValidationResult = { ok: boolean; errors: string[]; warnings: string[] }

const BAND_ORDER = ['Potential Fatal Flaw', 'Below Average', 'Above Average', 'Promising Profound Strength', 'Profound Strength']

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Does the name printed on the report match the client record? Both the first
 * and the last token of the shorter name must appear in the longer one, so
 * "Jeff Holmes" matches "Jeffrey K. Holmes" only if "jeff" appears — it does
 * not — which is exactly the kind of near-miss a human should confirm.
 */
export function namesMatch(reportName: string, clientName: string): boolean {
  const a = norm(reportName).split(' ').filter(Boolean)
  const b = norm(clientName).split(' ').filter(Boolean)
  if (!a.length || !b.length) return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  const first = short[0]
  const last = short[short.length - 1]
  return long.includes(first) && long.includes(last)
}

function inRange(v: number | null | undefined): boolean {
  return v === null || v === undefined || (Number.isFinite(v) && v >= 0 && v <= 5)
}

export function validateAssessment360(
  data: Assessment360Data,
  raterNames: string[],
  extractedText: string
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!data.participant_name) errors.push('participant_name is empty.')
  if (!data.assessment_date) warnings.push(`Report date "${data.report_date}" could not be parsed to a date.`)

  // 2. Every score in 0–5 (or null).
  const scores: Array<[string, number | null | undefined]> = []
  for (const c of data.competency_rankings) scores.push([`ranking ${c.competency}`, c.total], [`norm75 ${c.competency}`, c.norm_75th], [`norm90 ${c.competency}`, c.norm_90th])
  for (const b of [...data.highest_behaviors, ...data.lowest_behaviors]) scores.push([`behavior ${b.item}`, b.total], [`m ${b.item}`, b.manager], [`p ${b.item}`, b.peers], [`o ${b.item}`, b.others], [`s ${b.item}`, b.self])
  for (const g of data.gap_analysis) scores.push([`gap total ${g.competency}`, g.total], [`gap self ${g.competency}`, g.self])
  for (const t of data.tent_poles) scores.push([`tent ${t.name}`, t.score])
  if (data.overall_effectiveness) {
    scores.push(['overall', data.overall_effectiveness.total])
    for (const r of data.overall_effectiveness.by_rater_group) scores.push([`overall ${r.group}`, r.score])
  }
  for (const [label, v] of scores) if (!inRange(v)) errors.push(`Score out of range for ${label}: ${v}`)

  // 2b. Every competency carries band + norms; band ordering must NOT follow score ordering.
  if (data.competency_rankings.length < 10) errors.push(`Only ${data.competency_rankings.length} competencies ranked.`)
  for (const c of data.competency_rankings) {
    if (!c.band) errors.push(`No band for ${c.competency}.`)
    if (c.norm_75th === null || c.norm_90th === null) errors.push(`Missing norms for ${c.competency}.`)
    if (c.norm_75th !== null && c.norm_90th !== null && c.norm_90th < c.norm_75th) errors.push(`Norms inverted for ${c.competency} (90th < 75th).`)
  }
  const byScore = [...data.competency_rankings].sort((a, b) => b.total - a.total)
  const bandRankOf = (b: string) => BAND_ORDER.indexOf(b)
  const monotone = byScore.every((c, i) => i === 0 || bandRankOf(byScore[i - 1].band) >= bandRankOf(c.band))
  const distinctBands = new Set(data.competency_rankings.map((c) => c.band)).size
  if (monotone && distinctBands > 1) {
    warnings.push('Band order follows score order exactly — plausible, but check that the colour lookup did not silently fail.')
  }

  // 3. No rater name anywhere in the stored payload.
  const payload = (JSON.stringify(data) + '\n' + extractedText).toLowerCase()
  for (const name of raterNames) {
    const n = name.trim().toLowerCase()
    if (n.length >= 5 && n.includes(' ') && payload.includes(n)) errors.push(`Rater name present in the stored payload: "${name}".`)
  }

  // 4. Arrays non-empty where the report has that section.
  if (!data.highest_behaviors.length) errors.push('highest_behaviors is empty.')
  if (!data.lowest_behaviors.length) errors.push('lowest_behaviors is empty.')
  if (!data.gap_analysis.length) errors.push('gap_analysis is empty.')
  if (!data.importance.length) errors.push('importance is empty.')
  if (!data.tent_poles.length) warnings.push('tent_poles is empty.')
  if (!data.competency_details.length) warnings.push('competency_details is empty.')
  if (!data.overall_effectiveness) warnings.push('overall_effectiveness is missing.')
  const passions = data.importance.filter((i) => i.is_passion).length
  if (passions === 0) warnings.push('No leadership passions detected.')

  return { ok: errors.length === 0, errors, warnings }
}
