/**
 * Coaching Hours PDF — a clean, ICF-recertification-ready hours document.
 *
 * Built with pdf-lib (pure JS, serverless-safe): a header identifying the
 * coach and period, a summary block (total / paid / pro-bono hours, sessions,
 * unique clients), a by-client rollup table, and the full chronological log,
 * paginated with repeated table headers and page numbers.
 *
 * Data comes from lib/coaching-hours.ts#loadCoachingHours — the same merged
 * log (note-derived sessions + imported historical entries) the widget shows.
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import type { HoursLog, HoursSession } from './coaching-hours'
import { roundHours } from './coaching-hours'

const PAGE = { width: 612, height: 792 } // US Letter
const MARGIN = 54
const INK = rgb(0.067, 0.071, 0.149) // #111226
const GRAY = rgb(0.45, 0.43, 0.4)
const LIGHT = rgb(0.88, 0.87, 0.85)
const ORANGE = rgb(0.96, 0.51, 0.12) // #F5821F

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtHours(minutes: number): string {
  return `${roundHours(minutes)}`
}

/** Truncate to fit a column width, adding an ellipsis when cut. */
function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let t = text
  while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxWidth) {
    t = t.slice(0, -1)
  }
  return t + '…'
}

interface Ctx {
  doc: PDFDocument
  page: PDFPage
  y: number
  font: PDFFont
  bold: PDFFont
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([PAGE.width, PAGE.height])
  ctx.y = PAGE.height - MARGIN
}

function ensureRoom(ctx: Ctx, needed: number, onNewPage?: () => void): void {
  if (ctx.y - needed < MARGIN + 24) {
    newPage(ctx)
    onNewPage?.()
  }
}

function text(
  ctx: Ctx,
  str: string,
  opts: { x?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}
): void {
  ctx.page.drawText(str, {
    x: opts.x ?? MARGIN,
    y: ctx.y,
    size: opts.size ?? 10,
    font: opts.bold ? ctx.bold : ctx.font,
    color: opts.color ?? INK,
  })
}

function rule(ctx: Ctx, color = LIGHT): void {
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE.width - MARGIN, y: ctx.y },
    thickness: 0.5,
    color,
  })
}

interface Col {
  label: string
  x: number
  width: number
  align?: 'right'
}

function drawTableHeader(ctx: Ctx, cols: Col[]): void {
  for (const c of cols) {
    const label = c.label.toUpperCase()
    const x =
      c.align === 'right' ? c.x + c.width - ctx.bold.widthOfTextAtSize(label, 7.5) : c.x
    ctx.page.drawText(label, { x, y: ctx.y, size: 7.5, font: ctx.bold, color: GRAY })
  }
  ctx.y -= 6
  rule(ctx)
  ctx.y -= 12
}

function drawRow(ctx: Ctx, cols: Col[], values: string[], size = 9.5): void {
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i]
    const v = fit(values[i] ?? '', ctx.font, size, c.width)
    const x = c.align === 'right' ? c.x + c.width - ctx.font.widthOfTextAtSize(v, size) : c.x
    ctx.page.drawText(v, { x, y: ctx.y, size, font: ctx.font, color: INK })
  }
  ctx.y -= 16
}

