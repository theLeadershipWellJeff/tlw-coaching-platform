// Follow-up (reassessment) layout acceptance test against a private real report.
//
//   node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json && \
//   PDF=fixtures/private/followup-360.pdf node scripts/spikes/verify-followup-360.js
//
// The fixture is a client's Extraordinary Leader FOLLOW-UP feedback report
// (2026-09-22) — it contains rater names and never leaves fixtures/private
// (gitignored). Facts pinned here were read off the printed pages by hand.
//
// What this layout adds over the initial report (verify-assessment-360.js):
//  - the previous administration's score drawn as a tan bar under every
//    current one — every current-only field must ignore it;
//  - the "Reassessment vs Previous Assessment Results" table → data.reassessment;
//  - an uncollapsed Direct Reports column (5 direct reports), whose header
//    wraps onto two lines;
//  - a rater-names table that spills onto a second page.
const fs = require('fs')
const path = require('path')

const PDF = process.env.PDF || 'fixtures/private/followup-360.pdf'
const build = path.resolve(__dirname, '../../.spike-build/lib/documents/assessment-360')
const { extractAssessment360, detectAssessment360 } = require(path.join(build, 'index.js'))

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
}
const near = (a, b, tol = 0.011) => typeof a === 'number' && Math.abs(a - b) <= tol

