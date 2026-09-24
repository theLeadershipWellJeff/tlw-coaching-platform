/**
 * A3 — freeze a hand-verified extraction as a golden fixture
 * (fixtures/zf-360/<name>.json). Future parser changes are diffed against it by
 * validate-extraction --golden. Comment text is hashed (rater comments never
 * enter git); every number, band, norm and vote is verbatim.
 *
 *   node .spike-build/scripts/validation/freeze-golden.js <pdf ...> [--force]
 *
 * Refuses to overwrite an existing fixture without --force: fix the parser,
 * never the fixture — re-freeze only after a hand-verified extraction changes
 * for a reason you can name in the commit.
 */
import * as fs from 'fs'
import * as path from 'path'
import { baseName, ensureDir, GOLDEN_DIR, initials, listReportPdfs, loadReport, sha256, toGolden, today } from './shared'

;(async () => {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const pdfs = listReportPdfs(args)
  if (!pdfs.length) { console.error('Give at least one PDF.'); process.exit(2) }
  ensureDir(GOLDEN_DIR)
  for (const pdf of pdfs) {
    const name = baseName(pdf)
    const target = path.join(GOLDEN_DIR, `${name}.json`)
    if (fs.existsSync(target) && !force) { console.log(`skip ${name}: fixture exists (use --force to re-freeze)`); continue }
    const { bytes, out } = await loadReport(pdf)
    if (out.status !== 'complete') { console.log(`✗ ${name}: extraction ${out.status} — not frozen`); process.exitCode = 1; continue }
    const fixture = {
      _frozen: {
        on: today(),
        source_pdf_sha256: sha256(Buffer.from(bytes)),
        participant: initials(out.data.participant_name),
        format_version: out.formatVersion,
        warnings: out.warnings,
        calibration: out.calibration,
        rater_names_invited: out.raterNames.length,
        note: 'verbatims are sha256 prefixes of each comment; all numbers, bands, norms and votes are verbatim. Fix the parser, never this file.',
      },
      data: toGolden(out.data),
    }
    fs.writeFileSync(target, JSON.stringify(fixture, null, 1) + '\n')
    console.log(`✓ froze ${name} → ${path.relative(process.cwd(), target)}`)
  }
})().catch((e) => { console.error(e); process.exit(1) })
