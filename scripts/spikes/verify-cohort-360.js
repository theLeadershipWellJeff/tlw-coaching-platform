// Calibration set, round 2 (2026-09-22): three more real reports, read by hand
// against the printed pages and pinned here so the extractor cannot drift on
// them. Fixtures live in fixtures/private (gitignored — they carry rater names).
//
//   node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json && \
//   node scripts/spikes/verify-cohort-360.js
//
// What these three add to the reference report (verify-assessment-360.js) and
// the first follow-up (verify-followup-360.js):
//   johnson  initial layout, 2025 print, every group uncollapsed (M3 P4 DR4 O3),
//            Engagement in the POTENTIAL FATAL FLAW band, two competencies in
//            that band, five marked self-gaps in both directions;
//   koudsi   follow-up, seventeen competencies in the fatal-flaw band, overall
//            itself in that band, NO Others group on the counts line, the
//            prior administration's two Others dropped from its "reported as"
//            line, every reassessment gap negative and all but one meaningful,
//            a −0.33 self-gap the report colours irrelevant;
//   hindawi  follow-up, Others folded into Peers on BOTH administrations,
//            eight direct reports who cast only sixteen importance votes, ten
//            meaningful positive reassessment gaps (three at exactly +0.30),
//            no marked self-gap at all (a +0.47 stays grey).
// A missing fixture is skipped, not failed, so the script runs on any subset.
const fs = require('fs')
const path = require('path')

const build = path.resolve(__dirname, '../../.spike-build/lib/documents/assessment-360')
const { extractAssessment360 } = require(path.join(build, 'index.js'))
const dir = path.resolve(__dirname, '../../fixtures/private')

let failures = 0
let checks = 0
function check(name, ok, detail = '') {
  checks++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
}
const near = (a, b, tol = 0.011) => typeof a === 'number' && Math.abs(a - b) <= tol
const by = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], r]))
const bandCounts = (d) => {
  const out = {}
  for (const c of d.competency_rankings) out[c.band] = (out[c.band] || 0) + 1
  return out
}

async function load(file) {
  const p = path.join(dir, file)
  if (!fs.existsSync(p)) {
    console.log(`\n(skipping ${file} — fixture not present)`)
    return null
  }
  const out = await extractAssessment360(new Uint8Array(fs.readFileSync(p)))
  console.log(`\n===== ${file}: ${out.status}${out.warnings?.length ? ` · warnings: ${JSON.stringify(out.warnings)}` : ''}`)
  if (out.status !== 'complete') {
    check(`${file} extracts`, false, out.error || out.status)
    return null
  }
  check(`${file}: no rater name in the stored payload`, !out.raterNames.some((n) => n.trim().length >= 5 && (JSON.stringify(out.data) + out.extractedText).toLowerCase().includes(n.toLowerCase())))
  return out
}

