/**
 * A1 — automated self-consistency checks on every report (VALIDATION_PROTOCOL
 * Part A). Fourteen checks per report, per-report pass/fail table, every
 * failing row with page, expected and actual. Exit 1 on any failure.
 *
 *   node .spike-build/scripts/validation/validate-extraction.js [pdf ...] [--golden] [--json out.json]
 *
 * --golden also diffs each extraction against its frozen fixture in
 * fixtures/zf-360/<name>.json (A3 regression); a missing fixture is reported,
 * not failed. Defaults to every PDF in fixtures/private.
 */
import * as fs from 'fs'
import * as path from 'path'
import { formatAssessmentForPrompt } from '../../lib/portal/prompt'
import type { Assessment360Data, Band } from '../../lib/documents/assessment-360/types'
import { CROSS_CHECK_TOLERANCE } from '../../lib/documents/assessment-360/parse'
import { baseName, diffJson, ensureDir, GOLDEN_DIR, initials, listReportPdfs, loadReport, mdTable, near, r2, RESULTS_DIR, sectionPages, today, toGolden, type Complete } from './shared'

type CheckResult = { id: number; name: string; status: 'pass' | 'fail' | 'flag' | 'n/a'; detail: string; failures: Array<{ page: number | null; field: string; expected: string; actual: string; cause: string }> }
type ReportResult = { file: string; participant: string; status: string; format: string; checks: CheckResult[]; golden?: { status: 'match' | 'differs' | 'missing'; diffs: string[] } }

const BAND_ORDER: Band[] = ['Potential Fatal Flaw', 'Below Average', 'Above Average', 'Promising Profound Strength', 'Profound Strength']
const bandRank = (b: Band | null) => (b ? BAND_ORDER.indexOf(b) : -1)

/** n-weighted mean of item totals — how the vendor computes a competency / pole / overall total. */
function weightedMean(items: Array<{ total: number | null; n: number | null }>): { mean: number; weighted: boolean } | null {
  const ok = items.filter((i): i is { total: number; n: number | null } => i.total !== null)
  if (!ok.length) return null
  if (ok.every((i) => i.n !== null && i.n > 0)) {
    const w = ok.reduce((s, i) => s + (i.n as number), 0)
    return { mean: ok.reduce((s, i) => s + i.total * (i.n as number), 0) / w, weighted: true }
  }
  return { mean: ok.reduce((s, i) => s + i.total, 0) / ok.length, weighted: false }
}

