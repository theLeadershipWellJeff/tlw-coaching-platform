// Phase 5: verify extraction on EVERY real report before go-live, without
// touching the database. Point it at a folder of PDFs (kept out of git):
//
//   node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json && \
//   node scripts/spikes/verify-batch-360.js fixtures/private/cohort-x/
//
// Per file: status, participant name, report date, rater counts, competency
// count, band spread, the two integrity checks that matter most (band order not
// by score somewhere; rater names absent from stored data), and the top three
// development candidates. Prints a summary table and exits non-zero if any
// report is not `complete`. Names printed here are participant names only —
// rater names are never printed.
const fs = require('fs')
const path = require('path')

const build = path.resolve(__dirname, '../../.spike-build/lib/documents/assessment-360')
const { extractAssessment360 } = require(path.join(build, 'index.js'))

const dir = process.argv[2]
if (!dir || !fs.existsSync(dir)) {
  console.error('Usage: node scripts/spikes/verify-batch-360.js <folder-of-pdfs>')
  process.exit(2)
}
const files = fs.readdirSync(dir).filter((f) => /\.pdf$/i.test(f)).sort()
if (!files.length) {
  console.error('No PDFs in', dir)
  process.exit(2)
}

const BAND_ORDER = ['Potential Fatal Flaw', 'Below Average', 'Above Average', 'Promising Profound Strength', 'Profound Strength']

;(async () => {
  const rows = []
  let bad = 0
  for (const f of files) {
    const t0 = Date.now()
    const out = await extractAssessment360(new Uint8Array(fs.readFileSync(path.join(dir, f))))
    const ms = Date.now() - t0
    if (out.status !== 'complete') {
      bad++
      rows.push({ file: f, status: out.status, detail: out.error?.slice(0, 120), ms })
      continue
    }
    const d = out.data
    const bySc = [...d.competency_rankings].sort((a, b) => b.total - a.total)
    const inversion = bySc.some((c, i) => i > 0 && BAND_ORDER.indexOf(bySc[i - 1].band) < BAND_ORDER.indexOf(c.band))
    const payload = (JSON.stringify(d) + out.extractedText).toLowerCase()
    const namesLeak = out.raterNames.some((n) => n.trim().length >= 5 && payload.includes(n.toLowerCase()))
    const bands = {}
    for (const c of d.competency_rankings) bands[c.band] = (bands[c.band] || 0) + 1
    const rc = d.rater_counts
    rows.push({
      file: f,
      status: 'complete',
      ms,
      participant: d.participant_name,
      date: d.assessment_date || d.report_date,
      raters: `M${rc.manager ?? '?'} P${rc.peers ?? '?'} DR${rc.direct_reports ?? '?'} O${rc.others ?? '?'} S${rc.self ?? '?'}`,
      competencies: d.competency_rankings.length,
      bands: Object.entries(bands).map(([b, n]) => `${b.split(' ')[0]}:${n}`).join(' '),
      engagement: d.engagement.available ? 'yes' : 'absent',
      inversion: inversion ? 'yes' : 'no',
      namesLeak: namesLeak ? 'LEAK' : 'clean',
      warnings: out.warnings.length,
      top3: d.development_candidates.slice(0, 3).map((c) => c.competency).join(' | '),
    })
    if (namesLeak) bad++
  }
  for (const r of rows) {
    if (r.status !== 'complete') {
      console.log(`✗ ${r.file}\n    ${r.status}: ${r.detail} (${r.ms} ms)`)
      continue
    }
    console.log(`✓ ${r.file}  (${r.ms} ms)`)
    console.log(`    ${r.participant} · ${r.date} · raters ${r.raters} · ${r.competencies} competencies · engagement ${r.engagement}`)
    console.log(`    bands ${r.bands} · band-vs-score inversion present: ${r.inversion} · rater names: ${r.namesLeak} · warnings: ${r.warnings}`)
    console.log(`    development candidates: ${r.top3}`)
  }
  const ok = rows.filter((r) => r.status === 'complete').length
  console.log(`\n${ok}/${rows.length} reports extracted cleanly${bad ? ` — ${bad} need attention` : ''}`)
  process.exit(bad ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
