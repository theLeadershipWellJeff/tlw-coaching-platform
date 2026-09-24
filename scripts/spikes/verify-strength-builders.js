#!/usr/bin/env node
/**
 * Strength Builders + the compact 360 rendering — pure checks, no API key.
 *
 *   node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json && node scripts/spikes/verify-strength-builders.js
 *
 * (a) the transcribed guide: 19 competencies, the builder count per competency
 *     matches the report's diagrams (96 in all), every builder has a rationale
 *     and ≥ 2 development ideas, every competency has linear suggestions;
 * (b) the index and the per-competency rendering, and their token sizes;
 * (c) the compact 360 rendering on the frozen golden fixtures: every number
 *     the report prints is present (rankings, norms, votes, gaps, behaviors,
 *     item scores, reassessment rows), it is a quarter the size of the JSON
 *     dump and inside the snapshot budget together with the builders;
 * (d) the prompt assembles with the index in the prefix and the candidate
 *     entries in the snapshot, and nothing coach-private appears.
 */
const path = require('path')
const fs = require('fs')
const ROOT = path.resolve(__dirname, '..', '..')
const B = path.join(ROOT, '.spike-build')
const sb = require(path.join(B, 'lib/documents/assessment-360/strength-builders.js'))
const render = require(path.join(B, 'lib/portal/assessment-render.js'))
const prompt = require(path.join(B, 'lib/portal/prompt.js'))
const budget = require(path.join(B, 'lib/ai/context-budget.js'))
const models = require(path.join(B, 'lib/ai/models.js'))
const rgm = require(path.join(B, 'lib/documents/assessment-360/report-guide.js'))

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) pass++
  else fail++
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${ok || detail == null ? '' : ` — ${detail}`}`)
}
const MODEL = 'claude-opus-5'
const tokens = (s) => models.estimateTokens(s.length, MODEL)

// ------------------------------------------------------------------ (a) guide
console.log('[a] the transcribed guide')
const g = sb.STRENGTH_BUILDER_GUIDE
const EXPECTED = {
  'Displays High Integrity and Honesty': 5, 'Technical and Professional Acumen': 6, 'Solves Problems and Analyzes Issues': 5, Innovates: 5, 'Learning Agility': 4,
  'Drives for Results': 6, 'Establishes Stretch Goals': 4, 'Takes Initiative': 6, 'Makes Decisions': 4, 'Takes Risks': 5,
  'Communicates Powerfully and Prolifically': 5, 'Inspires and Motivates Others to High Performance': 6, 'Builds Relationships': 6, 'Develops Others': 5, 'Collaboration and Teamwork': 4, 'Values Diversity': 5,
  'Develops Strategic Perspective': 5, 'Champions Change': 5, 'Customer and External Focus': 5,
}
check('19 competencies', g.competencies.length === 19, String(g.competencies.length))
check('every expected competency present once', Object.keys(EXPECTED).every((k) => g.competencies.filter((c) => c.competency === k).length === 1))
check('builder counts match the report diagrams (96)', g.competencies.every((c) => c.strength_builders.length === EXPECTED[c.competency]) && g.competencies.reduce((n, c) => n + c.strength_builders.length, 0) === 96)
check('every builder has a rationale and ≥ 2 ideas', g.competencies.every((c) => c.strength_builders.every((b) => b.rationale.length > 40 && b.ideas.length >= 2)))
check('every competency has a definition and linear suggestions', g.competencies.every((c) => c.definition.length > 30 && c.linear_development_suggestions.length >= 4))
check('five tent poles, in report order', [...new Set(g.competencies.map((c) => c.tent_pole))].join('|') === 'Character|Personal Capability|Focus on Results|Interpersonal Skills|Leading Change')
check('no PDF glyph artefacts left', !JSON.stringify(g).includes('\uf0a7') && !/\bkathy\b|C\.k\.|TAkES|MAkES/.test(JSON.stringify(g)))
check('intro (3 paragraphs) + how-to-use (5 steps)', g.intro.length === 3 && g.how_to_use.length === 5)
const rg = rgm.REPORT_GUIDE
check('reading guide: seven insights, complete explore steps (8), Big Picture last', rg.insights.items.length === 7 && rg.explore.complete && rg.explore.steps.length === 8 && rg.explore.steps[7].title === 'Big Picture')
const rgt = rgm.reportGuideText()
check('reading guide text carries every insight title and every question', rg.insights.items.every((i) => rgt.includes(i.title)) && rg.explore.steps.every((s) => s.questions.every((q) => rgt.includes(q))))
check('reading guide ≤ 1,800 tokens', tokens(rgt) <= 1800, `${tokens(rgt)}`)

// -------------------------------------------------------------- (b) renderers
console.log('\n[b] index + entries')
const index = sb.strengthBuilderIndexText()
check('index names every competency with its builders', g.competencies.every((c) => index.includes(`- ${c.competency} [${c.tent_pole}]: ${c.strength_builders.map((b) => b.name).join(' · ')}`)))
check('index ≤ 1,800 tokens', tokens(index) <= 1800, `${tokens(index)} tokens`)
check('lookup is case/punctuation-insensitive + short name', sb.strengthBuildersFor('DISPLAYS HIGH INTEGRITY AND HONESTY.')?.competency === 'Displays High Integrity and Honesty' && sb.strengthBuildersFor('Inspires and Motivates Others')?.strength_builders.length === 6)
check('unknown competency → null / []', sb.strengthBuildersFor('Juggling') === null && sb.strengthBuilderNames('Juggling').length === 0)
const one = sb.renderStrengthBuilders(['Drives for Results'])
check('entry carries definition, every builder, ideas and linear suggestions', one.includes('## Drives for Results (Focus on Results)') && one.includes('Definition:') && g.competencies.find((c) => c.competency === 'Drives for Results').strength_builders.every((b) => one.includes(`- ${b.name} — `) && b.ideas.every((i) => one.includes(i))) && one.includes('Linear development suggestions'))
const three = sb.renderStrengthBuilders(['Drives for Results', 'Learning Agility', 'Collaboration and Teamwork', 'Drives for Results'])
check('three entries, duplicates collapsed, unknown skipped', (three.match(/^## /gm) || []).length === 3 && sb.renderStrengthBuilders(['Nope']) === '')
check('three full entries ≤ 5,500 tokens', tokens(three) <= 5500, `${tokens(three)} tokens`)
const perEntry = g.competencies.map((c) => tokens(sb.renderStrengthBuilders([c.competency])))
check('largest single entry ≤ 2,100 tokens', Math.max(...perEntry) <= 2100, `max ${Math.max(...perEntry)}`)

// ---------------------------------------------------------- (c) compact 360
console.log('\n[c] compact 360 rendering on the golden fixtures')
const fixtures = ['johnson-360', 'koudsi-360', 'hindawi-360'].map((n) => path.join(ROOT, 'fixtures/zf-360', `${n}.json`)).filter((p) => fs.existsSync(p))
check('golden fixtures on disk', fixtures.length === 3, `${fixtures.length} found`)
for (const f of fixtures) {
  const data = JSON.parse(fs.readFileSync(f, 'utf8')).data
  const name = path.basename(f, '.json')
  const text = render.renderAssessmentCompact(data)
  const { verbatims: _v, extraction_notes: _n, ...rest } = data
  const jsonTokens = tokens(JSON.stringify(rest))
  const t = tokens(text)
  console.log(`  ${name}: compact ${t} tokens vs JSON ${jsonTokens} (${Math.round((100 * t) / jsonTokens)}%)`)
  check(`${name}: compact ≤ 55% of the JSON and ≤ 7,500 tokens`, t <= 0.55 * jsonTokens && t <= 7500, `${t}`)
  const num = (n) => n.toFixed(2)
  check(`${name}: every ranking row with band, both norms and votes`, data.competency_rankings.every((r) => {
    const imp = data.importance.find((i) => i.competency === r.competency)
    return text.includes(`${r.rank}. ${r.competency} ${num(r.total)} — ${r.band} (75th ${num(r.norm_75th)}, 90th ${num(r.norm_90th)}`) && (!imp || text.includes(`votes ${imp.total_votes} (${imp.manager}/${imp.peers}/${imp.direct_reports}/${imp.others}/${imp.self})`))
  }))
  check(`${name}: passions marked ●`, data.importance.filter((i) => i.is_passion).every((i) => new RegExp(`${i.competency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} [^\\n]*votes ${i.total_votes} \\([0-9/]+\\) ●`).test(text)))
  check(`${name}: overall by group with norms`, data.overall_effectiveness.by_rater_group.every((gr) => text.includes(`${gr.group} ${num(gr.score)} (${gr.vs_75th} the 75th ${num(gr.norm_75th)}; ${gr.vs_90th} the 90th ${num(gr.norm_90th)})`)))
  check(`${name}: tent poles with band and norms`, data.tent_poles.every((p) => text.includes(`${p.name} ${num(p.score)} — ${p.band} (75th ${num(p.norm_75th)}, 90th ${num(p.norm_90th)})`)))
  check(`${name}: engagement line`, data.engagement.available ? text.includes(`EMPLOYEE ENGAGEMENT (the six engagement items): ${num(data.engagement.total)} — ${data.engagement.band}`) : text.includes('not reported in this report'))
  check(`${name}: highest + lowest behaviors with group scores`, [...data.highest_behaviors, ...data.lowest_behaviors].every((b) => text.includes(`#${b.item_number} "`) && text.includes(`${num(b.total)} (${[b.manager, b.peers, b.direct_reports, b.others, b.self].map((v) => (v == null ? '—' : num(v))).join('/')}) — ${b.competency}`)))
  check(`${name}: every gap row (self + signed gap)`, data.gap_analysis.every((gp) => text.includes(`self ${num(gp.self)} · gap ${gp.gap > 0 ? '+' : gp.gap < 0 ? '−' : ''}${num(Math.abs(gp.gap))}`)))
  check(`${name}: marked gaps listed with direction`, data.gap_analysis.filter((gp) => gp.direction === 'positive' || gp.direction === 'negative').every((gp) => text.includes(`${gp.competency} — others ${num(gp.total)}, self ${num(gp.self)}, gap`)))
  const items = data.competency_details.reduce((n, d) => n + d.items.length, 0)
  check(`${name}: all ${items} behavior items with totals`, data.competency_details.every((d) => d.items.every((it) => text.includes(`  #${it.item_number} "`) && (it.total == null || text.includes(`" ${num(it.total)} (`)))))
  check(`${name}: three-circle candidates with manager votes and 75th position`, data.development_candidates.filter((c) => c.circles_met >= 2).slice(0, 3).every((c) => text.includes(`${c.competency} ${num(c.total)} — ${c.band}; ${num(c.distance_to_90th)} below its 90th mark;`) && text.includes(`votes ${c.total_votes} (manager ${c.manager_votes})`)))
  if (data.reassessment) {
    check(`${name}: reassessment rows current / previous / gap with the report's colour`, data.reassessment.by_competency.every((r) => text.includes(`- ${r.competency}: ${num(r.current_total)} / ${num(r.previous_total)} / `)) && text.includes('previous raters:') && text.includes('rating windows:'))
    check(`${name}: an irrelevant reassessment gap reads not meaningful, never improvement`, data.reassessment.by_competency.filter((r) => r.direction === 'irrelevant').every((r) => new RegExp(`- ${r.competency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: [^\\n]*not meaningful`).test(text)))
  } else {
    check(`${name}: no reassessment section on an initial report`, !text.includes('REASSESSMENT —'))
  }
  check(`${name}: rater-count line`, text.includes(`Manager ${data.rater_counts.manager ?? '—'} · Peers ${data.rater_counts.peers ?? '—'} · Direct Reports ${data.rater_counts.direct_reports ?? '—'}`))
  const cands = prompt.candidateCompetencies(data)
  const builders = sb.renderStrengthBuilders(cands)
  const snapshotTokens = tokens(text) + tokens(builders)
  check(`${name}: candidates (${cands.join(', ')}) → entries in the guide`, cands.length >= 1 && cands.length <= 3 && cands.every((c) => sb.strengthBuildersFor(c)))
  check(`${name}: compact 360 + builder entries ≤ 90% of the snapshot budget`, snapshotTokens <= 0.9 * budget.CONTEXT_BUDGET.SNAPSHOT, `${snapshotTokens} of ${budget.CONTEXT_BUDGET.SNAPSHOT}`)
}