export async function buildCoachingHoursPdf(opts: {
  coachName: string
  coachEmail: string
  periodLabel: string
  log: HoursLog
}): Promise<Uint8Array> {
  const { log } = opts
  const doc = await PDFDocument.create()
  doc.setTitle('Coaching Hours Log')
  doc.setAuthor(opts.coachName)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ctx: Ctx = { doc, page: doc.addPage([PAGE.width, PAGE.height]), y: 0, font, bold }
  ctx.y = PAGE.height - MARGIN

  // ── Header ──────────────────────────────────────────────────────────────
  text(ctx, 'COACHING HOURS LOG', { size: 19, bold: true })
  ctx.y -= 15
  text(ctx, 'theLeadershipWell', { size: 9.5, color: ORANGE, bold: true })
  ctx.y -= 22
  text(ctx, `Coach: ${opts.coachName}`, { size: 10.5 })
  ctx.y -= 15
  text(ctx, `Email: ${opts.coachEmail}`, { size: 10.5 })
  ctx.y -= 15
  text(ctx, `Period: ${opts.periodLabel}`, { size: 10.5 })
  ctx.y -= 15
  text(
    ctx,
    `Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    { size: 10.5, color: GRAY }
  )
  ctx.y -= 14
  rule(ctx)
  ctx.y -= 26

  // ── Summary ─────────────────────────────────────────────────────────────
  const sessionsOnly = log.sessions.filter((s) => s.kind !== 'aggregate')
  const aggregates = log.sessions.filter((s) => s.kind === 'aggregate')
  const uniqueClients = new Set(
    sessionsOnly.map((s) => s.client_name.trim().toLowerCase()).filter(Boolean)
  ).size

  const summary: [string, string][] = [
    ['Total hours', fmtHours(log.total_minutes)],
    ['Paid hours', fmtHours(log.paid_minutes)],
    ['Pro bono hours', fmtHours(log.pro_bono_minutes)],
    ['Sessions logged', String(sessionsOnly.length)],
    ['Clients', String(uniqueClients)],
  ]
  const colWidth = (PAGE.width - MARGIN * 2) / summary.length
  summary.forEach(([label, value], i) => {
    const x = MARGIN + i * colWidth
    ctx.page.drawText(label.toUpperCase(), { x, y: ctx.y, size: 7.5, font: bold, color: GRAY })
    ctx.page.drawText(value, { x, y: ctx.y - 20, size: 17, font: bold, color: INK })
  })
  ctx.y -= 46
  if (aggregates.length > 0) {
    text(
      ctx,
      `Includes ${aggregates.length} prior-hours block${aggregates.length === 1 ? '' : 's'} (pre-platform history) totaling ${fmtHours(
        aggregates.reduce((a, s) => a + s.duration_minutes, 0)
      )} hours — listed below.`,
      { size: 9, color: GRAY }
    )
    ctx.y -= 18
  }
  ctx.y -= 6

  // ── Prior-hours blocks ──────────────────────────────────────────────────
  if (aggregates.length > 0) {
    text(ctx, 'Prior-hours blocks', { size: 12, bold: true })
    ctx.y -= 18
    const cols: Col[] = [
      { label: 'As of', x: MARGIN, width: 90 },
      { label: 'Description', x: MARGIN + 100, width: 300 },
      { label: 'Paid', x: MARGIN + 410, width: 40 },
      { label: 'Hours', x: MARGIN + 450, width: PAGE.width - MARGIN - (MARGIN + 450), align: 'right' },
    ]
    drawTableHeader(ctx, cols)
    for (const a of aggregates) {
      ensureRoom(ctx, 16, () => drawTableHeader(ctx, cols))
      drawRow(ctx, cols, [
        fmtDate(a.session_date),
        [a.client_name, a.title].filter(Boolean).join(' · '),
        a.paid ? 'yes' : 'no',
        fmtHours(a.duration_minutes),
      ])
    }
    ctx.y -= 10
  }

  // ── By-client rollup ────────────────────────────────────────────────────
  if (sessionsOnly.length > 0) {
    const byClient = new Map<string, { name: string; count: number; minutes: number; first: string; last: string }>()
    for (const s of sessionsOnly) {
      const key = s.client_name.trim().toLowerCase()
      const cur = byClient.get(key)
      if (cur) {
        cur.count += 1
        cur.minutes += s.duration_minutes
        if (s.session_date < cur.first) cur.first = s.session_date
        if (s.session_date > cur.last) cur.last = s.session_date
      } else {
        byClient.set(key, {
          name: s.client_name,
          count: 1,
          minutes: s.duration_minutes,
          first: s.session_date,
          last: s.session_date,
        })
      }
    }
    const rollup = Array.from(byClient.values()).sort((a, b) => b.minutes - a.minutes)

    ensureRoom(ctx, 60)
    text(ctx, 'Hours by client', { size: 12, bold: true })
    ctx.y -= 18
    const cols: Col[] = [
      { label: 'Client', x: MARGIN, width: 190 },
      { label: 'Sessions', x: MARGIN + 200, width: 50, align: 'right' },
      { label: 'First session', x: MARGIN + 270, width: 90 },
      { label: 'Last session', x: MARGIN + 370, width: 90 },
      { label: 'Hours', x: MARGIN + 460, width: PAGE.width - MARGIN - (MARGIN + 460), align: 'right' },
    ]
    drawTableHeader(ctx, cols)
    for (const r of rollup) {
      ensureRoom(ctx, 16, () => drawTableHeader(ctx, cols))
      drawRow(ctx, cols, [r.name, String(r.count), fmtDate(r.first), fmtDate(r.last), fmtHours(r.minutes)])
    }
    ctx.y -= 10
  }

  // ── Chronological session log ───────────────────────────────────────────
  if (sessionsOnly.length > 0) {
    ensureRoom(ctx, 60)
    text(ctx, 'Session log', { size: 12, bold: true })
    ctx.y -= 18
    const cols: Col[] = [
      { label: 'Date', x: MARGIN, width: 78 },
      { label: 'Client', x: MARGIN + 88, width: 140 },
      { label: 'Description', x: MARGIN + 238, width: 172 },
      { label: 'Source', x: MARGIN + 420, width: 44 },
      { label: 'Hours', x: MARGIN + 470, width: PAGE.width - MARGIN - (MARGIN + 470), align: 'right' },
    ]
    drawTableHeader(ctx, cols)
    // Oldest first — a certification log reads forward in time.
    const chronological = [...sessionsOnly].sort((a, b) => a.session_date.localeCompare(b.session_date))
    for (const s of chronological) {
      ensureRoom(ctx, 16, () => drawTableHeader(ctx, cols))
      drawRow(ctx, cols, [
        fmtDate(s.session_date),
        s.client_name,
        s.title || '',
        s.source === 'imported' ? 'imported' : 'in-app',
        fmtHours(s.duration_minutes),
      ])
    }
  }

  if (log.sessions.length === 0) {
    text(ctx, 'No coaching hours recorded for this period.', { size: 11, color: GRAY })
  }

  // ── Footer: page numbers + attribution on every page ────────────────────
  const pages = doc.getPages()
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`
    p.drawText(label, {
      x: PAGE.width - MARGIN - font.widthOfTextAtSize(label, 8),
      y: MARGIN - 18,
      size: 8,
      font,
      color: GRAY,
    })
    p.drawText('Generated by theLeadershipWell coaching platform', {
      x: MARGIN,
      y: MARGIN - 18,
      size: 8,
      font,
      color: GRAY,
    })
  })

  return doc.save()
}
