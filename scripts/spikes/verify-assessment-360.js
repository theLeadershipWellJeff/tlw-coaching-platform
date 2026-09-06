// Phase 2 acceptance test against the private reference report.
//
//   node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json && \
//   PDF=fixtures/private/reference-360.pdf node scripts/spikes/verify-assessment-360.js
//
// Encodes every check in the build prompt's Phase 2 validation. Prints PASS/FAIL
// per check and exits non-zero on any failure. The fixture never leaves
// fixtures/private (gitignored — it contains rater names).
const fs = require('fs')
const path = require('path')

const PDF = process.env.PDF || 'fixtures/private/reference-360.pdf'
const build = path.resolve(__dirname, '../../.spike-build/lib/documents/assessment-360')
const { extractAssessment360 } = require(path.join(build, 'index.js'))
const { namesMatch } = require(path.join(build, 'validate.js'))
const { compareAssessments } = require(path.join(build, 'compare.js'))

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
}
const near = (a, b, tol = 0.011) => typeof a === 'number' && Math.abs(a - b) <= tol

;(async () => {
  const bytes = new Uint8Array(fs.readFileSync(PDF))
  const t0 = Date.now()
  const out = await extractAssessment360(bytes)
  console.log(`extraction: ${out.status} in ${Date.now() - t0} ms`)
  if (out.status !== 'complete') {
    console.log(JSON.stringify(out, null, 2))
    process.exit(1)
  }
  const d = out.data
  if (out.warnings.length) console.log('warnings:', out.warnings)

  // --- cover / counts -------------------------------------------------------
  check('participant name read', d.participant_name === 'Jeff Holmes', d.participant_name)
  check('assessment_date parsed', d.assessment_date === '2024-08-12', d.assessment_date)
  check('rater counts', d.rater_counts.manager === 2 && d.rater_counts.peers === 3 && d.rater_counts.direct_reports === 2 && d.rater_counts.others === 1 && d.rater_counts.self === 1, JSON.stringify(d.rater_counts))
  check('small-N collapse noted', !!d.rater_counts.collapsed_note, d.rater_counts.collapsed_note)
  check('engagement absent (fewer than 3 direct reports)', d.engagement.available === false, d.engagement.reason)

  // --- rankings: the inversion the whole design rests on --------------------
  const rk = Object.fromEntries(d.competency_rankings.map((c) => [c.competency, c]))
  check('19 competencies ranked', d.competency_rankings.length === 19, String(d.competency_rankings.length))
  check('Inspires 4.38 = Profound Strength (green)', rk['Inspires and Motivates Others to High Performance']?.total === 4.38 && rk['Inspires and Motivates Others to High Performance']?.band === 'Profound Strength', JSON.stringify(rk['Inspires and Motivates Others to High Performance']))
  check('Integrity 4.58 = Promising Profound Strength (blue)', rk['Displays High Integrity and Honesty']?.total === 4.58 && rk['Displays High Integrity and Honesty']?.band === 'Promising Profound Strength')
  check('Technical 4.35 = Above Average while Collaboration 4.09 = Promising', rk['Technical and Professional Acumen']?.band === 'Above Average' && rk['Collaboration and Teamwork']?.band === 'Promising Profound Strength')
  check('Solves Problems 3.96 = Below Average', rk['Solves Problems and Analyzes Issues']?.band === 'Below Average')
  check('Inspires sits just below its 90th norm yet is green', rk['Inspires and Motivates Others to High Performance']?.norm_90th >= 4.38 && rk['Inspires and Motivates Others to High Performance']?.norm_90th <= 4.41, `norm90=${rk['Inspires and Motivates Others to High Performance']?.norm_90th}`)
  check('every competency has band + both norms', d.competency_rankings.every((c) => c.band && c.norm_75th !== null && c.norm_90th !== null && c.norm_90th > c.norm_75th))
  check('band order does NOT follow score order', (() => {
    const bySc = [...d.competency_rankings].sort((a, b) => b.total - a.total)
    const order = ['Potential Fatal Flaw', 'Below Average', 'Above Average', 'Promising Profound Strength', 'Profound Strength']
    return bySc.some((c, i) => i > 0 && order.indexOf(bySc[i - 1].band) < order.indexOf(c.band))
  })())

  // --- page 5 rater comparison ---------------------------------------------
  const ov = d.overall_effectiveness
  check('overall total 4.33 Promising', ov && ov.total === 4.33 && ov.band === 'Promising Profound Strength', ov && `${ov.total} ${ov.band}`)
  const g = Object.fromEntries((ov?.by_rater_group || []).map((r) => [r.group, r]))
  check('Manager 3.88 below 75th', g.Manager?.score === 3.88 && g.Manager?.vs_75th === 'below', JSON.stringify(g.Manager))
  check('Self 4.00 below 75th', g.Self?.score === 4.0 && g.Self?.vs_75th === 'below', JSON.stringify(g.Self))
  check('Peers 4.41 at/above 90th', g.Peers?.score === 4.41 && ['at', 'above'].includes(g.Peers?.vs_90th), JSON.stringify(g.Peers))
  check('Others 4.52 at/above 90th', g.Others?.score === 4.52 && ['at', 'above'].includes(g.Others?.vs_90th), JSON.stringify(g.Others))
  check('rater rows carry different norms (norms vary by group)', new Set((ov?.by_rater_group || []).map((r) => r.norm_90th)).size > 1)

  // --- tent poles -------------------------------------------------------------
  const tp = Object.fromEntries(d.tent_poles.map((t) => [t.name, t]))
  check('5 tent poles', d.tent_poles.length === 5, d.tent_poles.map((t) => `${t.name}=${t.score}/${t.band}`).join(', '))
  // The report's own tent-pole inversion: Interpersonal 4.40 is green, Character 4.58 is blue.
  check('Interpersonal 4.40 = Profound while Character 4.58 = Promising (tent-pole inversion)', tp['Interpersonal Skills']?.score === 4.4 && tp['Interpersonal Skills']?.band === 'Profound Strength' && tp.Character?.score === 4.58 && tp.Character?.band === 'Promising Profound Strength')
  check('tent-pole norms agree with the bands', tp['Interpersonal Skills']?.norm_90th <= 4.4 && tp.Character?.norm_90th > 4.58, `interp n90=${tp['Interpersonal Skills']?.norm_90th} char n90=${tp.Character?.norm_90th}`)
  check('tent pole competencies split correctly', tp['Personal Capability']?.competencies.length === 4 && tp['Interpersonal Skills']?.competencies.length === 6, JSON.stringify(d.tent_poles.map((t) => t.competencies.length)))

  // --- behaviours (scrambled columns) ----------------------------------------
  const hb = d.highest_behaviors
  check('10 highest behaviours', hb.length === 10, String(hb.length))
  const b56 = hb.find((b) => b.item_number === 56)
  check('item 56: Manager 4.00, Self 5.00, Others 5.00, Peers 5.00, Total 4.71', b56 && b56.manager === 4 && b56.self === 5 && b56.others === 5 && b56.peers === 5 && b56.total === 4.71 && b56.competency === 'Champions Change', JSON.stringify(b56))
  const b2 = hb.find((b) => b.item_number === 2)
  check('item 2 wrapped competency joined', b2?.competency === 'Displays High Integrity and Honesty' && /walk the talk/.test(b2.item) && b2.peers === 4.33 && b2.self === 4.0, JSON.stringify(b2))
  const lb = d.lowest_behaviors
  check('10 lowest behaviours', lb.length === 10, String(lb.length))
  const b14 = lb.find((b) => b.item_number === 14)
  // Columns by position (verified against the score-details page): Peers 4.67, Others 3.33.
  check('item 14: Manager 3.00, Peers 4.67, Others 3.33, Self 3.00, Total 3.75', b14 && b14.manager === 3 && b14.peers === 4.67 && b14.others === 3.33 && b14.self === 3 && b14.total === 3.75, JSON.stringify(b14))
  check('item 14 behaviours row agrees with the score-details page', (() => { const la = d.competency_details.find((c) => c.competency === 'Learning Agility'); const i = la?.items.find((x) => x.item_number === 14); return i && i.by_rater_group.find((r) => r.group === 'Peers')?.score === b14?.peers && i.by_rater_group.find((r) => r.group === 'Others')?.score === b14?.others })())

  // --- gap analysis -----------------------------------------------------------
  const gap = Object.fromEntries(d.gap_analysis.map((r) => [r.competency, r]))
  check('19 gap rows', d.gap_analysis.length === 19, String(d.gap_analysis.length))
  check('Builds Relationships gap 1.19 self 3.33 total 4.52 positive', gap['Builds Relationships']?.gap === 1.19 && gap['Builds Relationships']?.self === 3.33 && gap['Builds Relationships']?.total === 4.52 && gap['Builds Relationships']?.direction === 'positive', JSON.stringify(gap['Builds Relationships']))
  check('Makes Decisions gap -0.67 negative', gap['Makes Decisions']?.gap === -0.67 && gap['Makes Decisions']?.direction === 'negative', JSON.stringify(gap['Makes Decisions']))
  check('Innovates gap 0.00 irrelevant', gap['Innovates']?.gap === 0 && gap['Innovates']?.direction === 'irrelevant', JSON.stringify(gap['Innovates']))

  // --- importance + passions ---------------------------------------------------
  const imp = Object.fromEntries(d.importance.map((r) => [r.competency, r]))
  check('19 importance rows', d.importance.length === 19, String(d.importance.length))
  check('six passions marked', d.importance.filter((r) => r.is_passion).length === 6, d.importance.filter((r) => r.is_passion).map((r) => r.competency).join(', '))
  check('Integrity: manager 1, peers 2, others 2, self 1, total 6', imp['Displays High Integrity and Honesty']?.manager === 1 && imp['Displays High Integrity and Honesty']?.peers === 2 && imp['Displays High Integrity and Honesty']?.others === 2 && imp['Displays High Integrity and Honesty']?.self === 1 && imp['Displays High Integrity and Honesty']?.total_votes === 6, JSON.stringify(imp['Displays High Integrity and Honesty']))
  check('Strategic Perspective: manager 1, others 2, self 1, passion', imp['Develops Strategic Perspective']?.manager === 1 && imp['Develops Strategic Perspective']?.others === 2 && imp['Develops Strategic Perspective']?.self === 1 && imp['Develops Strategic Perspective']?.is_passion === true, JSON.stringify(imp['Develops Strategic Perspective']))
  check('Solves Problems: zero votes but a passion', imp['Solves Problems and Analyzes Issues']?.total_votes === 0 && imp['Solves Problems and Analyzes Issues']?.is_passion === true)

  // --- development targets (the house method) ----------------------------------
  const top3 = d.development_candidates.slice(0, 3).map((c) => c.competency)
  const expected = ['Develops Strategic Perspective', 'Technical and Professional Acumen', 'Learning Agility']
  check('top three development candidates are the expected three', expected.every((e) => top3.includes(e)), top3.join(' | '))
  check('top candidates meet all three circles', d.development_candidates.slice(0, 3).every((c) => c.circles_met === 3))
  check('Profound Strengths are never candidates', d.development_candidates.every((c) => c.band !== 'Profound Strength'))
  console.log('  candidates:', d.development_candidates.map((c) => `${c.competency} [${c.circles_met}/3 imp=${c.weighted_importance} d90=${c.distance_to_90th}]`).join('; '))

  // --- verbatims ----------------------------------------------------------------
  const v = d.verbatims
  check('strengths verbatims for all four groups', ['manager', 'peers', 'others', 'self'].every((k) => (v.strengths[k] || []).length > 0), JSON.stringify(Object.fromEntries(Object.entries(v.strengths).map(([k, a]) => [k, a.length]))))
  check('strengths continue across the page break (others on page 9)', (v.strengths.others || []).some((s) => /gather the right people/.test(s)))
  check('org needs: peers multi-line response joined', (v.organizational_needs.peers || []).some((s) => /strategic thinking/.test(s) && /overall performance/.test(s)))
  check('fatal flaws: self response present', (v.potential_fatal_flaws.self || []).some((s) => /measured approach/.test(s)))
  check('no group label glued onto a verbatim', !Object.values(v).flatMap((g) => Object.values(g).flat()).some((s) => /(Peers|Others|Self|Manager)$/.test(s)))

  // --- competency details --------------------------------------------------------
  const det = Object.fromEntries(d.competency_details.map((c) => [c.competency, c]))
  check('19 competency detail blocks', d.competency_details.length === 19, String(d.competency_details.length))
  const integ = det['Displays High Integrity and Honesty']
  check('Integrity detail: total 4.58, Manager 4.50, Peers 4.44, Others 4.78, Self 3.67', integ && integ.total === 4.58 && integ.by_rater_group.find((r) => r.group === 'Manager')?.score === 4.5 && integ.by_rater_group.find((r) => r.group === 'Peers')?.score === 4.44 && integ.by_rater_group.find((r) => r.group === 'Others')?.score === 4.78 && integ.by_rater_group.find((r) => r.group === 'Self')?.score === 3.67, integ && JSON.stringify(integ.by_rater_group))
  check('Integrity item 1: total 4.50 n=8, Peers 4.33 n=3', integ && integ.items[0]?.item_number === 1 && integ.items[0]?.total === 4.5 && integ.items[0]?.n === 8 && integ.items[0]?.by_rater_group.find((r) => r.group === 'Peers')?.score === 4.33 && integ.items[0]?.by_rater_group.find((r) => r.group === 'Peers')?.n === 3, integ && JSON.stringify(integ.items[0]))
  check('60 items in total, every competency has 3 or 4', d.competency_details.reduce((n, c) => n + c.items.length, 0) === 60 && d.competency_details.every((c) => c.items.length >= 3 && c.items.length <= 4), d.competency_details.map((c) => c.items.length).join(','))
  check('item numbers 1–60 each appear exactly once', (() => { const nums = d.competency_details.flatMap((c) => c.items.map((i) => i.item_number)).sort((a, b) => a - b); return nums.length === 60 && nums.every((n, i) => n === i + 1) })())

  // --- confidentiality -----------------------------------------------------------
  check('rater names collected for the assertion (12 invited)', out.raterNames.length === 12, String(out.raterNames.length))
  const payload = (JSON.stringify(d) + out.extractedText).toLowerCase()
  check('no rater name in structured_data or extracted text', out.raterNames.every((n) => !payload.includes(n.toLowerCase())))
  check('extracted text excludes boilerplate pages 1–4', !/Your Raters|Rater Type/.test(out.extractedText) && !/How Is Rater Feedback Reported/.test(out.extractedText))
  check('extracted text keeps the verbatims', /gather the right people/.test(out.extractedText))

  // --- name gate ----------------------------------------------------------------
  check('name match: "Jeff Holmes" vs "Jeff Holmes"', namesMatch(d.participant_name, 'Jeff Holmes'))
  check('name match: "Jeff Holmes" vs "Dr. Jeff K. Holmes"', namesMatch(d.participant_name, 'Dr. Jeff K. Holmes'))
  check('name mismatch blocks: "Jeff Holmes" vs "Caleb Landon"', !namesMatch(d.participant_name, 'Caleb Landon'))
  check('name mismatch blocks: "Jeff Holmes" vs "Jeff Smith"', !namesMatch(d.participant_name, 'Jeff Smith'))

  // --- longitudinal comparison (self vs. a synthetic prior) -----------------------
  const prior = JSON.parse(JSON.stringify(d))
  prior.assessment_date = '2023-01-15'
  prior.rater_counts.peers = 4
  const strat = prior.competency_rankings.find((c) => c.competency === 'Develops Strategic Perspective')
  strat.total = 4.1
  strat.band = 'Above Average'
  strat.distance_to_90th = 0.26
  const cmp = compareAssessments(d, prior, 'prior-doc-id')
  const cs = cmp.by_competency.find((c) => c.competency === 'Develops Strategic Perspective')
  check('comparison: months elapsed ≈ 19', cmp.months_elapsed === 19, String(cmp.months_elapsed))
  check('comparison: rater sets differ flagged, confidence moderate', cmp.comparability.rater_sets_differ === true && cmp.comparability.confidence === 'moderate')
  check('comparison: Strategic band moved up, normed delta positive', cs && cs.band_moved === 'up' && cs.normed_delta > 0 && near(cs.raw_delta, 0.16), JSON.stringify(cs))
  check('comparison: no aggregate/overall change score field', !('overall_delta' in cmp) && !('most_improved' in cmp))

  // --- unsupported layout ----------------------------------------------------------
  const garbage = await extractAssessment360(new Uint8Array(fs.readFileSync(path.resolve(__dirname, 'not-a-report.pdf')))).catch(() => null)
  if (garbage) check('a different PDF is reported unsupported, not parsed', garbage.status === 'unsupported' || garbage.status === 'failed', garbage.status)

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
