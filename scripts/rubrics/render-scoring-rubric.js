// Render the generated sections of rubrics/01_coaching_session_scoring_rubric.md
// (per-competency band definitions + named principles) straight from
// lib/scoring/rubric.ts, so the document the coach reads and the rubric the
// engine scores against can never drift apart.
//
//   node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json   # compiles lib/scoring/*
//   node scripts/rubrics/render-scoring-rubric.js                 # rewrite the sections
//   node scripts/rubrics/render-scoring-rubric.js --check         # exit 1 if out of date
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const MD = path.join(ROOT, 'rubrics', '01_coaching_session_scoring_rubric.md')
const rubric = require(path.join(ROOT, '.spike-build', 'lib', 'scoring', 'rubric.js'))

function renderBands() {
  const out = []
  for (const c of rubric.COMPETENCIES) {
    const bands = rubric.COMPETENCY_BANDS[c.id] || {}
    out.push(`### Competency ${c.id} — ${c.name}`)
    out.push('')
    out.push(`*Domain: ${c.domain}*`)
    out.push('')
    out.push('| score | band | definition |')
    out.push('|---:|---|---|')
    rubric.BAND_ORDER.forEach((b, i) => {
      const text = bands[b] || `_(general scale)_ ${rubric.BAND_DESCRIPTIONS[b]}`
      out.push(`| ${i + 1} | ${b} | ${text.replace(/\|/g, '\\|')} |`)
    })
    out.push('')
  }
  return out.join('\n').trimEnd()
}

function renderPrinciples() {
  return rubric.CROSS_COMPETENCY_PRINCIPLES.map((p) => `- **${p.name}.** ${p.text}`).join('\n')
}

function replaceSection(md, name, body) {
  const begin = `<!-- BEGIN GENERATED: ${name} -->`
  const end = `<!-- END GENERATED: ${name} -->`
  const a = md.indexOf(begin)
  const b = md.indexOf(end)
  if (a < 0 || b < 0 || b < a) throw new Error(`markers for "${name}" not found in ${MD}`)
  return md.slice(0, a + begin.length) + '\n' + body + '\n' + md.slice(b)
}

const current = fs.readFileSync(MD, 'utf8')
let next = replaceSection(current, 'bands', renderBands())
next = replaceSection(next, 'principles', renderPrinciples())

if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error(`${path.relative(ROOT, MD)} is out of date with lib/scoring/rubric.ts — run: node scripts/rubrics/render-scoring-rubric.js`)
    process.exit(1)
  }
  console.log('render-scoring-rubric: document matches lib/scoring/rubric.ts')
} else {
  fs.writeFileSync(MD, next)
  console.log(`render-scoring-rubric: wrote ${path.relative(ROOT, MD)}`)
}
