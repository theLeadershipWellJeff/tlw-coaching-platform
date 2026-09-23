/**
 * A2 — the stratified human-verification sheet, one per report: the ~40
 * values that carry interpretive weight, in the PDF's own page order, with a
 * blank "PDF value" column to fill in.
 *
 *   node .spike-build/scripts/validation/generate-verification-sheet.js [pdf ...]
 *
 * Writes validation/sheets/<name>.md (gitignored — it carries the report's
 * numbers). Norm rows: five spot-checks (ranks 1, 5, 10, 15, 19) plus every
 * row A1 #7 flagged as within 0.05 of a band threshold.
 */
import * as fs from 'fs'
import * as path from 'path'
import { baseName, ensureDir, listReportPdfs, loadReport, mdTable, sectionPages, SHEETS_DIR, today } from './shared'

const f2 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))

;(async () => {
  const pdfs = listReportPdfs(process.argv.slice(2))
  if (!pdfs.length) { console.error('No PDFs found.'); process.exit(2) }
  ensureDir(SHEETS_DIR)
  for (const pdf of pdfs) {
    const name = baseName(pdf)
    const { pages, out } = await loadReport(pdf)
    if (out.status !== 'complete') { console.log(`✗ ${name}: extraction ${out.status}`); continue }
    const d = out.data
    const pg = sectionPages(pages)
    const P = (k: string) => (pg[k] == null ? '?' : String(pg[k]))
    const L: string[] = []
    const table = (title: string, header: string[], rows: string[][]) => { L.push(`\n### ${title}\n`, mdTable([...header, 'PDF value', 'OK?'], rows.map((r) => [...r, '', '']))) }
    L.push(`# Verification sheet — ${name}`, '', `Generated ${today()} from the extractor. Fill the **PDF value** column from the report and tick **OK?**; note any difference exactly as printed. Rows are in the PDF's page order. Rater names are never listed here.`, '')
    table(`Identity and rater counts (cover, p${P('counts')})`, ['field', 'extracted'], [
      ['Participant name', d.participant_name], ['Report date', d.report_date], ['Layout', d.format_version],
      ['Raters received (M/P/DR/O/S)', `${d.rater_counts.manager}/${d.rater_counts.peers}/${d.rater_counts.direct_reports}/${d.rater_counts.others}/${d.rater_counts.self}`],
      ['Reported as', d.rater_counts.reported_as ? JSON.stringify(d.rater_counts.reported_as) : 'same as received'],
      ...(d.reassessment ? [['Previous raters (M/P/DR/O/S)', `${d.reassessment.previous_rater_counts?.manager}/${d.reassessment.previous_rater_counts?.peers}/${d.reassessment.previous_rater_counts?.direct_reports}/${d.reassessment.previous_rater_counts?.others}/${d.reassessment.previous_rater_counts?.self}`], ['Rating windows', `${d.reassessment.current_window?.from}→${d.reassessment.current_window?.to} vs ${d.reassessment.previous_window?.from}→${d.reassessment.previous_window?.to}`]] : []),
    ])
    const ov = d.overall_effectiveness
    if (ov) table(`Overall Leadership Effectiveness (p${P('overall')})`, ['row', 'score', 'band / vs norms'], [
      ['Total', f2(ov.total), `${ov.band ?? '—'} (75th ${f2(ov.norm_75th)}, 90th ${f2(ov.norm_90th)})`],
      ...ov.by_rater_group.map((g) => [g.group, f2(g.score), `${g.vs_75th ?? '?'} 75th (${f2(g.norm_75th)}), ${g.vs_90th ?? '?'} 90th (${f2(g.norm_90th)})`]),
      ...(d.reassessment?.overall_previous ? [['Previous total', f2(d.reassessment.overall_previous.total), 'tan bar'], ...d.reassessment.overall_previous.by_rater_group.map((g) => [`Previous ${g.group}`, f2(g.score), 'tan bar'])] : []),
    ])
    table(`Employee Engagement (p${P('engagement')})`, ['field', 'extracted'], d.engagement.available ? [['Total', `${f2(d.engagement.total)} · ${d.engagement.band ?? '—'}`], ...(d.reassessment ? [['Previous', f2(d.reassessment.engagement_previous_total)]] : [])] : [['Available', `no — ${d.engagement.reason}`]])
    table(`Leadership Tent (p${P('tent')})`, ['pole', 'score', 'band', '75th / 90th'], d.tent_poles.map((t) => [t.name, f2(t.score), t.band ?? '—', `${f2(t.norm_75th)} / ${f2(t.norm_90th)}`]))
    const spot = new Set([1, 5, 10, 15, 19])
    const flagged = new Set(d.competency_rankings.filter((c) => c.norm_75th !== null && c.norm_90th !== null && Math.min(Math.abs(c.total - c.norm_90th), Math.abs(c.total - c.norm_75th)) <= 0.05).map((c) => c.rank))
    table(`Competency rankings — all 19 totals and bands; norms on spot-check rows (p${P('rankings')})`, ['rank', 'competency', 'total', 'band (bar colour)', 'norms 75th / 90th'], d.competency_rankings.map((c) => [String(c.rank), c.competency, f2(c.total), c.band, spot.has(c.rank) || flagged.has(c.rank) ? `${f2(c.norm_75th)} / ${f2(c.norm_90th)}${flagged.has(c.rank) ? ' ⚠ near a threshold — check' : ''}` : '(not required)']))
    if (d.reassessment) table(`Reassessment vs Previous — top 3 rows plus counts (p${P('reassessment')})`, ['competency', 'current', 'previous', 'gap', 'colour'], [...d.reassessment.by_competency.slice(0, 3).map((e) => [e.competency, f2(e.current_total), f2(e.previous_total), f2(e.gap), e.direction ?? '?']), ['(counts)', `${d.reassessment.by_competency.filter((e) => e.direction === 'positive').length} positive`, `${d.reassessment.by_competency.filter((e) => e.direction === 'negative').length} negative`, `${d.reassessment.by_competency.filter((e) => e.direction === 'irrelevant').length} irrelevant`, '']])
    const beh = (b: (typeof d.highest_behaviors)[number]) => [String(b.item_number ?? '?'), b.item.slice(0, 60), f2(b.total), [b.manager, b.peers, b.direct_reports, b.others, b.self].map(f2).join(' / ')]
    table(`Highest behaviors — top 3 (p${P('highest')})`, ['item', 'text', 'total', 'M / P / DR / O / S'], d.highest_behaviors.slice(0, 3).map(beh))
    table(`Lowest behaviors — bottom 3 (p${P('lowest')})`, ['item', 'text', 'total', 'M / P / DR / O / S'], d.lowest_behaviors.slice(0, 3).map(beh))
    table(`Importance votes and passions — all 19 (p${P('importance')})`, ['competency', 'total', 'M / P / DR / O / S', 'passion'], d.importance.map((i) => [i.competency, String(i.total_votes), `${i.manager} / ${i.peers} / ${i.direct_reports} / ${i.others} / ${i.self}`, i.is_passion ? '● yes' : 'no']))
    const gaps = [...d.gap_analysis].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 3)
    table(`Gap analysis — 3 largest (p${P('gap')})`, ['competency', 'total', 'self', 'gap', 'colour'], gaps.map((g) => [g.competency, f2(g.total), f2(g.self), f2(g.gap), g.direction ?? '?']))
    L.push('', '### Discrepancies', '', 'page | field | PDF says | extractor says | suspected cause (text parse / geometry / colour / calibration)', '--- | --- | --- | --- | ---', '', '', `Verified by: ____________  Date: ________`)
    const target = path.join(SHEETS_DIR, `${name}.md`)
    fs.writeFileSync(target, L.join('\n') + '\n')
    console.log(`✓ ${name} → ${path.relative(process.cwd(), target)} (${d.competency_rankings.length + d.importance.length + 20} values)`)
  }
})().catch((e) => { console.error(e); process.exit(1) })
