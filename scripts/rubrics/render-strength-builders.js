#!/usr/bin/env node
/**
 * Render rubrics/05_zf360_strength_builders_reference.md from
 * lib/documents/assessment-360/strength-builders.json — the human-readable
 * copy of the Strength Builder guide the assistant carries as data.
 *
 *   node scripts/rubrics/render-strength-builders.js          # write
 *   node scripts/rubrics/render-strength-builders.js --check  # verify in sync (exit 1 if not)
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const SRC = path.join(ROOT, 'lib/documents/assessment-360/strength-builders.json')
const GUIDE = path.join(ROOT, 'lib/documents/assessment-360/report-guide.json')
const OUT = path.join(ROOT, 'rubrics/05_zf360_strength_builders_reference.md')

const g = JSON.parse(fs.readFileSync(SRC, 'utf8'))
const rg = JSON.parse(fs.readFileSync(GUIDE, 'utf8'))

const lines = []
lines.push('# 05 · ZF 360 vendor reference — reading guide + Strength Builders (rendered from data)')
lines.push('')
lines.push('**Status:** reference, not a rubric. Rendered from `lib/documents/assessment-360/report-guide.json` + `strength-builders.json` by `scripts/rubrics/render-strength-builders.js` — edit the JSON, never this file (`--check` verifies they agree).')
lines.push('')
lines.push(`**Source:** ${g.source}`)
lines.push('')
lines.push(`**Transcription note:** ${g.transcription_note}`)
lines.push('')
lines.push('**How the assistant carries it:** the index (competency → builder names) rides in the cached system prefix of every 360 conversation (`strengthBuilderIndexText`); the full entries below ride in the per-client snapshot only for the competencies that participant\'s report points at (the three-circle candidates, `renderStrengthBuilders`); the weekly-plan summary names the builders around each candidate. Rubric 04 §5 says when to offer them: once the participant leans toward a target — ask which builder they have interest and passion for; the development ideas are raw material for a goal they write, never an assignment. Cite as Zenger Folkman\'s.')
lines.push('')
lines.push('## Part 1 — How the report asks to be read (Extraordinary Insights + Explore Your Report)')
lines.push('')
lines.push(`**Source:** ${rg.source}`)
lines.push('')
lines.push(`**Transcription note:** ${rg.transcription_note}`)
lines.push('')
lines.push('**How the assistant carries it:** as prompt text in the cached prefix of every 360 conversation (`reportGuideText`), for "how should I read my report?" — answered in the instrument\'s own words, cited as Zenger Folkman\'s. It does not replace rubric 04\'s reading protocol (§4), which is theLeadershipWell\'s order for a coached walk-through; the vendor\'s steps are what the participant holds in their hands.')
lines.push('')
lines.push('### Seven insights')
lines.push('')
for (const p of rg.insights.intro) lines.push(p, '')
rg.insights.items.forEach((i, n) => { lines.push(`${n + 1}. **${i.title}.** ${i.text}`); lines.push('') })
lines.push('### Explore your report')
lines.push('')
lines.push(rg.explore.intro, '')
for (const s of rg.explore.steps) {
  lines.push(`**${s.title}**${s.section ? ` (section${s.section.includes(',') ? 's' : ''} ${s.section})` : ''}`)
  lines.push('')
  for (const q of s.questions) lines.push(`- ${q}`)
  lines.push('')
}
lines.push('### Decide if you have a Fatal Flaw (the report\'s own four conditions)')
lines.push('')
lines.push(rg.fatal_flaw_test.question, '')
rg.fatal_flaw_test.conditions.forEach((c, n) => lines.push(`${n + 1}. ${c}`))
lines.push('')
lines.push('The assistant pre-checks conditions 1–3 from the extracted data for every competency in the band (`lib/documents/assessment-360/fatal-flaw.ts`, rendered as the FATAL FLAW TEST block of the compact report; "among the most important" = at least one importance vote and within the top six by votes, ties included, since the report prints no cutoff) and reads condition 4 with the participant from the verbatim comments. A competency that fails any condition is not a fatal flaw for this role — theLeadershipWell\'s ruling in rubric 04 §5 and the instrument agree.')
lines.push('')
lines.push('### Select your Development Target (the report\'s own steps 2 and 3)')
lines.push('')
for (const p of rg.development_target.sweet_spot) lines.push(p, '')
lines.push(rg.development_target.novice_option, '')
lines.push(rg.development_target.matrix_note, '')
lines.push(`**${rg.development_target.balance_tent.title}.** ${rg.development_target.balance_tent.text.join(' ')}`, '')
lines.push('How this maps onto theLeadershipWell\'s three-circle model (rubric 04 §5): the vendor\'s **Leadership Sweet Spot** (Competence + Passion + Organizational Need) is the full three-circle overlap where the competency is already a strength — in the platform, a candidate at or above the 75th mark, the ones ranked first; the vendor\'s **Novice** option (Passion + Need, competence still to build) is the same overlap below the 75th — the ones the platform keeps as candidates because the 75th is not a floor. The compact report labels each candidate with its route and adds a TENT BALANCE line (Profound Strengths per pole) so rule 3 can be applied when five or more are on file. "CPO" is the report\'s own name for the matrix page, so a participant may use it; the assistant still explains it once through the three ideas (rubric 04 §7).', '')
lines.push('## Part 2 — Strength Builders')
lines.push('')
lines.push('## What Strength Builders are (the guide\'s own words)')
lines.push('')
for (const p of g.intro) lines.push(p, '')
lines.push('**To use the guide:**')
lines.push('')
g.how_to_use.forEach((s, i) => lines.push(`${i + 1}. ${s}`))
lines.push('')
lines.push('## Index — competency → Strength Builders')
lines.push('')
lines.push('| tent pole | competency | Strength Builders |')
lines.push('|---|---|---|')
for (const c of g.competencies) lines.push(`| ${c.tent_pole} | ${c.competency} | ${c.strength_builders.map((b) => b.name).join(' · ')} |`)
lines.push('')
lines.push('## The 19 competencies')
lines.push('')
let pole = null
for (const c of g.competencies) {
  if (c.tent_pole !== pole) {
    pole = c.tent_pole
    lines.push(`### ${pole}`)
    lines.push('')
  }
  lines.push(`#### ${c.competency}`)
  lines.push('')
  lines.push(`*${c.definition}*`)
  lines.push('')
  lines.push(`Strength Builders: ${c.strength_builders.map((b) => `**${b.name}**`).join(' · ')}`)
  lines.push('')
  for (const b of c.strength_builders) {
    lines.push(`**${b.name}.** ${b.rationale}`)
    lines.push('')
    for (const idea of b.ideas) lines.push(`- ${idea}`)
    lines.push('')
  }
  if (c.linear_development_suggestions.length) {
    lines.push('Linear development suggestions:')
    lines.push('')
    for (const s of c.linear_development_suggestions) lines.push(`- ${s}`)
    lines.push('')
  }
}
const md = lines.join('\n')

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''
  if (cur !== md) {
    console.error(`${path.relative(ROOT, OUT)} is out of date — run node scripts/rubrics/render-strength-builders.js`)
    process.exit(1)
  }
  console.log('strength-builders reference is in sync')
} else {
  fs.writeFileSync(OUT, md)
  console.log(`wrote ${path.relative(ROOT, OUT)} (${g.competencies.length} competencies, ${g.competencies.reduce((n, c) => n + c.strength_builders.length, 0)} builders)`)
}
