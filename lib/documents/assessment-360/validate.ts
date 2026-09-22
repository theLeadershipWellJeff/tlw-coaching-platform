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
  else if (passions !== 6) warnings.push(`${passions} leadership passions detected (the instrument asks for six).`)

  // 5. Arithmetic the report itself guarantees. A column misread (the wrong
  //    x-band, a wrapped header, a digit glued to its neighbour) shows up here
  //    long before a range check would notice. Calibrated on five real reports
  //    (2026-09-22); the tolerances allow the vendor's own rounding.
  const r2 = (v: number) => Math.round(v * 100) / 100
  const near = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= tol
  const rankBy = new Map(data.competency_rankings.map((c) => [c.competency, c]))

  // 5a. The rankings page is ordered by band, then by Total Score within band.
  const printed = data.competency_rankings
  const expected = [...printed].sort((a, b) => bandRankOf(b.band) - bandRankOf(a.band) || b.total - a.total)
  for (let i = 0; i < printed.length; i++) {
    const p = printed[i]
    const e = expected[i]
    if (p.competency !== e.competency && !(p.band === e.band && p.total === e.total)) {
      errors.push(`Rankings are not in band-then-score order at row ${i + 1}: "${p.competency}" (${p.band} ${p.total}) where "${e.competency}" (${e.band} ${e.total}) was expected.`)
      break
    }
  }

  // 5b. distance_to_90th = norm_90th − total, and no Profound Strength sits below its 90th marker.
  for (const c of data.competency_rankings) {
    if (c.norm_90th !== null && c.distance_to_90th !== null && !near(r2(c.norm_90th - c.total), c.distance_to_90th)) warnings.push(`distance_to_90th disagrees with norm − total for ${c.competency}.`)
    if (c.band === 'Profound Strength' && c.vs_90th === 'below') warnings.push(`${c.competency} is banded Profound Strength but its bar ends below the 90th marker.`)
  }

  // 5c. Gap analysis: gap = total − self, and the total is the rankings total.
  for (const g of data.gap_analysis) {
    if (!near(r2(g.total - g.self), g.gap)) errors.push(`Gap analysis arithmetic fails for ${g.competency}: ${g.total} − ${g.self} ≠ ${g.gap}.`)
    const rt = rankBy.get(g.competency)?.total
    if (rt !== undefined && !near(rt, g.total)) errors.push(`Gap analysis total for ${g.competency} (${g.total}) disagrees with the rankings page (${rt}).`)
    if ((g.direction === 'positive' && g.gap < 0) || (g.direction === 'negative' && g.gap > 0)) errors.push(`Gap direction for ${g.competency} contradicts its sign (${g.gap} ${g.direction}).`)
  }

  // 5d. Importance: the printed total is the sum of the group columns.
  for (const i of data.importance) {
    const sum = i.manager + i.peers + i.others + i.direct_reports + i.self
    if (sum !== i.total_votes) errors.push(`Importance votes for ${i.competency}: columns sum to ${sum}, printed total ${i.total_votes}.`)
  }

  // 5e. A tent pole is the average of its competencies' items, which the vendor
  //     rounds a little differently from the mean of the printed competency
  //     scores (Koudsi 2025: Personal Capability printed 3.08, mean 3.12).
  for (const t of data.tent_poles) {
    const members = t.competencies.map((n) => rankBy.get(n)?.total).filter((v): v is number => v !== undefined)
    if (members.length !== t.competencies.length) {
      warnings.push(`Tent pole ${t.name}: ${members.length} of ${t.competencies.length} member competencies found in the rankings.`)
      continue
    }
    if (!members.length) continue
    const mean = r2(members.reduce((a, b) => a + b, 0) / members.length)
    if (!near(mean, t.score, 0.05)) warnings.push(`Tent pole ${t.name} reads ${t.score} but its competencies average ${mean}.`)
  }

  // 5f. Score details agree with the rankings page and the behavior lists.
  const itemByNumber = new Map<number, { total: number | null }>()
  for (const c of data.competency_details) {
    const rt = rankBy.get(c.competency)?.total
    if (rt !== undefined && c.total !== null && !near(rt, c.total)) errors.push(`Score details total for ${c.competency} (${c.total}) disagrees with the rankings page (${rt}).`)
    const itemTotals = c.items.map((i) => i.total).filter((v): v is number => v !== null)
    if (itemTotals.length && c.total !== null) {
      const mean = r2(itemTotals.reduce((a, b) => a + b, 0) / itemTotals.length)
      if (!near(mean, c.total, 0.05)) warnings.push(`Score details for ${c.competency}: items average ${mean}, competency total ${c.total}.`)
    }
    for (const i of c.items) itemByNumber.set(i.item_number, i)
  }
  for (const b of [...data.highest_behaviors, ...data.lowest_behaviors]) {
    if (b.item_number === null) continue
    const it = itemByNumber.get(b.item_number)
    if (!it) {
      if (data.competency_details.length) warnings.push(`Behavior item ${b.item_number} is not in the score details.`)
      continue
    }
    if (it.total !== null && !near(it.total, b.total)) errors.push(`Behavior item ${b.item_number} reads ${b.total} in the behavior list but ${it.total} in the score details.`)
  }

  // 5g. A follow-up report's own comparison: the current column is this report.
  if (data.reassessment) {
    for (const e of data.reassessment.by_competency) {
      const rt = rankBy.get(e.competency)?.total
      if (rt !== undefined && !near(rt, e.current_total)) errors.push(`Reassessment current total for ${e.competency} (${e.current_total}) disagrees with the rankings page (${rt}).`)
      if (!near(r2(e.current_total - e.previous_total), e.gap)) errors.push(`Reassessment arithmetic fails for ${e.competency}.`)
    }
    if (data.reassessment.by_competency.length !== data.competency_rankings.length) warnings.push(`Reassessment table has ${data.reassessment.by_competency.length} rows for ${data.competency_rankings.length} competencies.`)
  }

  return { ok: errors.length === 0, errors, warnings }
}