function runChecks(out: Complete, pg: Record<string, number | null>): CheckResult[] {
  const d = out.data
  const checks: CheckResult[] = []
  const add = (id: number, name: string, failures: CheckResult['failures'], detail = '', flag = false, na = false): void => {
    checks.push({ id, name, status: na ? 'n/a' : failures.length ? (flag ? 'flag' : 'fail') : 'pass', detail, failures })
  }
  const rankBy = new Map(d.competency_rankings.map((c) => [c.competency, c]))
  const detailBy = new Map(d.competency_details.map((c) => [c.competency, c]))
  const allItems = d.competency_details.flatMap((c) => c.items)

  // 1. geometry vs text on every chart (the parser fails the extraction above the tolerance; report the residuals)
  {
    const f: CheckResult['failures'] = []
    for (const c of out.calibration) if (c.max_residual > CROSS_CHECK_TOLERANCE) f.push({ page: pg[c.section] ?? null, field: `${c.section} chart`, expected: `≤ ${CROSS_CHECK_TOLERANCE}`, actual: String(c.max_residual), cause: 'geometry' })
    add(1, 'Geometry-derived score vs printed score, every row, within 0.03', f, out.calibration.map((c) => `${c.section} ${c.max_residual} (${c.rows} rows)`).join('; '))
  }
  // 2. competency total ≈ mean of its items (n-weighted, ±0.02)
  {
    const f: CheckResult['failures'] = []
    let worst = 0
    for (const c of d.competency_details) {
      const m = weightedMean(c.items)
      if (!m || c.total === null) continue
      const dev = Math.abs(m.mean - c.total)
      worst = Math.max(worst, dev)
      if (dev > 0.02 + 1e-9) f.push({ page: pg.details, field: `${c.competency} total`, expected: `${r2(m.mean)} (${m.weighted ? 'n-weighted' : 'plain'} mean of ${c.items.length} items)`, actual: String(c.total), cause: 'text parse (details table)' })
    }
    add(2, 'Competency total ≈ mean of its item scores (±0.02)', f, `worst deviation ${r2(worst)} across ${d.competency_details.length} competencies`)
  }
  // 3. tent pole ≈ mean of the items beneath it (n-weighted, ±0.02); fallback to the mean of competency scores
  {
    const f: CheckResult['failures'] = []
    let worst = 0
    for (const t of d.tent_poles) {
      const items = t.competencies.flatMap((n) => detailBy.get(n)?.items || [])
      const m = items.length ? weightedMean(items) : null
      const fallback = t.competencies.map((n) => rankBy.get(n)?.total).filter((v): v is number => v !== undefined)
      const mean = m ? m.mean : fallback.length ? fallback.reduce((a, b) => a + b, 0) / fallback.length : null
      if (mean === null) { f.push({ page: pg.tent, field: t.name, expected: 'members found', actual: 'none', cause: 'tent parse' }); continue }
      const dev = Math.abs(mean - t.score)
      worst = Math.max(worst, dev)
      if (dev > 0.02 + 1e-9) f.push({ page: pg.tent, field: `${t.name} score`, expected: `${r2(mean)} (${m ? 'n-weighted items' : 'mean of competencies'})`, actual: String(t.score), cause: 'text parse (tent page)' })
    }
    add(3, 'Tent pole ≈ mean of the competencies/items beneath it (±0.02)', f, `worst deviation ${r2(worst)}`)
  }
  // 4. overall ≈ mean of all items
  {
    const f: CheckResult['failures'] = []
    const m = weightedMean(allItems)
    const ov = d.overall_effectiveness
    if (m && ov) {
      const dev = Math.abs(m.mean - ov.total)
      if (dev > 0.02 + 1e-9) f.push({ page: pg.overall, field: 'Overall total', expected: `${r2(m.mean)} (${m.weighted ? 'n-weighted' : 'plain'} mean of ${allItems.length} items)`, actual: String(ov.total), cause: 'text parse (overall page)' })
      add(4, 'Overall Leadership Effectiveness ≈ mean of all items (±0.02)', f, `deviation ${r2(dev)} over ${allItems.length} items`)
    } else add(4, 'Overall Leadership Effectiveness ≈ mean of all items (±0.02)', [], 'overall or items missing', false, true)
  }
  // 5. gap = total − self
  {
    const f: CheckResult['failures'] = []
    for (const g of d.gap_analysis) {
      if (!near(r2(g.total - g.self), g.gap, 0.011)) f.push({ page: pg.gap, field: `${g.competency} gap`, expected: String(r2(g.total - g.self)), actual: String(g.gap), cause: 'text parse (gap columns)' })
      const rt = rankBy.get(g.competency)?.total
      if (rt !== undefined && !near(rt, g.total, 0.011)) f.push({ page: pg.gap, field: `${g.competency} total`, expected: `${rt} (rankings page)`, actual: String(g.total), cause: 'text parse (gap columns)' })
    }
    add(5, 'Gap Analysis gap == total − self, recomputed', f, `${d.gap_analysis.length} rows`)
  }
  // 6. rankings ordered by band then score
  {
    const f: CheckResult['failures'] = []
    const printed = d.competency_rankings
    const expected = [...printed].sort((a, b) => bandRank(b.band) - bandRank(a.band) || b.total - a.total)
    for (let i = 0; i < printed.length; i++) {
      const p = printed[i]; const e = expected[i]
      if (p.competency !== e.competency && !(p.band === e.band && p.total === e.total)) { f.push({ page: pg.rankings, field: `rank ${i + 1}`, expected: `${e.competency} (${e.band} ${e.total})`, actual: `${p.competency} (${p.band} ${p.total})`, cause: 'colour lookup or row order' }); break }
    }
    add(6, 'Rankings ordered by band, then score within band', f, `${printed.length} rows`)
  }
  // 7. band from colour consistent with score vs norms (75th/90th boundaries only; flag within 0.05)
  {
    const fails: CheckResult['failures'] = []
    let flags = 0
    for (const c of d.competency_rankings) {
      if (c.norm_75th === null || c.norm_90th === null) continue
      const above90 = c.total >= c.norm_90th - 0.005
      const above75 = c.total >= c.norm_75th - 0.005
      const expected: Band[] = above90 ? ['Profound Strength'] : above75 ? ['Promising Profound Strength'] : ['Above Average', 'Below Average', 'Potential Fatal Flaw']
      if (!expected.includes(c.band)) {
        const margin = Math.min(Math.abs(c.total - c.norm_90th), Math.abs(c.total - c.norm_75th))
        if (margin <= 0.05) flags++
        else fails.push({ page: pg.rankings, field: `${c.competency} band`, expected: expected.join(' or ') + ` (score ${c.total} vs 75th ${c.norm_75th} / 90th ${c.norm_90th})`, actual: c.band, cause: 'colour lookup or marker read' })
      }
    }
    add(7, 'Band from fill colour consistent with score vs extracted norms', fails, `${flags} row(s) within 0.05 of a threshold (flag only)`)
  }
  // 8. rater counts vs tables
  {
    const f: CheckResult['failures'] = []
    const rc = d.rater_counts
    const reported = { manager: rc.reported_as?.manager ?? rc.manager ?? 0, peers: rc.reported_as?.peers ?? (rc.reported_as ? 0 : rc.peers ?? 0), direct_reports: rc.reported_as?.direct_reports ?? (rc.reported_as ? 0 : rc.direct_reports ?? 0), others: rc.reported_as?.others ?? (rc.reported_as ? 0 : rc.others ?? 0), self: rc.reported_as?.self ?? rc.self ?? 0 }
    const nonSelf = reported.manager + reported.peers + reported.direct_reports + reported.others
    const maxN = Math.max(0, ...allItems.map((i) => i.n ?? 0))
    if (maxN && maxN !== nonSelf) f.push({ page: pg.details, field: 'max item n', expected: `${nonSelf} (reported raters excluding Self)`, actual: String(maxN), cause: 'counts line or details n column' })
    const groupsInTables = new Set(d.overall_effectiveness?.by_rater_group.map((g) => g.group) || [])
    const expectGroups = [reported.manager && 'Manager', reported.peers && 'Peers', reported.direct_reports && 'Direct Reports', reported.others && 'Others', reported.self && 'Self'].filter(Boolean) as string[]
    for (const g of expectGroups) if (!groupsInTables.has(g as never)) f.push({ page: pg.overall, field: `rater group ${g}`, expected: 'present (reported > 0)', actual: 'absent from the overall table', cause: 'counts line or overall rows' })
    groupsInTables.forEach((g) => { if (!expectGroups.includes(g)) f.push({ page: pg.overall, field: `rater group ${g}`, expected: 'absent (reported 0)', actual: 'present in the overall table', cause: 'counts line' }) })
    const label: Record<string, keyof typeof reported> = { Manager: 'manager', Peers: 'peers', 'Direct Reports': 'direct_reports', Others: 'others', Self: 'self' }
    for (const it of allItems) for (const g of it.by_rater_group) { const key = label[g.group]; if (key && g.n !== null && g.n > reported[key]) f.push({ page: pg.details, field: `item ${it.item_number} ${g.group} n`, expected: `≤ ${reported[key]}`, actual: String(g.n), cause: 'details column split' }) }
    add(8, 'Rater counts in tables match the "How Is Rater Feedback Reported" section', f, `reported M${reported.manager} P${reported.peers} DR${reported.direct_reports} O${reported.others} S${reported.self}; max item n ${maxN}`)
  }
  // 9. highest/lowest really are the extremes
  {
    const f: CheckResult['failures'] = []
    const totals = allItems.map((i) => i.total).filter((v): v is number => v !== null).sort((a, b) => a - b)
    if (totals.length >= 20) {
      const top = totals.slice(-10).sort((a, b) => b - a)
      const bottom = totals.slice(0, 10)
      const hi = d.highest_behaviors.map((b) => b.total).sort((a, b) => b - a)
      const lo = d.lowest_behaviors.map((b) => b.total).sort((a, b) => a - b)
      if (JSON.stringify(hi) !== JSON.stringify(top)) f.push({ page: pg.highest, field: 'highest behaviors totals', expected: top.join(','), actual: hi.join(','), cause: 'column order (behaviors table)' })
      if (JSON.stringify(lo) !== JSON.stringify(bottom)) f.push({ page: pg.lowest, field: 'lowest behaviors totals', expected: bottom.join(','), actual: lo.join(','), cause: 'column order (behaviors table)' })
      for (const b of [...d.highest_behaviors, ...d.lowest_behaviors]) { const it = allItems.find((i) => i.item_number === b.item_number); if (it && it.total !== null && !near(it.total, b.total, 0.011)) f.push({ page: pg.highest, field: `item ${b.item_number}`, expected: `${it.total} (details)`, actual: String(b.total), cause: 'column order' }) }
      add(9, 'Highest/Lowest Scored Behaviors are the highest/lowest by item score', f, `${totals.length} items in details`)
    } else add(9, 'Highest/Lowest Scored Behaviors are the highest/lowest by item score', [], 'too few item totals in details', false, true)
  }
  // 10. ranges + nulls
  {
    const f: CheckResult['failures'] = []
    const inRange = (v: number | null, lo: number, hi: number) => v === null || (v >= lo && v <= hi)
    for (const c of d.competency_rankings) {
      if (!inRange(c.total, 0, 5)) f.push({ page: pg.rankings, field: `${c.competency} total`, expected: '0–5', actual: String(c.total), cause: 'text parse' })
      if (c.norm_75th === null || c.norm_90th === null) f.push({ page: pg.rankings, field: `${c.competency} norms`, expected: 'both present', actual: `${c.norm_75th}/${c.norm_90th}`, cause: 'marker read' })
      else if (!inRange(c.norm_75th, 1, 5) || !inRange(c.norm_90th, 1, 5)) f.push({ page: pg.rankings, field: `${c.competency} norms`, expected: '1–5', actual: `${c.norm_75th}/${c.norm_90th}`, cause: 'marker read' })
    }
    for (const b of [...d.highest_behaviors, ...d.lowest_behaviors]) for (const [k, v] of Object.entries({ total: b.total, manager: b.manager, peers: b.peers, others: b.others, self: b.self, direct_reports: b.direct_reports })) if (v !== null && !inRange(v as number, 0, 5)) f.push({ page: pg.highest, field: `item ${b.item_number} ${k}`, expected: '0–5', actual: String(v), cause: 'text parse' })
    for (const it of allItems) if (it.total === null) f.push({ page: pg.details, field: `item ${it.item_number} total`, expected: 'a score', actual: 'null', cause: 'details parse' })
    if (d.engagement.available && !inRange(d.engagement.total, 0, 5)) f.push({ page: pg.engagement, field: 'engagement', expected: '0–5', actual: String(d.engagement.total), cause: 'text parse' })
    if (d.competency_rankings.length !== 19) f.push({ page: pg.rankings, field: 'competency count', expected: '19', actual: String(d.competency_rankings.length), cause: 'rankings parse' })
    if (d.gap_analysis.length !== 19) f.push({ page: pg.gap, field: 'gap rows', expected: '19', actual: String(d.gap_analysis.length), cause: 'gap parse' })
    if (d.importance.length !== 19) f.push({ page: pg.importance, field: 'importance rows', expected: '19', actual: String(d.importance.length), cause: 'importance parse' })
    add(10, 'All scores 0–5, norms 1–5, no nulls where a section exists', f, `${allItems.length} items, ${d.competency_rankings.length} competencies`)
  }
  // 11. zero rater names in text / structured data / prompt payload
  {
    const f: CheckResult['failures'] = []
    const { structured, verbatims } = formatAssessmentForPrompt(d)
    const payloads: Array<[string, string]> = [['extracted_text', out.extractedText], ['structured_data', JSON.stringify(d)], ['prompt payload', structured + '\n' + verbatims]]
    for (const name of out.raterNames) {
      const n = name.trim().toLowerCase()
      if (n.length < 5 || !n.includes(' ')) continue
      for (const [where, text] of payloads) if (text.toLowerCase().includes(n)) f.push({ page: 3, field: where, expected: 'no rater name', actual: `contains "${name}"`, cause: 'rater table not dropped' })
    }
    add(11, 'Zero rater names in extracted_text, structured_data, or the prompt payload', f, `${out.raterNames.length} invited raters checked against three payloads`)
  }
  // 12. per-page calibration residual < 0.05
  {
    const f: CheckResult['failures'] = []
    for (const c of out.calibration) if (c.max_residual >= 0.05) f.push({ page: pg[c.section] ?? null, field: `${c.section} calibration`, expected: '< 0.05', actual: String(c.max_residual), cause: 'calibration' })
    add(12, 'Per-chart calibration residual < 0.05', f, `${out.calibration.length} charts, worst ${Math.max(0, ...out.calibration.map((c) => c.max_residual))}`)
  }
  // 13. six passions
  {
    const n = d.importance.filter((i) => i.is_passion).length
    add(13, 'Passion markers count = 6', n === 6 ? [] : [{ page: pg.importance, field: 'passions', expected: '6', actual: String(n), cause: 'marker glyph read' }], `${n} found`)
  }
  // 14. importance totals = sum of columns
  {
    const f: CheckResult['failures'] = []
    for (const i of d.importance) { const s = i.manager + i.peers + i.others + i.direct_reports + i.self; if (s !== i.total_votes) f.push({ page: pg.importance, field: `${i.competency} votes`, expected: String(s), actual: String(i.total_votes), cause: 'vote column split' }) }
    add(14, 'Importance vote totals equal the sum of per-rater columns', f, `${d.importance.reduce((n, i) => n + i.total_votes, 0)} votes in total`)
  }
  return checks
}