// ------------------------------------------------------------- (d) the prompt
console.log('\n[d] prompt assembly')
if (fixtures.length) {
  const data = JSON.parse(fs.readFileSync(fixtures[0], 'utf8')).data
  const parts = prompt.composeChatSystemParts({
    clientName: 'Test Person', hasCoach: false, brief: { slug: 'assessment_360', version: 3, body: 'BRIEF MARKER' }, company: null,
    assessment: { data, assessmentCount: 1 }, goals: [], noteParts: [], recentParts: [], retrievedParts: [],
  })
  check('index in the prefix, after the brief', parts.prefix.indexOf('STRENGTH BUILDERS (Zenger Folkman') > parts.prefix.indexOf('BRIEF MARKER'))
  check('reading guide in the prefix, between the brief and the index', parts.prefix.indexOf('HOW THE REPORT ASKS TO BE READ') > parts.prefix.indexOf('BRIEF MARKER') && parts.prefix.indexOf('HOW THE REPORT ASKS TO BE READ') < parts.prefix.indexOf('STRENGTH BUILDERS (Zenger Folkman'))
  check('no per-client entries in the prefix', !parts.prefix.includes('STRENGTH BUILDERS FOR THE COMPETENCIES'))
  check('compact 360 then verbatims, builder entries LAST in the snapshot', parts.snapshot.indexOf('STRUCTURED DATA') < parts.snapshot.indexOf('VERBATIM RATER COMMENTS') && parts.snapshot.endsWith(parts.snapshot.slice(parts.snapshot.indexOf('STRENGTH BUILDERS FOR THE COMPETENCIES'))) && parts.snapshot.indexOf('STRENGTH BUILDERS FOR THE COMPETENCIES') > parts.snapshot.indexOf('VERBATIM RATER COMMENTS'))
  check('snapshot is not raw JSON', !parts.snapshot.includes('"competency_rankings"') && !parts.snapshot.includes('"norm_90th"'))
  check('prefix ≤ SYSTEM budget without a real brief', tokens(parts.prefix) <= budget.CONTEXT_BUDGET.SYSTEM, `${tokens(parts.prefix)}`)
  check('snapshot inside the SNAPSHOT budget', tokens(parts.snapshot) <= budget.CONTEXT_BUDGET.SNAPSHOT, `${tokens(parts.snapshot)} of ${budget.CONTEXT_BUDGET.SNAPSHOT}`)
  check('weighting / "closest to green" never in the snapshot', !/closest to green|weighted_importance|weighted_score/.test(parts.snapshot))
  const plan = prompt.summariseAssessmentForPlanning(data)
  check('weekly-plan summary names the builders around a full-overlap candidate', data.development_candidates.some((c) => c.circles_met === 3) ? /Strength Builders around it/.test(plan) : true)
  const noReport = prompt.composeChatSystemParts({ clientName: 'Plain Client', hasCoach: true, brief: null, company: null, assessment: null, goals: [], noteParts: [], recentParts: [], retrievedParts: [] })
  check('no 360 → no strength-builder material anywhere', !/STRENGTH BUILDERS|HOW THE REPORT ASKS TO BE READ/.test(noReport.prefix + noReport.snapshot))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