;(async () => {
  if (!fs.existsSync(PDF)) {
    console.log(`fixture not found at ${PDF} — set PDF=... (the report is private and not in the repo)`)
    process.exit(2)
  }
  const bytes = new Uint8Array(fs.readFileSync(PDF))
  const det = await detectAssessment360(bytes)
  check('detected as the follow-up layout', det.supported && det.version === 'extraordinary-leader/2024-followup', JSON.stringify(det))

  const t0 = Date.now()
  const out = await extractAssessment360(bytes)
  console.log(`extraction: ${out.status} in ${Date.now() - t0} ms`)
  if (out.status !== 'complete') {
    console.log(JSON.stringify(out, null, 2))
    process.exit(1)
  }
  const d = out.data
  if (out.warnings.length) console.log('warnings:', out.warnings)
  check('format_version is the follow-up layout', d.format_version === 'extraordinary-leader/2024-followup', d.format_version)

  // --- cover / counts -------------------------------------------------------
  check('participant name read (not "Follow-up Feedback Report")', d.participant_name === 'Diala Ajlouni', d.participant_name)
  check('assessment_date parsed', d.assessment_date === '2025-10-05', d.assessment_date)
  check('rater counts = the MOST RECENT block', d.rater_counts.manager === 1 && d.rater_counts.peers === 3 && d.rater_counts.direct_reports === 5 && d.rater_counts.others === 11 && d.rater_counts.self === 1, JSON.stringify(d.rater_counts))
  check('no small-N collapse', !d.rater_counts.collapsed_note && !d.rater_counts.reported_as)
  check('rater names collected across BOTH pages (22 invited)', out.raterNames.length === 22, String(out.raterNames.length))
  check('overflow-page rater name present in the absence list', out.raterNames.some((n) => /Romkema/.test(n)))
  check('no rater name in the stored payload', !out.raterNames.some((n) => (JSON.stringify(d) + out.extractedText).toLowerCase().includes(n.toLowerCase())))

  // --- current-only reads ignore the tan previous bars ----------------------
  const ov = d.overall_effectiveness
  check('overall total is the CURRENT 4.17 (previous 4.27 excluded)', ov && ov.total === 4.17 && ov.band === 'Promising Profound Strength', JSON.stringify(ov && [ov.total, ov.band]))
  const og = Object.fromEntries((ov ? ov.by_rater_group : []).map((g) => [g.group, g.score]))
  check('overall by rater group (current)', og.Manager === 3.85 && og.Peers === 4.08 && og['Direct Reports'] === 3.92 && og.Others === 4.33 && og.Self === 3.83, JSON.stringify(og))
  check('exactly five rater-group rows (no unlabeled previous rows)', ov && ov.by_rater_group.length === 5)
  check('engagement available (5 direct reports) = current 3.93 Below Average', d.engagement.available === true && d.engagement.total === 3.93 && d.engagement.band === 'Below Average', JSON.stringify(d.engagement))
  check('five tent poles, not ten', d.tent_poles.length === 5, String(d.tent_poles.length))
  const tp = Object.fromEntries(d.tent_poles.map((t) => [t.name, t]))
  check('tent: Personal Capability 4.18 Promising (previous 4.27 excluded)', tp['Personal Capability']?.score === 4.18 && tp['Personal Capability']?.band === 'Promising Profound Strength')
  check('tent: Focus on Results 4.06 Above Average', tp['Focus on Results']?.score === 4.06 && tp['Focus on Results']?.band === 'Above Average')
  check('tent: Character 4.42 / Interpersonal 4.24 / Leading Change 4.11', tp['Character']?.score === 4.42 && tp['Interpersonal Skills']?.score === 4.24 && tp['Leading Change']?.score === 4.11)
  check('every tent pole has a band and both norms', d.tent_poles.every((t) => t.band && t.norm_75th !== null && t.norm_90th !== null))
  check('tent competencies assigned (4/5/1/6/3)', ['Personal Capability', 'Focus on Results', 'Character', 'Interpersonal Skills', 'Leading Change'].map((n) => tp[n]?.competencies.length).join() === '4,5,1,6,3', d.tent_poles.map((t) => t.competencies.length).join())

  // --- rankings (current bars only) -----------------------------------------
  const rk = Object.fromEntries(d.competency_rankings.map((c) => [c.competency, c]))
  check('19 competencies ranked', d.competency_rankings.length === 19, String(d.competency_rankings.length))
  check('Develops Others 4.48 = Profound Strength (top)', rk['Develops Others']?.total === 4.48 && rk['Develops Others']?.band === 'Profound Strength' && rk['Develops Others']?.rank === 1)
  check('Takes Initiative 4.35 = Above Average while Collaboration 4.13 = Promising (band ≠ score order)', rk['Takes Initiative']?.band === 'Above Average' && rk['Collaboration and Teamwork']?.band === 'Promising Profound Strength')
  check('Makes Decisions 3.85 = Below Average (last)', rk['Makes Decisions']?.band === 'Below Average' && rk['Makes Decisions']?.rank === 19)
  check('every competency has band + both norms, 90th > 75th', d.competency_rankings.every((c) => c.band && c.norm_75th !== null && c.norm_90th !== null && c.norm_90th > c.norm_75th))

  // --- Direct Reports column (wrapped header) --------------------------------
  const hb = Object.fromEntries(d.highest_behaviors.map((b) => [b.item_number, b]))
  const lb = Object.fromEntries(d.lowest_behaviors.map((b) => [b.item_number, b]))
  check('10 highest / 10 lowest behaviors', d.highest_behaviors.length === 10 && d.lowest_behaviors.length === 10)
  check('item 39 reads all six columns incl. Direct Reports 3.80', hb[39] && hb[39].total === 4.5 && hb[39].manager === 5 && hb[39].peers === 4.67 && hb[39].direct_reports === 3.8 && hb[39].others === 4.73 && hb[39].self === 4, JSON.stringify(hb[39]))
  check('item 29 (lowest) Direct Reports 3.80, Manager 2.00', lb[29] && lb[29].direct_reports === 3.8 && lb[29].manager === 2, JSON.stringify(lb[29]))
  check('no behavior row is missing its direct-report score', [...d.highest_behaviors, ...d.lowest_behaviors].every((b) => b.direct_reports !== null))
  const imp = Object.fromEntries(d.importance.map((i) => [i.competency, i]))
  check('19 importance rows', d.importance.length === 19)
  check('Develops Others votes 12 = 0/1/2/8/1 (M/P/DR/O/S), passion', imp['Develops Others'] && imp['Develops Others'].total_votes === 12 && imp['Develops Others'].manager === 0 && imp['Develops Others'].peers === 1 && imp['Develops Others'].direct_reports === 2 && imp['Develops Others'].others === 8 && imp['Develops Others'].self === 1 && imp['Develops Others'].is_passion, JSON.stringify(imp['Develops Others']))
  check('Inspires votes 9 = 1/2/3/3/0, passion', imp['Inspires and Motivates Others to High Performance']?.total_votes === 9 && imp['Inspires and Motivates Others to High Performance']?.direct_reports === 3 && imp['Inspires and Motivates Others to High Performance']?.is_passion)
  check('vote columns sum to the printed total on every row', d.importance.every((i) => i.manager + i.peers + i.direct_reports + i.others + i.self === i.total_votes))

  // --- gap analysis / details are the current administration ----------------
  check('19 gap rows; Integrity total 4.42 self 3.33 gap 1.09 positive', d.gap_analysis.length === 19 && d.gap_analysis.some((g) => g.competency === 'Displays High Integrity and Honesty' && g.total === 4.42 && g.self === 3.33 && g.gap === 1.09 && g.direction === 'positive'))
  const det1 = d.competency_details.find((c) => c.competency === 'Displays High Integrity and Honesty')
  check('details: Integrity total 4.42 (previous 4.38 excluded), 5 rater groups', det1 && det1.total === 4.42 && det1.by_rater_group.length === 5 && det1.by_rater_group.some((g) => g.group === 'Direct Reports' && g.score === 3.93), JSON.stringify(det1 && [det1.total, det1.by_rater_group]))
  const item1 = det1 && det1.items.find((i) => i.item_number === 1)
  check('details item 1: total 4.45 n=20 (previous 4.60 excluded)', item1 && item1.total === 4.45 && item1.n === 20 && item1.by_rater_group.every((g) => g.score !== 4.6 || g.group !== 'Total'), JSON.stringify(item1 && [item1.total, item1.n]))

  // --- the reassessment block -----------------------------------------------
  const ra = d.reassessment
  check('reassessment block present', !!ra)
  if (ra) {
    check('rating windows parsed', ra.current_window?.from === '2025-05-28' && ra.current_window?.to === '2025-10-05' && ra.previous_window?.from === '2023-10-18' && ra.previous_window?.to === '2023-12-15', JSON.stringify([ra.current_window, ra.previous_window]))
    check('previous rater counts (1/3/5/11/1), sets identical', ra.previous_rater_counts?.direct_reports === 5 && ra.previous_rater_counts?.others === 11 && ra.rater_sets_differ === false)
    check('previous overall 4.27 by group (Manager 4.03 … Self 3.97)', ra.overall_previous?.total === 4.27 && ra.overall_previous.by_rater_group.length === 5 && ra.overall_previous.by_rater_group.some((g) => g.group === 'Direct Reports' && g.score === 4.67), JSON.stringify(ra.overall_previous))
    check('previous engagement 4.48', ra.engagement_previous_total === 4.48)
    const tprev = Object.fromEntries(ra.tent_poles_previous.map((t) => [t.name, t.score]))
    check('previous tent poles 4.27/4.07/4.38/4.42/4.23', tprev['Personal Capability'] === 4.27 && tprev['Focus on Results'] === 4.07 && tprev['Character'] === 4.38 && tprev['Interpersonal Skills'] === 4.42 && tprev['Leading Change'] === 4.23, JSON.stringify(tprev))
    check('19 rows in the reassessment table, in the printed (gap-size) order', ra.by_competency.length === 19 && ra.by_competency[0].competency === 'Drives for Results' && ra.by_competency[18].competency === 'Communicates Powerfully and Prolifically')
    const rb = Object.fromEntries(ra.by_competency.map((r) => [r.competency, r]))
    check('Drives for Results 4.22 vs 4.10 = +0.12 irrelevant', rb['Drives for Results']?.current_total === 4.22 && rb['Drives for Results']?.previous_total === 4.1 && near(rb['Drives for Results']?.gap, 0.12) && rb['Drives for Results']?.direction === 'irrelevant')
    check('Inspires −0.30 coloured IRRELEVANT by the report (colour, not score)', rb['Inspires and Motivates Others to High Performance']?.direction === 'irrelevant' && near(rb['Inspires and Motivates Others to High Performance']?.gap, -0.3))
    check('Communicates −0.32 = meaningful negative', rb['Communicates Powerfully and Prolifically']?.direction === 'negative' && near(rb['Communicates Powerfully and Prolifically']?.gap, -0.32))
    check('every row: current − previous = printed gap', ra.by_competency.every((r) => near(r.current_total - r.previous_total, r.gap)))
    check('every current total agrees with the rankings page', ra.by_competency.every((r) => rk[r.competency] && rk[r.competency].total === r.current_total))
    check('every row classified (no null direction)', ra.by_competency.every((r) => r.direction !== null))
  }

  // --- three circles still run --------------------------------------------
  check('development candidates computed', d.development_candidates.length >= 3 && d.development_candidates[0].competency === 'Inspires and Motivates Others to High Performance', JSON.stringify(d.development_candidates.slice(0, 2).map((c) => c.competency)))

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
