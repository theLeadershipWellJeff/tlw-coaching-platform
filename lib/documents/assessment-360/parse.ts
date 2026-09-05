/**
 * 360 report parser — turns per-page geometry + positioned text into the
 * structured shape in ./types.ts.
 *
 * Why positioned text and not the flat text layer: the flat stream emits table
 * columns in a scrambled order with digits glued together ("5.005.005.00"),
 * and verbatim rater-group labels glue onto the end of the previous response
 * ("…value drivenPeers"). Every text item still carries its x/y, and the
 * report's tables are strict columns, so column assignment by x is exact.
 *
 * Every number the AI may quote comes from here. Rules (build prompt §5):
 *  - band = the bar's FILL COLOUR, read against the legend the report prints;
 *    never derived from the score (a higher score can sit in a lower band);
 *  - norms = the amber marker positions on THAT row, converted through a
 *    per-chart calibration fitted against the scores the text layer prints;
 *  - the bar-derived score must agree with the printed score within 0.03 on
 *    every row, or the whole extraction fails loud;
 *  - rater names (the "Your Raters" table) are collected ONLY so the caller
 *    can assert their absence — they never enter the returned data or text.
 */
import { isDecimal, linearFit, rowsOf, type PageData, type Row, type Shape, type TextItem } from '../geometry'
import type {
  Assessment360Data,
  Band,
  BehaviorScore,
  CompetencyDetail,
  CompetencyRanking,
  Engagement,
  GapRow,
  ImportanceRow,
  MarkerRelation,
  OverallEffectiveness,
  RaterCounts,
  RaterGroup,
  RaterGroupScore,
  TentPole,
  VerbatimGroups,
  Verbatims,
} from './types'

export class ParseError extends Error {
  constructor(message: string, public readonly section: string) {
    super(message)
    this.name = 'ParseError'
  }
}

export type ParseOutput = {
  data: Omit<Assessment360Data, 'development_candidates' | 'comparison'>
  /** Third-party PII — for the absence assertion only. Never stored. */
  raterNames: string[]
  /** Report text from the first results page onward; the rater table is never included. */
  extractedText: string
  notes: string[]
}

/** Max allowed disagreement between a bar-derived score and the printed one. */
export const CROSS_CHECK_TOLERANCE = 0.03

const RATER_GROUPS: RaterGroup[] = ['Manager', 'Peers', 'Others', 'Self', 'Direct Reports']
const GROUP_KEY: Record<RaterGroup, keyof VerbatimGroups> = {
  Manager: 'manager',
  Peers: 'peers',
  Others: 'others',
  Self: 'self',
  'Direct Reports': 'direct_reports',
}

const BAND_LABELS: Array<[RegExp, Band]> = [
  [/^Promising Profound Strength/i, 'Promising Profound Strength'],
  [/^Profound Strength/i, 'Profound Strength'],
  [/^Above Average/i, 'Above Average'],
  [/^Below Average/i, 'Below Average'],
  [/^Potential Fatal Flaw/i, 'Potential Fatal Flaw'],
]

