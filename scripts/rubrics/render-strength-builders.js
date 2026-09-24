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
const OUT = path.join(ROOT, 'rubrics/05_zf360_strength_builders_reference.md')

const g = JSON.parse(fs.readFileSync(SRC, 'utf8'))

const lines = []
lines.push('# 05 · ZF 360 Strength Builders — reference (vendor material, rendered from data)')
lines.push('')
lines.push('**Status:** reference, not a rubric. Rendered from `lib/documents/assessment-360/strength-builders.json` by `scripts/rubrics/render-strength-builders.js` — edit the JSON, never this file (`--check` verifies they agree).')
lines.push('')
lines.push(`**Source:** ${g.source}`)
lines.push('')
lines.push(`**Transcription note:** ${g.transcription_note}`)
lines.push('')
lines.push('**How the assistant carries it:** the index (competency → builder names) rides in the cached system prefix of every 360 conversation (`strengthBuilderIndexText`); the full entries below ride in the per-client snapshot only for the competencies that participant\'s report points at (the three-circle candidates, `renderStrengthBuilders`); the weekly-plan summary names the builders around each candidate. Rubric 04 §5 says when to offer them: once the participant leans toward a target — ask which builder they have interest and passion for; the development ideas are raw material for a goal they write, never an assignment. Cite as Zenger Folkman\'s.')
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
