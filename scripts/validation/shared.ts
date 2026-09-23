/**
 * Shared helpers for the ZF 360 validation harness (VALIDATION_PROTOCOL, 2026-09-23).
 *
 * Compile with the spike tsconfig and run the emitted JS:
 *   node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json
 *   node .spike-build/scripts/validation/<script>.js [args]
 *
 * Nothing here is deployed. Reports live in fixtures/private (gitignored).
 */
import * as fs from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import { rowsOf, type PageData } from '../../lib/documents/geometry'
import { extractAssessment360, readAllPages, type ExtractionOutcome } from '../../lib/documents/assessment-360/index'
import type { Assessment360Data } from '../../lib/documents/assessment-360/types'

export const ROOT = path.resolve(__dirname, '../../..')
export const PRIVATE_DIR = path.join(ROOT, 'fixtures/private')
export const GOLDEN_DIR = path.join(ROOT, 'fixtures/zf-360')
export const RESULTS_DIR = path.join(ROOT, 'validation/results')
export const SHEETS_DIR = path.join(ROOT, 'validation/sheets')

export type Complete = Extract<ExtractionOutcome, { status: 'complete' }>

export function listReportPdfs(args: string[]): string[] {
  const given = args.filter((a) => /\.pdf$/i.test(a))
  if (given.length) return given.map((a) => path.resolve(a))
  if (!fs.existsSync(PRIVATE_DIR)) return []
  return fs
    .readdirSync(PRIVATE_DIR)
    .filter((f) => /\.pdf$/i.test(f))
    .sort()
    .map((f) => path.join(PRIVATE_DIR, f))
}

export const baseName = (pdf: string) => path.basename(pdf).replace(/\.pdf$/i, '')

export function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex')
}

/** "Jim Johnson" → "J.J." — the only form a participant's name takes in committed output. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t[0].toUpperCase() + '.')
    .join('')
}

export async function loadReport(pdf: string): Promise<{ bytes: Uint8Array; pages: PageData[]; out: ExtractionOutcome }> {
  const bytes = new Uint8Array(fs.readFileSync(pdf))
  const pages = await readAllPages(bytes)
  const out = await extractAssessment360(bytes)
  return { bytes, pages, out }
}

/** Printed page number of the first page whose title row matches. */
export function pageOf(pages: PageData[], re: RegExp): number | null {
  for (const p of pages) {
    const rows = rowsOf(p.text)
    const head = rows.slice(0, 3).map((r) => r.text).join(' ')
    if (re.test(head)) return p.pageNumber
  }
  // A section can start mid-page (Employee Engagement shares the Overall page
  // on the initial layout): accept a row that is exactly the section title.
  for (const p of pages) {
    if (rowsOf(p.text).some((r) => re.test(r.text) && r.text.trim().length < 60)) return p.pageNumber
  }
  return null
}

export const SECTION_PAGES: Array<[string, RegExp]> = [
  ['counts', /How Is Rater Feedback Reported|How is Rater Feedback Reported/i],
  ['overall', /Overall Leadership Effectiveness/],
  ['engagement', /Employee Engagement/],
  ['tent', /Leadership Tent/],
  ['rankings', /Differentiating Competency Rankings/],
  ['reassessment', /Reassessment vs Previous Assessment Results/],
  ['highest', /Highest Scored Behaviors/],
  ['lowest', /Lowest Scored Behaviors/],
  ['importance', /Importance Ratings and Leadership Passions/],
  ['gap', /Differentiating Competency Gap Analysis/],
  ['details', /Differentiating Competency Score Details/],
]

export function sectionPages(pages: PageData[]): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const [k, re] of SECTION_PAGES) out[k] = pageOf(pages, re)
  return out
}

/** The golden-fixture form of a report: verbatims hashed (comment text never committed), everything else verbatim. */
export function toGolden(data: Assessment360Data): Record<string, unknown> {
  const hashGroups = (g: Record<string, string[] | undefined>) =>
    Object.fromEntries(Object.entries(g).map(([k, list]) => [k, (list || []).map((s) => sha256(s.trim()).slice(0, 16))]))
  return {
    ...data,
    verbatims: {
      strengths: hashGroups(data.verbatims.strengths),
      organizational_needs: hashGroups(data.verbatims.organizational_needs),
      potential_fatal_flaws: hashGroups(data.verbatims.potential_fatal_flaws),
    },
  }
}

/** Deep diff of two JSON values → list of dotted paths that differ (max 200). */
export function diffJson(a: unknown, b: unknown, prefix = '', out: string[] = []): string[] {
  if (out.length >= 200) return out
  if (a === b) return out
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    out.push(`${prefix || '(root)'}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`)
    return out
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    out.push(`${prefix}: array/object mismatch`)
    return out
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const keys = Array.from(new Set([...Object.keys(ao), ...Object.keys(bo)]))
  for (const k of keys) diffJson(ao[k], bo[k], prefix ? `${prefix}.${k}` : k, out)
  return out
}

export function ensureDir(d: string) {
  fs.mkdirSync(d, { recursive: true })
}

export const today = () => new Date().toISOString().slice(0, 10)
export const r2 = (v: number) => Math.round(v * 100) / 100
export const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol + 1e-9

/** Markdown table helper. */
export function mdTable(header: string[], rows: string[][]): string {
  const esc = (s: string) => s.replace(/\|/g, '\\|')
  return [`| ${header.map(esc).join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n')
}