/** Fallback colour map (2024 layout) — used only when a page prints no legend. */
const FALLBACK_BAND_COLOURS: Record<string, Band> = {
  '#44bc9b': 'Profound Strength',
  '#41a2e6': 'Promising Profound Strength',
  '#155cac': 'Above Average',
  '#afbecd': 'Below Average',
  '#ffc55e': 'Potential Fatal Flaw',
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const num = (s: string) => Number(s.trim())
const r2 = (v: number) => Math.round(v * 100) / 100
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function titleOf(page: PageData): string {
  return rowsOf(page.text)
    .filter((r) => r.y > 35 && r.y < 62)
    .map((r) => r.text)
    .join(' | ')
}
function findPage(pages: PageData[], re: RegExp): PageData | undefined {
  return pages.find((p) => re.test(titleOf(p)))
}
function findPageIndex(pages: PageData[], re: RegExp): number {
  return pages.findIndex((p) => re.test(titleOf(p)))
}

/** Text rows that sit inside a shape's vertical span (baseline within it). */
function rowInShape(rowY: number, s: Shape, slack = 3): boolean {
  return rowY >= s.top - slack && rowY <= s.bottom + slack
}
/** Shapes whose vertical centre sits within a row's band. */
function shapesAtRow(shapes: Shape[], rowY: number, above = 12, below = 4): Shape[] {
  return shapes.filter((s) => s.cy >= rowY - above && s.cy <= rowY + below)
}
function isMarker(s: Shape): boolean {
  return s.w >= 3 && s.w <= 9 && s.h >= 3 && s.h <= 9
}
function isHorizontalBar(s: Shape): boolean {
  return s.h >= 8 && s.h <= 16 && s.w >= 10
}

function relation(barEnd: number, marker: Shape | undefined): MarkerRelation | null {
  if (!marker) return null
  const half = marker.w / 2
  if (Math.abs(barEnd - marker.cx) <= half) return 'at'
  return barEnd < marker.cx ? 'below' : 'above'
}

/** Column map from a header row: label → x centre. */
function columnsFromHeader(row: Row, labels: string[]): Map<string, number> {
  const cols = new Map<string, number>()
  for (const it of row.items) {
    const label = labels.find((l) => it.str.trim() === l)
    if (label) cols.set(label, it.x + it.w / 2)
  }
  return cols
}
function nearestColumn(cols: Map<string, number>, it: TextItem): string | null {
  let best: string | null = null
  let bestD = Infinity
  const cx = it.x + it.w / 2
  cols.forEach((x, label) => {
    const d = Math.abs(cx - x)
    if (d < bestD) {
      bestD = d
      best = label
    }
  })
  return bestD <= 30 ? best : null
}

function toIsoDate(s: string): string | null {
  const t = Date.parse(s)
  if (Number.isNaN(t)) return null
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Legend on a page: band label rows with a swatch beside them → colour → band. */
function readBandLegend(page: PageData): { map: Record<string, Band>; fromLegend: boolean } {
  const map: Record<string, Band> = {}
  for (const row of rowsOf(page.text)) {
    const band = BAND_LABELS.find(([re]) => re.test(row.text))?.[1]
    if (!band || !/ - /.test(row.text)) continue
    const swatch = page.shapes.find((s) => s.w > 60 && s.h > 10 && s.h < 25 && rowInShape(row.y, s))
    if (swatch) map[swatch.fill] = band
  }
  if (Object.keys(map).length >= 4) return { map, fromLegend: true }
  return { map: { ...FALLBACK_BAND_COLOURS }, fromLegend: false }
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function parseCover(page: PageData): { name: string; date: string } {
  const rows = rowsOf(page.text).map((r) => r.text)
  const date = rows.find((t) => /^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(t)) || ''
  const skip = new Set([date, 'Feedback Report', 'The', 'EXTRAORDINARY', 'LEADER'])
  const name = rows.find((t) => !skip.has(t) && /^[A-Z][\w'.-]+( [A-Z][\w'.-]+)+$/.test(t)) || ''
  if (!name) throw new ParseError('Participant name not found on the cover page.', 'cover')
  return { name, date }
}

function parseCountsLine(line: string): Partial<Record<'manager' | 'peers' | 'direct_reports' | 'others' | 'self', number>> {
  const out: Partial<Record<'manager' | 'peers' | 'direct_reports' | 'others' | 'self', number>> = {}
  const re = /(\d+)\s+(Manager|Peers|Direct Reports|Others|Self)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    const key = m[2].toLowerCase().replace(' ', '_') as keyof typeof out
    out[key] = Number(m[1])
  }
  return out
}

function parseRaterCounts(pages: PageData[]): RaterCounts {
  for (const page of pages) {
    const rows = rowsOf(page.text)
    const i = rows.findIndex((r) => /includes feedback received from/i.test(r.text))
    if (i < 0) continue
    const received = parseCountsLine(rows[i + 1]?.text || '')
    const j = rows.findIndex((r) => /reported as follows/i.test(r.text))
    const reported = j >= 0 ? parseCountsLine(rows[j + 1]?.text || '') : {}
    const differs = Object.keys(reported).length > 0 && JSON.stringify(reported) !== JSON.stringify(received)
    let note: string | null = null
    if (differs) {
      const dr = received.direct_reports ?? 0
      note =
        dr < 3
          ? `Fewer than three Direct Report submissions (${dr} received) — combined into Others; Employee Engagement is not reported.`
          : 'Rater groups were combined for reporting (small-N rule).'
    }
    return {
      manager: received.manager ?? null,
      peers: received.peers ?? null,
      direct_reports: received.direct_reports ?? null,
      others: received.others ?? null,
      self: received.self ?? null,
      ...(differs ? { reported_as: reported } : {}),
      collapsed_note: note,
    }
  }
  throw new ParseError('Rater counts line not found.', 'rater_counts')
}

/** The "Your Raters" table: names only for the absence assertion; also which rows to drop from text. */
function parseRaterNames(pages: PageData[]): { names: string[]; page: number | null; dropRows: (r: Row) => boolean } {
  for (const page of pages) {
    const rows = rowsOf(page.text)
    const h = rows.findIndex((r) => /Rater Type/.test(r.text) && /Rater Name/.test(r.text))
    if (h < 0) continue
    const names: string[] = []
    const dropped = new Set<number>()
    for (let i = h; i < rows.length; i++) {
      const row = rows[i]
      if (/Copyright/i.test(row.text)) break
      dropped.add(row.y)
      if (i === h) continue
      const nameItem = [...row.items].sort((p, q) => q.x - p.x)[0]
      if (nameItem && !RATER_GROUPS.includes(nameItem.str.trim() as RaterGroup)) names.push(nameItem.str.trim())
    }
    return { names, page: page.pageNumber, dropRows: (r) => dropped.has(r.y) }
  }
  return { names: [], page: null, dropRows: () => false }
}

/**
 * Horizontal bar chart calibration: fit bar-end x against the printed score
 * across every row that has both, and require every row to agree within the
 * tolerance. Returns x → score.
 */
function calibrateHorizontal(
  points: Array<{ label: string; x1: number; score: number }>,
  section: string
): (x: number) => number {
  const fit = linearFit(points.map((p) => [p.score, p.x1] as [number, number]))
  if (!fit) throw new ParseError(`Not enough rows to calibrate the ${section} chart.`, section)
  const toScore = (x: number) => (x - fit.a) / fit.b
  for (const p of points) {
    const geo = toScore(p.x1)
    if (Math.abs(geo - p.score) > CROSS_CHECK_TOLERANCE) {
      throw new ParseError(
        `${section}: bar length for "${p.label}" reads ${geo.toFixed(2)} but the text says ${p.score.toFixed(2)} — text and geometry disagree.`,
        section
      )
    }
  }
  return toScore
}

function parseOverall(pages: PageData[], legend: Record<string, Band>): OverallEffectiveness | null {
  const page = findPage(pages, /Overall Leadership Effectiveness/)
  if (!page) return null
  const rows = rowsOf(page.text)
  const engagementAt = rows.find((r) => /^Employee Engagement$/.test(r.text) && r.y > 100)?.y ?? Infinity
  const scoreRows = rows.filter((r) => r.y < engagementAt && r.items.some((i) => isDecimal(i.str)))
  const bars = page.shapes.filter((s) => isHorizontalBar(s) && s.w > 30 && !/^#e3e8ed|^#ffffff/.test(s.fill))

  type RowRead = { label: string; score: number; bar: Shape; markers: Shape[] }
  const reads: RowRead[] = []
  for (const r of scoreRows) {
    const label = r.items.find((i) => !isDecimal(i.str))?.str.trim() || ''
    const score = r.items.find((i) => isDecimal(i.str))
    if (!score) continue
    const bar = bars.find((b) => rowInShape(r.y, b))
    if (!bar) continue
    const markers = page.shapes.filter((s) => isMarker(s) && s.cy >= bar.top - 2 && s.cy <= bar.bottom + 2).sort((p, q) => p.cx - q.cx)
    reads.push({ label, score: num(score.str), bar, markers })
  }
  if (!reads.length) return null
  const toScore = calibrateHorizontal(
    reads.map((x) => ({ label: x.label, x1: x.bar.x1, score: x.score })),
    'overall'
  )
  const total = reads.find((x) => /Total/i.test(x.label))
  if (!total) throw new ParseError('Overall Total Score row not found.', 'overall')
  const m75 = total.markers[0]
  const m90 = total.markers[1]
  const by_rater_group: RaterGroupScore[] = reads
    .filter((x) => RATER_GROUPS.includes(x.label as RaterGroup))
    .map((x) => ({
      group: x.label as RaterGroup,
      score: x.score,
      vs_75th: relation(x.bar.x1, x.markers[0]),
      vs_90th: relation(x.bar.x1, x.markers[1]),
      norm_75th: x.markers[0] ? r2(toScore(x.markers[0].cx)) : null,
      norm_90th: x.markers[1] ? r2(toScore(x.markers[1].cx)) : null,
    }))
  return {
    total: total.score,
    band: legend[total.bar.fill] ?? null,
    norm_75th: m75 ? r2(toScore(m75.cx)) : null,
    norm_90th: m90 ? r2(toScore(m90.cx)) : null,
    by_rater_group,
  }
}

function parseEngagement(pages: PageData[], counts: RaterCounts, legend: Record<string, Band>): Engagement {
  const dr = counts.direct_reports ?? 0
  const page = pages.find((p) => rowsOf(p.text).some((r) => /^Employee Engagement$/.test(r.text) && r.y > 100))
  if (dr < 3 || !page) {
    return {
      available: false,
      reason: `Fewer than three Direct Report submissions (${dr} received), so Employee Engagement is not reported.`,
    }
  }
  const rows = rowsOf(page.text)
  const start = rows.findIndex((r) => /^Employee Engagement$/.test(r.text) && r.y > 100)
  const totalRow = rows.slice(start).find((r) => /Total Score/.test(r.text) && r.items.some((i) => isDecimal(i.str)))
  const total = totalRow ? num(totalRow.items.find((i) => isDecimal(i.str))!.str) : 0
  if (total <= 0) return { available: false, reason: 'Employee Engagement reads 0.00 — not reported for this administration.' }
  const bar = totalRow ? page.shapes.find((s) => isHorizontalBar(s) && s.w > 30 && rowInShape(totalRow.y, s) && legend[s.fill]) : undefined
  return { available: true, total, band: bar ? legend[bar.fill] : null }
}

function parseTentPoles(pages: PageData[], legend: Record<string, Band>, knownCompetencies: string[]): TentPole[] {
  const page = findPage(pages, /Leadership Tent/)
  if (!page) return []
  const rows = rowsOf(page.text)
  const scoreRow = rows.find((r) => r.items.filter((i) => isDecimal(i.str)).length >= 3)
  if (!scoreRow) return []
  const nameRow = rows.find((r) => r.y > scoreRow.y && r.y < scoreRow.y + 40)
  if (!nameRow) return []
  const vbars = page.shapes.filter((s) => s.h > 25 && s.w > 20 && s.w < 80 && legend[s.fill])
  const markers = page.shapes.filter(isMarker)

  const poles = scoreRow.items
    .filter((i) => isDecimal(i.str))
    .map((sc) => {
      const cx = sc.x + sc.w / 2
      const bar = vbars.find((b) => cx >= b.x0 - 2 && cx <= b.x1 + 2)
      const nameItem = nameRow.items.reduce<TextItem | null>((best, it) => {
        const d = Math.abs(it.x + it.w / 2 - cx)
        return !best || d < Math.abs(best.x + best.w / 2 - cx) ? it : best
      }, null)
      return { cx, score: num(sc.str), bar, name: nameItem?.str.trim() || '' }
    })
  // Vertical calibration: fit bar top against printed score.
  const fit = linearFit(poles.filter((p) => p.bar).map((p) => [p.score, p.bar!.top] as [number, number]))
  const toScore = fit ? (y: number) => (y - fit.a) / fit.b : null
  if (fit) {
    for (const p of poles) {
      if (!p.bar) continue
      const geo = toScore!(p.bar.top)
      if (Math.abs(geo - p.score) > CROSS_CHECK_TOLERANCE) {
        throw new ParseError(`tent poles: bar for "${p.name}" reads ${geo.toFixed(2)} vs printed ${p.score.toFixed(2)}.`, 'tent_poles')
      }
    }
  }
  // Competencies listed beneath each pole: assign fragments to the nearest pole
  // column, then split the joined string on known competency names.
  const below = rows.filter((r) => r.y > nameRow.y + 5 && !/Copyright/i.test(r.text))
  const fragments = new Map<number, string[]>()
  for (const r of below) {
    for (const it of r.items) {
      const cx = it.x + it.w / 2
      let bestIdx = 0
      let bestD = Infinity
      poles.forEach((p, idx) => {
        const d = Math.abs(p.cx - cx)
        if (d < bestD) {
          bestD = d
          bestIdx = idx
        }
      })
      if (bestD < 70) fragments.set(bestIdx, [...(fragments.get(bestIdx) || []), it.str.trim()])
    }
  }
  const splitKnown = (joined: string): string[] => {
    const out: string[] = []
    let rest = norm(joined)
    const known = [...knownCompetencies].sort((a, b) => b.length - a.length)
    while (rest.length) {
      const hit = known.find((k) => rest.startsWith(norm(k)))
      if (!hit) break
      out.push(hit)
      rest = rest.slice(norm(hit).length).trim()
    }
    return out
  }
  return poles.map((p, idx) => {
    const ms = p.bar ? markers.filter((m) => m.cx >= p.bar!.x0 && m.cx <= p.bar!.x1).sort((a, b) => b.cy - a.cy) : []
    // Lower marker (larger y) = 75th, higher marker = 90th.
    return {
      name: p.name,
      score: p.score,
      band: p.bar ? legend[p.bar.fill] ?? null : null,
      norm_75th: toScore && ms[0] ? r2(toScore(ms[0].cy)) : null,
      norm_90th: toScore && ms[1] ? r2(toScore(ms[1].cy)) : null,
      competencies: splitKnown((fragments.get(idx) || []).join(' ')),
    }
  })
}

function parseRankings(pages: PageData[]): { rankings: CompetencyRanking[]; legend: Record<string, Band>; fromLegend: boolean } {
  const page = findPage(pages, /Differentiating Competency Rankings/)
  if (!page) throw new ParseError('Competency rankings page not found.', 'rankings')
  const { map: legend, fromLegend } = readBandLegend(page)
  const rows = rowsOf(page.text).filter((r) => r.items.some((i) => isDecimal(i.str)) && r.items.some((i) => i.x < 60 && !isDecimal(i.str)))
  const bars = page.shapes.filter((s) => isHorizontalBar(s) && s.w > 30 && legend[s.fill])
  type R = { competency: string; score: number; bar: Shape; markers: Shape[] }
  const reads: R[] = []
  for (const r of rows) {
    const label = r.items.find((i) => i.x < 60)!.str.trim()
    const score = num(r.items.find((i) => isDecimal(i.str))!.str)
    const bar = bars.find((b) => rowInShape(r.y, b))
    if (!bar) throw new ParseError(`rankings: no coloured bar found for "${label}".`, 'rankings')
    const markers = page.shapes.filter((s) => isMarker(s) && s.cy >= bar.top - 2 && s.cy <= bar.bottom + 2).sort((p, q) => p.cx - q.cx)
    reads.push({ competency: label, score, bar, markers })
  }
  if (reads.length < 5) throw new ParseError(`rankings: only ${reads.length} rows read.`, 'rankings')
  const toScore = calibrateHorizontal(
    reads.map((x) => ({ label: x.competency, x1: x.bar.x1, score: x.score })),
    'rankings'
  )
  const rankings = reads.map((x, i) => {
    const n90 = x.markers[1] ? r2(toScore(x.markers[1].cx)) : null
    return {
      rank: i + 1,
      competency: x.competency,
      total: x.score,
      band: legend[x.bar.fill],
      norm_75th: x.markers[0] ? r2(toScore(x.markers[0].cx)) : null,
      norm_90th: n90,
      distance_to_90th: n90 === null ? null : r2(n90 - x.score),
      vs_75th: relation(x.bar.x1, x.markers[0]),
      vs_90th: relation(x.bar.x1, x.markers[1]),
    }
  })
  return { rankings, legend, fromLegend }
}

function parseBehaviors(pages: PageData[], title: RegExp, canon: (s: string) => string): BehaviorScore[] {
  const page = findPage(pages, title)
  if (!page) return []
  const rows = rowsOf(page.text)
  const header = rows.find((r) => /Manager/.test(r.text) && /Total/.test(r.text) && /Peers/.test(r.text))
  if (!header) return []
  const cols = columnsFromHeader(header, ['Total', 'Manager', 'Peers', 'Others', 'Self', 'Direct Reports'])
  const out: BehaviorScore[] = []
  let cur: { item: string[]; comp: string[]; scores: Record<string, number> } | null = null
  const flush = () => {
    if (!cur) return
    const itemText = cur.item.join(' ').replace(/\s+/g, ' ').trim()
    const m = itemText.match(/^(\d+)\.\s*(.*)$/)
    out.push({
      item_number: m ? Number(m[1]) : null,
      item: m ? m[2] : itemText,
      competency: canon(cur.comp.join(' ')),
      total: cur.scores.Total ?? NaN,
      manager: cur.scores.Manager ?? null,
      peers: cur.scores.Peers ?? null,
      others: cur.scores.Others ?? null,
      self: cur.scores.Self ?? null,
      direct_reports: cur.scores['Direct Reports'] ?? null,
    })
    cur = null
  }
  for (const r of rows) {
    if (r.y <= header.y + 12) continue
    if (/^Section \d+$/.test(r.text) || /Copyright/i.test(r.text)) break
    if (r.items.length === 1 && r.items[0].x < 50 && !/^\d+\./.test(r.text) && /^[A-Z]/.test(r.text) && r.text.length > 12 && !cur) break // next section title
    const decimals = r.items.filter((i) => isDecimal(i.str))
    if (decimals.length >= 2) {
      flush()
      cur = { item: [], comp: [], scores: {} }
      for (const d of decimals) {
        const col = nearestColumn(cols, d)
        if (col) cur.scores[col] = num(d.str)
      }
    }
    if (!cur) continue
    for (const it of r.items) {
      if (isDecimal(it.str)) continue
      if (it.x < 120) cur.item.push(it.str)
      else if (it.x < 300) cur.comp.push(it.str)
    }
  }
  flush()
  return out
}

function parseVerbatims(pages: PageData[], startIdx: number, endIdx: number): Verbatims {
  const out: Verbatims = { strengths: {}, organizational_needs: {}, potential_fatal_flaws: {} }
  const TITLES: Array<[RegExp, keyof Verbatims]> = [
    [/^Leadership Strengths$/, 'strengths'],
    [/^Organizational Needs$/, 'organizational_needs'],
    [/^Potential Fatal Flaws$/, 'potential_fatal_flaws'],
  ]
  let section: keyof Verbatims | null = null
  let group: RaterGroup | null = null
  for (let p = startIdx; p <= endIdx && p < pages.length; p++) {
    const page = pages[p]
    let prevY: number | null = null
    for (const r of rowsOf(page.text)) {
      if (/Copyright/i.test(r.text) || /^Section \d+$/.test(r.text)) continue
      const first = r.items[0]
      const title = TITLES.find(([re]) => re.test(r.text))
      if (title && first.x < 47) {
        section = title[1]
        group = null
        prevY = null
        continue
      }
      if (r.items.length === 1 && first.x >= 47 && first.x < 58 && RATER_GROUPS.includes(r.text as RaterGroup)) {
        group = r.text as RaterGroup
        prevY = null
        continue
      }
      if (section && group && first.x >= 58 && first.x < 70) {
        const key = GROUP_KEY[group]
        const list = (out[section][key] = out[section][key] || [])
        const text = r.text
        if (prevY !== null && r.y - prevY <= 14 && list.length) list[list.length - 1] = `${list[list.length - 1]} ${text}`
        else list.push(text)
        prevY = r.y
      }
    }
  }
  return out
}

function parseImportance(pages: PageData[], canon: (s: string) => string): ImportanceRow[] {
  const page = findPage(pages, /Importance Ratings and Leadership Passions/)
  if (!page) return []
  const rows = rowsOf(page.text)
  const header = rows.find((r) => /Total/.test(r.text) && /Manager/.test(r.text) && /Self/.test(r.text))
  if (!header) return []
  const cols = columnsFromHeader(header, ['Total', 'Manager', 'Peers', 'Others', 'Self', 'Direct Reports'])
  const body = rows.filter((r) => r.y > header.y + 4 && !/Copyright/i.test(r.text))
  // Name fragments: left-side text that isn't the axis, the LPs caption, or a passion tick.
  const nameRows = body.filter((r) => r.items.some((i) => i.x < 260 && i.x > 50 && !/^\d$/.test(i.str) && i.str.trim() !== 'LPs' && i.str.trim() !== '|'))
  const blocks: Array<{ ys: number[]; parts: string[] }> = []
  for (const r of nameRows) {
    const parts = r.items.filter((i) => i.x < 260 && i.x > 50 && !/^\d$/.test(i.str)).map((i) => i.str.trim())
    const last = blocks[blocks.length - 1]
    if (last && r.y - last.ys[last.ys.length - 1] <= 14) {
      last.ys.push(r.y)
      last.parts.push(...parts)
    } else blocks.push({ ys: [r.y], parts })
  }
  const out: ImportanceRow[] = []
  for (const b of blocks) {
    const lo = Math.min(...b.ys) - 9
    const hi = Math.max(...b.ys) + 9
    const inRange = body.filter((r) => r.y >= lo && r.y <= hi)
    const votes: Record<string, number> = {}
    let passion = false
    for (const r of inRange) {
      for (const it of r.items) {
        if (it.str.trim() === '|' && it.x < 55) passion = true
        if (/^\d+$/.test(it.str.trim()) && it.x > 280) {
          const col = nearestColumn(cols, it)
          if (col) votes[col] = Number(it.str)
        }
      }
    }
    const manager = votes.Manager ?? 0
    const peers = votes.Peers ?? 0
    const others = votes.Others ?? 0
    const self = votes.Self ?? 0
    const direct_reports = votes['Direct Reports'] ?? 0
    out.push({
      competency: canon(b.parts.join(' ')),
      total_votes: votes.Total ?? manager + peers + others + self + direct_reports,
      manager,
      peers,
      others,
      self,
      direct_reports,
      is_passion: passion,
      weighted_score: 0,
      weighted_importance: 0,
    })
  }
  return out
}

function parseGap(pages: PageData[], canon: (s: string) => string): GapRow[] {
  const page = findPage(pages, /Differentiating Competency Gap Analysis/)
  if (!page) return []
  const rows = rowsOf(page.text)
  const legend: Record<string, GapRow['direction']> = {}
  for (const r of rows) {
    const dir = /Meaningful Positive/.test(r.text) ? 'positive' : /Meaningful Negative/.test(r.text) ? 'negative' : /Irrelevant Gap/.test(r.text) ? 'irrelevant' : null
    if (!dir) continue
    const swatch = page.shapes.find((s) => s.w > 60 && s.h > 10 && s.h < 25 && rowInShape(r.y, s))
    if (swatch) legend[swatch.fill] = dir
  }
  const headerTotal = rows.find((r) => r.items.some((i) => i.str.trim() === 'Total') && r.items.some((i) => i.str.trim() === 'Self'))
  const headerGap = rows.find((r) => r.items.some((i) => i.str.trim() === 'Gap Size'))
  if (!headerTotal || !headerGap) return []
  const cols = new Map<string, number>()
  columnsFromHeader(headerTotal, ['Total', 'Self']).forEach((x, k) => cols.set(k, x))
  columnsFromHeader(headerGap, ['Gap Size']).forEach((x, k) => cols.set(k, x))
  const gapBars = page.shapes.filter((s) => s.x0 > 400 && s.h > 12 && s.h < 20 && legend[s.fill])
  const out: GapRow[] = []
  for (const r of rows) {
    if (r.y <= headerGap.y + 8) continue
    const decs = r.items.filter((i) => isDecimal(i.str))
    const label = r.items.find((i) => i.x < 60 && !isDecimal(i.str))
    if (decs.length < 3 || !label) continue
    const v: Record<string, number> = {}
    for (const d of decs) {
      const col = nearestColumn(cols, d)
      if (col) v[col] = num(d.str)
    }
    const bar = gapBars.find((b) => rowInShape(r.y, b))
    out.push({
      competency: canon(label.str),
      total: v.Total,
      self: v.Self,
      gap: v['Gap Size'],
      direction: bar ? legend[bar.fill] ?? null : null,
    })
  }
  return out
}

function parseDetails(pages: PageData[], startIdx: number, canon: (s: string) => string): CompetencyDetail[] {
  const out: CompetencyDetail[] = []
  let comp: CompetencyDetail | null = null
  let item: CompetencyDetail['items'][number] | null = null
  const LABELS = ['Total Score', 'Total', ...RATER_GROUPS]
  for (let p = startIdx; p < pages.length; p++) {
    for (const r of rowsOf(pages[p].text)) {
      if (/Copyright/i.test(r.text)) continue
      const first = r.items[0]
      const head = first.x >= 40 && first.x < 47 ? first.str.trim().match(/^(.+?) \(([^()]+)\)$/) : null
      if (head) {
        comp = { competency: canon(head[1]), tent_pole: head[2], total: null, by_rater_group: [], items: [] }
        out.push(comp)
        item = null
        continue
      }
      const itemHead = first.x >= 58 && first.x < 66 ? first.str.trim().match(/^(\d+)\.\s+(.*)$/) : null
      if (itemHead && comp) {
        item = { item_number: Number(itemHead[1]), item: itemHead[2], total: null, n: null, by_rater_group: [] }
        comp.items.push(item)
        continue
      }
      const label = r.items.find((i) => LABELS.includes(i.str.trim()))
      if (!label || !comp) continue
      const score = r.items.find((i) => isDecimal(i.str) && i.x < 230)
      const scoreVal = score ? num(score.str) : null
      if (label.x < 66) {
        // competency-level row
        if (/^Total/.test(label.str)) comp.total = scoreVal
        else comp.by_rater_group.push({ group: label.str.trim() as RaterGroup, score: scoreVal })
      } else if (item) {
        const nItem = r.items.find((i) => /^\d+$/.test(i.str.trim()) && i.x > 160 && i.x < 190)
        const n = nItem ? Number(nItem.str) : null
        if (/^Total/.test(label.str)) {
          item.total = scoreVal
          item.n = n
        } else item.by_rater_group.push({ group: label.str.trim() as RaterGroup, score: scoreVal, n })
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export function parseAssessment360(pages: PageData[], opts: { formatVersion: string }): ParseOutput {
  const notes: string[] = []
  if (!pages.length) throw new ParseError('No pages.', 'document')

  const cover = parseCover(pages[0])
  const counts = parseRaterCounts(pages)
  const raters = parseRaterNames(pages)

  const { rankings, legend, fromLegend } = parseRankings(pages)
  if (!fromLegend) notes.push('Band legend not found on the rankings page; fell back to the built-in colour map.')
  const known = rankings.map((r) => r.competency)
  const canon = (s: string): string => {
    const target = norm(s)
    const hit = known.find((k) => norm(k) === target)
    if (hit) return hit
    const loose = known.find((k) => norm(k).replace(/\s/g, '') === target.replace(/\s/g, ''))
    if (loose) return loose
    notes.push(`Unrecognised competency label "${s.trim()}" — kept verbatim.`)
    return s.replace(/\s+/g, ' ').trim()
  }

  const overall = parseOverall(pages, legend)
  const engagement = parseEngagement(pages, counts, legend)
  const tent_poles = parseTentPoles(pages, legend, known)
  const highest = parseBehaviors(pages, /Highest Scored Behaviors/, canon)
  const lowest = parseBehaviors(pages, /Lowest Scored Behaviors/, canon)
  const importance = parseImportance(pages, canon)
  const gap = parseGap(pages, canon)

  const strengthsIdx = pages.findIndex((p) => rowsOf(p.text).some((r) => /^Leadership Strengths$/.test(r.text) && r.items[0].x < 47))
  const gapIdx = findPageIndex(pages, /Differentiating Competency Gap Analysis/)
  const verbatims = strengthsIdx >= 0 ? parseVerbatims(pages, strengthsIdx, gapIdx > 0 ? gapIdx - 1 : pages.length - 1) : { strengths: {}, organizational_needs: {}, potential_fatal_flaws: {} }

  const detailsIdx = findPageIndex(pages, /Differentiating Competency Score Details/)
  const competency_details = detailsIdx >= 0 ? parseDetails(pages, detailsIdx, canon) : []

  // Text for AI use: from the first results page onward (boilerplate skipped),
  // and never the rater-names table.
  const overallIdx = findPageIndex(pages, /Overall Leadership Effectiveness/)
  const firstContent = overallIdx > 0 ? overallIdx : 0
  const extractedText = pages
    .slice(firstContent)
    .map((p) => {
      const lines = rowsOf(p.text)
        .filter((r) => !(raters.page === p.pageNumber && raters.dropRows(r)))
        .map((r) => r.text)
      return `--- page ${p.pageNumber} ---\n${lines.join('\n')}`
    })
    .join('\n\n')

  const data: ParseOutput['data'] = {
    participant_name: cover.name,
    report_date: cover.date,
    assessment_date: toIsoDate(cover.date),
    instrument: 'Zenger Folkman Extraordinary Leader',
    format_version: opts.formatVersion,
    rater_counts: counts,
    overall_effectiveness: overall,
    engagement,
    tent_poles,
    competency_rankings: rankings,
    importance,
    highest_behaviors: highest,
    lowest_behaviors: lowest,
    gap_analysis: gap,
    verbatims,
    competency_details,
    extraction_notes: notes,
  }
  return { data, raterNames: raters.names, extractedText, notes }
}