;(async () => {
  const args = process.argv.slice(2)
  const golden = args.includes('--golden')
  const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : path.join(RESULTS_DIR, `extraction-${today()}.json`)
  const pdfs = listReportPdfs(args)
  if (!pdfs.length) { console.error('No PDFs found (fixtures/private is empty and none were given).'); process.exit(2) }
  const results: ReportResult[] = []
  let anyFail = false
  for (const pdf of pdfs) {
    const name = baseName(pdf)
    const { pages, out } = await loadReport(pdf)
    if (out.status !== 'complete') {
      results.push({ file: name, participant: '?', status: out.status, format: out.formatVersion, checks: [] })
      anyFail = true
      console.log(`\n✗ ${name}: extraction ${out.status} — ${out.error}`)
      continue
    }
    const pg = sectionPages(pages)
    const checks = runChecks(out, pg)
    const res: ReportResult = { file: name, participant: initials(out.data.participant_name), status: 'complete', format: out.formatVersion, checks }
    if (golden) {
      const gp = path.join(GOLDEN_DIR, `${name}.json`)
      if (!fs.existsSync(gp)) res.golden = { status: 'missing', diffs: [] }
      else {
        const frozen = JSON.parse(fs.readFileSync(gp, 'utf8')) as { data: unknown }
        const diffs = diffJson(frozen.data, toGolden(out.data))
        res.golden = { status: diffs.length ? 'differs' : 'match', diffs }
        if (diffs.length) anyFail = true
      }
    }
    if (checks.some((c) => c.status === 'fail')) anyFail = true
    results.push(res)
    console.log(`\n== ${name} (${res.participant}, ${out.formatVersion})`)
    console.log(mdTable(['#', 'check', 'status', 'detail'], checks.map((c) => [String(c.id), c.name, c.status.toUpperCase(), c.detail])))
    for (const c of checks) for (const f of c.failures) console.log(`   ${c.status === 'flag' ? 'FLAG' : 'FAIL'} #${c.id} p${f.page ?? '?'} ${f.field}: expected ${f.expected}, actual ${f.actual} [${f.cause}]`)
    if (res.golden) console.log(`   golden fixture: ${res.golden.status}${res.golden.diffs.length ? '\n     ' + res.golden.diffs.slice(0, 20).join('\n     ') : ''}`)
  }
  ensureDir(path.dirname(jsonOut))
  fs.writeFileSync(jsonOut, JSON.stringify({ ran: new Date().toISOString(), results }, null, 1))
  console.log(`\n${results.filter((r) => r.status === 'complete' && !r.checks.some((c) => c.status === 'fail') && r.golden?.status !== 'differs').length}/${results.length} reports pass A1${golden ? ' + golden' : ''}. Results → ${path.relative(process.cwd(), jsonOut)}`)
  process.exit(anyFail ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