;(async () => {
  // ---------------------------------------------------------------- johnson
  const j = await load('johnson-360.pdf')
  if (j) {
    const d = j.data
    check('johnson: initial layout, 2025 print', d.format_version === 'extraordinary-leader/2024', d.format_version)
    check('johnson: name + date', d.participant_name === 'Jim Johnson' && d.assessment_date === '2025-03-18', `${d.participant_name} ${d.assessment_date}`)
    const rc = d.rater_counts
    check('johnson: raters M3 P4 DR4 O3 S1, nothing combined', rc.manager === 3 && rc.peers === 4 && rc.direct_reports === 4 && rc.others === 3 && rc.self === 1 && !rc.reported_as && !rc.collapsed_note, JSON.stringify(rc))
    check('johnson: no warnings', j.warnings.length === 0, JSON.stringify(j.warnings))
    const ov = d.overall_effectiveness
    const og = by(ov.by_rater_group, 'group')
    check('johnson: overall 3.61 Below Average', ov.total === 3.61 && ov.band === 'Below Average', JSON.stringify([ov.total, ov.band]))
    check('johnson: by group M3.69 P4.10 DR2.77 O4.04 S3.75', og.Manager?.score === 3.69 && og.Peers?.score === 4.1 && og['Direct Reports']?.score === 2.77 && og.Others?.score === 4.04 && og.Self?.score === 3.75, JSON.stringify(Object.values(og).map((g) => [g.group, g.score])))
    check('johnson: peers AT the 75th marker (4.10 vs 4.11), below the 90th', og.Peers?.vs_75th === 'at' && og.Peers?.vs_90th === 'below')
    check('johnson: engagement 3.37 = POTENTIAL FATAL FLAW band', d.engagement.available && d.engagement.total === 3.37 && d.engagement.band === 'Potential Fatal Flaw', JSON.stringify(d.engagement))
    const tp = by(d.tent_poles, 'name')
    check('johnson: tent 3.73/3.52/4.02/3.55/3.55, all Below Average', tp['Personal Capability']?.score === 3.73 && tp['Focus on Results']?.score === 3.52 && tp['Character']?.score === 4.02 && tp['Interpersonal Skills']?.score === 3.55 && tp['Leading Change']?.score === 3.55 && d.tent_poles.every((t) => t.band === 'Below Average'))
    const bc = bandCounts(d)
    check('johnson: bands Above 1 / Below 16 / Fatal 2', bc['Above Average'] === 1 && bc['Below Average'] === 16 && bc['Potential Fatal Flaw'] === 2, JSON.stringify(bc))
    const rk = by(d.competency_rankings, 'competency')
    check('johnson: Technical Acumen 4.26 Above Average at rank 1', rk['Technical and Professional Acumen']?.total === 4.26 && rk['Technical and Professional Acumen']?.band === 'Above Average' && rk['Technical and Professional Acumen']?.rank === 1)
    check('johnson: Makes Decisions 3.44 fatal-flaw band ranks BELOW Collaboration 3.30 Below Average', rk['Makes Decisions']?.band === 'Potential Fatal Flaw' && rk['Makes Decisions']?.rank === 18 && rk['Collaboration and Teamwork']?.rank === 17)
    check('johnson: Takes Initiative 3.38 fatal-flaw band, last', rk['Takes Initiative']?.total === 3.38 && rk['Takes Initiative']?.band === 'Potential Fatal Flaw' && rk['Takes Initiative']?.rank === 19)
    const imp = by(d.importance, 'competency')
    check('johnson: Integrity votes 8 = 1/3/1/2/1 (M/P/DR/O/S), passion', imp['Displays High Integrity and Honesty']?.total_votes === 8 && imp['Displays High Integrity and Honesty']?.manager === 1 && imp['Displays High Integrity and Honesty']?.peers === 3 && imp['Displays High Integrity and Honesty']?.direct_reports === 1 && imp['Displays High Integrity and Honesty']?.others === 2 && imp['Displays High Integrity and Honesty']?.self === 1 && imp['Displays High Integrity and Honesty']?.is_passion, JSON.stringify(imp['Displays High Integrity and Honesty']))
    check('johnson: Builds Relationships votes 7 = 2/2/3/0/0, not a passion', imp['Builds Relationships']?.total_votes === 7 && imp['Builds Relationships']?.manager === 2 && imp['Builds Relationships']?.direct_reports === 3 && !imp['Builds Relationships']?.is_passion)
    check('johnson: every rater used all four votes (3+4+4+3+1 raters → 60 votes)', d.importance.reduce((n, i) => n + i.total_votes, 0) === 60)
    check('johnson: six passions', d.importance.filter((i) => i.is_passion).length === 6)
    const gp = by(d.gap_analysis, 'competency')
    check('johnson: Stretch Goals +0.84 and Drives +0.83 = meaningful POSITIVE', gp['Establishes Stretch Goals']?.direction === 'positive' && near(gp['Establishes Stretch Goals']?.gap, 0.84) && gp['Drives for Results']?.direction === 'positive')
    check('johnson: Innovates −0.99, Takes Initiative −0.95, Develops Others −0.63 = meaningful NEGATIVE', gp['Innovates']?.direction === 'negative' && gp['Takes Initiative']?.direction === 'negative' && gp['Develops Others']?.direction === 'negative')
    check('johnson: Takes Risks +0.44 and Customer Focus −0.43 coloured IRRELEVANT (the self-gap threshold is not .30)', gp['Takes Risks']?.direction === 'irrelevant' && gp['Customer and External Focus']?.direction === 'irrelevant')
    check('johnson: exactly five marked gaps', d.gap_analysis.filter((g) => g.direction === 'positive' || g.direction === 'negative').length === 5)
    const hb = by(d.highest_behaviors, 'item_number')
    check('johnson: item 5 = 4.43 · 4.67/4.50/4.00/4.67/5.00', hb[5] && hb[5].total === 4.43 && hb[5].manager === 4.67 && hb[5].peers === 4.5 && hb[5].direct_reports === 4 && hb[5].others === 4.67 && hb[5].self === 5, JSON.stringify(hb[5]))
    const det = by(d.competency_details, 'competency')['Displays High Integrity and Honesty']
    check('johnson: Integrity details 4.02 · M4.56 P3.92 DR3.33 O4.56 S4.33', det && det.total === 4.02 && by(det.by_rater_group, 'group').Manager?.score === 4.56 && by(det.by_rater_group, 'group')['Direct Reports']?.score === 3.33, JSON.stringify(det && det.by_rater_group))
    check('johnson: no comparison, no reassessment', !d.comparison && !d.reassessment)
    check('johnson: verbatims 3/3/4/3/1 strengths by group (M/P/DR/O/S)', d.verbatims.strengths.manager?.length === 3 && d.verbatims.strengths.peers?.length === 3 && d.verbatims.strengths.direct_reports?.length === 4 && d.verbatims.strengths.others?.length === 5 && d.verbatims.strengths.self?.length === 1, JSON.stringify(Object.entries(d.verbatims.strengths).map(([k, v]) => [k, v.length])))
  }

  // ----------------------------------------------------------------- koudsi
  const k = await load('koudsi-360.pdf')
  if (k) {
    const d = k.data
    check('koudsi: follow-up layout', d.format_version === 'extraordinary-leader/2024-followup', d.format_version)
    check('koudsi: name + date', d.participant_name === 'Tarek Koudsi' && d.assessment_date === '2025-10-05', `${d.participant_name} ${d.assessment_date}`)
    const rc = d.rater_counts
    check('koudsi: current raters M1 P6 DR3, Others 0 (absent from the line, not unknown), S1', rc.manager === 1 && rc.peers === 6 && rc.direct_reports === 3 && rc.others === 0 && rc.self === 1 && !rc.reported_as, JSON.stringify(rc))
    check('koudsi: the only warning is the band-order one (everything is in one band)', k.warnings.length === 1 && /Band order follows score order/.test(k.warnings[0]), JSON.stringify(k.warnings))
    const ov = d.overall_effectiveness
    const og = by(ov.by_rater_group, 'group')
    check('koudsi: overall 3.02 in the POTENTIAL FATAL FLAW band', ov.total === 3.02 && ov.band === 'Potential Fatal Flaw', JSON.stringify([ov.total, ov.band]))
    check('koudsi: by group M2.65 P2.79 DR3.62 S4.00 (four rows — no Others)', og.Manager?.score === 2.65 && og.Peers?.score === 2.79 && og['Direct Reports']?.score === 3.62 && og.Self?.score === 4 && ov.by_rater_group.length === 4, JSON.stringify(Object.values(og).map((g) => [g.group, g.score])))
    check('koudsi: engagement 3.89 Below Average (previous 3.77 excluded)', d.engagement.available && d.engagement.total === 3.89 && d.engagement.band === 'Below Average', JSON.stringify(d.engagement))
    const tp = by(d.tent_poles, 'name')
    check('koudsi: tent 3.08/2.99/3.03/2.87/3.17 all fatal-flaw band', tp['Personal Capability']?.score === 3.08 && tp['Focus on Results']?.score === 2.99 && tp['Character']?.score === 3.03 && tp['Interpersonal Skills']?.score === 2.87 && tp['Leading Change']?.score === 3.17 && d.tent_poles.every((t) => t.band === 'Potential Fatal Flaw'), JSON.stringify(d.tent_poles.map((t) => [t.score, t.band])))
    const bc = bandCounts(d)
    check('koudsi: bands Below 2 / Fatal 17', bc['Below Average'] === 2 && bc['Potential Fatal Flaw'] === 17, JSON.stringify(bc))
    const rk = by(d.competency_rankings, 'competency')
    check('koudsi: Innovates 3.50 and Values Diversity 3.46 = Below Average; Takes Risks 3.46 = fatal-flaw (same score, lower band)', rk['Innovates']?.band === 'Below Average' && rk['Values Diversity']?.band === 'Below Average' && rk['Takes Risks']?.total === 3.46 && rk['Takes Risks']?.band === 'Potential Fatal Flaw')
    check('koudsi: Drives for Results 2.60 last', rk['Drives for Results']?.total === 2.6 && rk['Drives for Results']?.rank === 19)
    const imp = by(d.importance, 'competency')
    check('koudsi: Innovates votes 7 = 1/5/0/0/1, passion', imp['Innovates']?.total_votes === 7 && imp['Innovates']?.manager === 1 && imp['Innovates']?.peers === 5 && imp['Innovates']?.direct_reports === 0 && imp['Innovates']?.self === 1 && imp['Innovates']?.is_passion, JSON.stringify(imp['Innovates']))
    check('koudsi: Collaboration votes 3 = 0/1/2/0/0', imp['Collaboration and Teamwork']?.total_votes === 3 && imp['Collaboration and Teamwork']?.peers === 1 && imp['Collaboration and Teamwork']?.direct_reports === 2)
    check('koudsi: three direct reports cast eight votes, not twelve (raters may pick fewer than four)', d.importance.reduce((n, i) => n + i.direct_reports, 0) === 8)
    check('koudsi: six passions', d.importance.filter((i) => i.is_passion).length === 6)
    const gp = by(d.gap_analysis, 'competency')
    check('koudsi: Makes Decisions −0.33 coloured IRRELEVANT, Takes Risks −0.54 meaningful negative', gp['Makes Decisions']?.direction === 'irrelevant' && near(gp['Makes Decisions']?.gap, -0.33) && gp['Takes Risks']?.direction === 'negative')
    check('koudsi: seventeen marked gaps, all negative (self higher)', d.gap_analysis.filter((g) => g.direction === 'negative').length === 17 && !d.gap_analysis.some((g) => g.direction === 'positive'))
    const hb = by(d.highest_behaviors, 'item_number')
    check('koudsi: item 47 = 3.75 · 3.00/3.50/4.33/–/4.00 (no Others column)', hb[47] && hb[47].total === 3.75 && hb[47].manager === 3 && hb[47].peers === 3.5 && hb[47].direct_reports === 4.33 && hb[47].others === null && hb[47].self === 4, JSON.stringify(hb[47]))
    const det = by(d.competency_details, 'competency')['Displays High Integrity and Honesty']
    const dg = det ? by(det.by_rater_group, 'group') : {}
    check('koudsi: Integrity details 3.03 · M3.00 P2.72 DR3.67 S4.00 (previous bars excluded)', det && det.total === 3.03 && dg.Manager?.score === 3 && dg.Peers?.score === 2.72 && dg['Direct Reports']?.score === 3.67 && dg.Self?.score === 4, JSON.stringify(det && det.by_rater_group))
    const item1 = det && det.items.find((i) => i.item_number === 1)
    check('koudsi: details item 1 total 3.00 n=10 (previous 3.55 n=11 excluded)', item1 && item1.total === 3 && item1.n === 10, JSON.stringify(item1 && [item1.total, item1.n]))
    const ra = d.reassessment
    check('koudsi: reassessment block present', !!ra)
    if (ra) {
      check('koudsi: windows 2025-05-11→10-05 vs 2023-10-18→12-15', ra.current_window?.from === '2025-05-11' && ra.current_window?.to === '2025-10-05' && ra.previous_window?.from === '2023-10-18' && ra.previous_window?.to === '2023-12-15', JSON.stringify([ra.current_window, ra.previous_window]))
      const pr = ra.previous_rater_counts
      check('koudsi: previous raters M1 P5 DR6 O2 S1, reported WITHOUT the two Others', pr?.manager === 1 && pr?.peers === 5 && pr?.direct_reports === 6 && pr?.others === 2 && pr?.reported_as && !('others' in pr.reported_as) && pr.reported_as.peers === 5 && ra.rater_sets_differ === true, JSON.stringify(pr))
      check('koudsi: previous overall 3.52 · M3.42 P3.30 DR3.62 S4.88', ra.overall_previous?.total === 3.52 && by(ra.overall_previous.by_rater_group, 'group').Self?.score === 4.88 && by(ra.overall_previous.by_rater_group, 'group').Manager?.score === 3.42, JSON.stringify(ra.overall_previous))
      check('koudsi: previous engagement 3.77', ra.engagement_previous_total === 3.77)
      const tprev = by(ra.tent_poles_previous, 'name')
      check('koudsi: previous tent 3.61/3.39/3.48/3.40/3.82', tprev['Personal Capability']?.score === 3.61 && tprev['Focus on Results']?.score === 3.39 && tprev['Character']?.score === 3.48 && tprev['Interpersonal Skills']?.score === 3.4 && tprev['Leading Change']?.score === 3.82, JSON.stringify(ra.tent_poles_previous))
      const rb = by(ra.by_competency, 'competency')
      check('koudsi: 19 rows, Takes Risks −0.13 first (irrelevant), Learning Agility −0.81 last', ra.by_competency.length === 19 && ra.by_competency[0].competency === 'Takes Risks' && rb['Takes Risks'].direction === 'irrelevant' && ra.by_competency[18].competency === 'Learning Agility' && near(rb['Learning Agility'].gap, -0.81))
      check('koudsi: Solves Problems −0.31 = meaningful negative (just past .30)', rb['Solves Problems and Analyzes Issues']?.direction === 'negative' && near(rb['Solves Problems and Analyzes Issues']?.gap, -0.31))
      check('koudsi: eighteen meaningful negatives, one irrelevant, no positives', ra.by_competency.filter((r) => r.direction === 'negative').length === 18 && ra.by_competency.filter((r) => r.direction === 'irrelevant').length === 1)
      check('koudsi: every reassessment row arithmetically consistent and matching the rankings', ra.by_competency.every((r) => near(r.current_total - r.previous_total, r.gap) && rk[r.competency]?.total === r.current_total))
    }
  }

  // ---------------------------------------------------------------- hindawi
  const h = await load('hindawi-360.pdf')
  if (h) {
    const d = h.data
    check('hindawi: follow-up layout', d.format_version === 'extraordinary-leader/2024-followup', d.format_version)
    check('hindawi: name + date', d.participant_name === 'Maen Hindawi' && d.assessment_date === '2025-10-05', `${d.participant_name} ${d.assessment_date}`)
    const rc = d.rater_counts
    check('hindawi: received M1 P2 DR8 O4 S1 → reported M1 P6 DR8 S1 (Others folded into Peers)', rc.manager === 1 && rc.peers === 2 && rc.direct_reports === 8 && rc.others === 4 && rc.reported_as?.peers === 6 && rc.reported_as?.direct_reports === 8 && !('others' in (rc.reported_as || {})) && !!rc.collapsed_note, JSON.stringify(rc))
    check('hindawi: no warnings', h.warnings.length === 0, JSON.stringify(h.warnings))
    const ov = d.overall_effectiveness
    const og = by(ov.by_rater_group, 'group')
    check('hindawi: overall 4.21 Promising (previous 3.92 excluded)', ov.total === 4.21 && ov.band === 'Promising Profound Strength', JSON.stringify([ov.total, ov.band]))
    check('hindawi: by group M4.05 P4.10 DR4.32 S4.08, four rows', og.Manager?.score === 4.05 && og.Peers?.score === 4.1 && og['Direct Reports']?.score === 4.32 && og.Self?.score === 4.08 && ov.by_rater_group.length === 4, JSON.stringify(Object.values(og).map((g) => [g.group, g.score])))
    check('hindawi: engagement 4.52 Promising (previous 4.53 excluded)', d.engagement.available && d.engagement.total === 4.52 && d.engagement.band === 'Promising Profound Strength', JSON.stringify(d.engagement))
    const tp = by(d.tent_poles, 'name')
    check('hindawi: tent 4.23 Promising / 4.20 Above Average / 4.47 / 4.16 / 4.21', tp['Personal Capability']?.score === 4.23 && tp['Personal Capability']?.band === 'Promising Profound Strength' && tp['Focus on Results']?.score === 4.2 && tp['Focus on Results']?.band === 'Above Average' && tp['Character']?.score === 4.47 && tp['Interpersonal Skills']?.score === 4.16 && tp['Leading Change']?.score === 4.21, JSON.stringify(d.tent_poles.map((t) => [t.score, t.band])))
    const bc = bandCounts(d)
    check('hindawi: bands Promising 12 / Above 6 / Below 1', bc['Promising Profound Strength'] === 12 && bc['Above Average'] === 6 && bc['Below Average'] === 1, JSON.stringify(bc))
    const rk = by(d.competency_rankings, 'competency')
    check('hindawi: Drives for Results 4.49 Promising at rank 1, AT its 90th marker (4.52)', rk['Drives for Results']?.total === 4.49 && rk['Drives for Results']?.rank === 1 && rk['Drives for Results']?.band === 'Promising Profound Strength' && rk['Drives for Results']?.vs_90th === 'at')
    check('hindawi: Technical Acumen 4.29 Above Average ranks below Develops Others 4.16 Promising', rk['Technical and Professional Acumen']?.band === 'Above Average' && rk['Technical and Professional Acumen']?.rank === 13 && rk['Develops Others']?.rank === 12)
    check('hindawi: Takes Risks 3.89 Below Average, last', rk['Takes Risks']?.total === 3.89 && rk['Takes Risks']?.band === 'Below Average' && rk['Takes Risks']?.rank === 19)
    const imp = by(d.importance, 'competency')
    check('hindawi: Technical Acumen votes 8 = 1/5/2/0/0, NOT a passion', imp['Technical and Professional Acumen']?.total_votes === 8 && imp['Technical and Professional Acumen']?.manager === 1 && imp['Technical and Professional Acumen']?.peers === 5 && imp['Technical and Professional Acumen']?.direct_reports === 2 && !imp['Technical and Professional Acumen']?.is_passion, JSON.stringify(imp['Technical and Professional Acumen']))
    check('hindawi: Makes Decisions votes 4 = 0/0/3/0/1, passion', imp['Makes Decisions']?.total_votes === 4 && imp['Makes Decisions']?.direct_reports === 3 && imp['Makes Decisions']?.self === 1 && imp['Makes Decisions']?.is_passion)
    check('hindawi: eight direct reports cast sixteen votes; no Others column votes', d.importance.reduce((n, i) => n + i.direct_reports, 0) === 16 && d.importance.every((i) => i.others === 0))
    check('hindawi: six passions', d.importance.filter((i) => i.is_passion).length === 6)
    check('hindawi: NO marked self-gap — Integrity +0.47 is coloured irrelevant', d.gap_analysis.every((g) => g.direction === 'irrelevant') && near(by(d.gap_analysis, 'competency')['Displays High Integrity and Honesty']?.gap, 0.47))
    const lb = by(d.lowest_behaviors, 'item_number')
    check('hindawi: lowest item 29 = 3.67 · 4.00/3.50/3.75/–/4.00', lb[29] && lb[29].total === 3.67 && lb[29].manager === 4 && lb[29].peers === 3.5 && lb[29].direct_reports === 3.75 && lb[29].others === null && lb[29].self === 4, JSON.stringify(lb[29]))
    const det = by(d.competency_details, 'competency')['Displays High Integrity and Honesty']
    const dg = det ? by(det.by_rater_group, 'group') : {}
    check('hindawi: Integrity details 4.47 · M4.00 P4.39 DR4.58 S4.00', det && det.total === 4.47 && dg.Manager?.score === 4 && dg.Peers?.score === 4.39 && dg['Direct Reports']?.score === 4.58, JSON.stringify(det && det.by_rater_group))
    const item2 = det && det.items.find((i) => i.item_number === 2)
    check('hindawi: details item 2 total 4.53 n=15, DR 4.75 n=8', item2 && item2.total === 4.53 && item2.n === 15 && by(item2.by_rater_group, 'group')['Direct Reports']?.score === 4.75, JSON.stringify(item2))
    const ra = d.reassessment
    check('hindawi: reassessment block present', !!ra)
    if (ra) {
      const pr = ra.previous_rater_counts
      check('hindawi: previous raters M1 P2 DR5 O8 S1 → reported P10 (Others folded again)', pr?.peers === 2 && pr?.direct_reports === 5 && pr?.others === 8 && pr?.reported_as?.peers === 10 && ra.rater_sets_differ === true, JSON.stringify(pr))
      check('hindawi: previous overall 3.92 · M4.72 P3.81 DR3.76 S4.67', ra.overall_previous?.total === 3.92 && by(ra.overall_previous.by_rater_group, 'group').Manager?.score === 4.72 && by(ra.overall_previous.by_rater_group, 'group')['Direct Reports']?.score === 3.76, JSON.stringify(ra.overall_previous))
      check('hindawi: previous engagement 4.53', ra.engagement_previous_total === 4.53)
      const rb = by(ra.by_competency, 'competency')
      check('hindawi: Learning Agility +0.53 first, meaningful positive', ra.by_competency[0].competency === 'Learning Agility' && near(rb['Learning Agility'].gap, 0.53) && rb['Learning Agility'].direction === 'positive')
      check('hindawi: the three +0.30 rows (Communicates, Innovates, Builds Relationships) coloured POSITIVE', ['Communicates Powerfully and Prolifically', 'Innovates', 'Builds Relationships'].every((c) => near(rb[c]?.gap, 0.3) && rb[c]?.direction === 'positive'))
      check('hindawi: Collaboration +0.26 irrelevant', rb['Collaboration and Teamwork']?.direction === 'irrelevant' && near(rb['Collaboration and Teamwork']?.gap, 0.26))
      check('hindawi: ten positives, nine irrelevant, no negatives', ra.by_competency.filter((r) => r.direction === 'positive').length === 10 && ra.by_competency.filter((r) => r.direction === 'irrelevant').length === 9)
      check('hindawi: every reassessment row consistent with the rankings', ra.by_competency.every((r) => near(r.current_total - r.previous_total, r.gap) && rk[r.competency]?.total === r.current_total))
    }
  }

  console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ''}`)
  process.exit(failures ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
