/**
 * Page geometry reader — the deterministic pass behind assessment extraction.
 *
 * Reads a PDF page's drawing operators (via pdf.js, which `unpdf` bundles) and
 * returns every FILLED shape with its colour and page-space bounding box, plus
 * every text item with its position. No OCR, no vision model: bar lengths,
 * marker positions, and fill colours are exact vector data in the file.
 *
 * Coordinates are top-down page space (y grows downward, like the text layer),
 * so a bar and the label printed beside it share a y.
 *
 * pdf.js specifics this handles (verified against pdf.js 6.x):
 *  - the paint operator (fill / eoFill / stroke / endPath) is folded into
 *    `constructPath`'s first argument; the bbox is the third;
 *  - shapes are drawn under per-row `transform`s inside save/restore, so a CTM
 *    stack is tracked and every bbox is mapped through it;
 *  - `setFillRGBColor` carries a single "#rrggbb" string.
 */

export type Shape = {
  /** 'fill' | 'eoFill' | 'fillStroke' … — only filled shapes are kept. */
  paint: string
  /** "#rrggbb" lowercase, or "gray:<0-1>" for grayscale fills. */
  fill: string
  x0: number
  x1: number
  top: number
  bottom: number
  w: number
  h: number
  cx: number
  cy: number
}

export type TextItem = {
  str: string
  /** Left edge. */
  x: number
  /** Baseline, top-down. */
  y: number
  w: number
  font: string
}

export type PageData = {
  pageNumber: number
  width: number
  height: number
  shapes: Shape[]
  text: TextItem[]
}

type Matrix = [number, number, number, number, number, number]

function mul(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}
function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

const r2 = (v: number) => Math.round(v * 100) / 100

// Minimal structural types for the pdf.js objects we touch — keeps this module
// free of a hard dependency on pdf.js's own type surface across versions.
type PdfPageLike = {
  getViewport(opts: { scale: number }): { width: number; height: number }
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>
  getTextContent(): Promise<{ items: unknown[] }>
}

/** Read one page: filled shapes (page-space, colour) + positioned text. */
export async function readPage(page: PdfPageLike, pageNumber: number): Promise<PageData> {
  const { OPS } = await import('unpdf/pdfjs')
  const opName: Record<number, string> = {}
  for (const k of Object.keys(OPS as Record<string, number>)) opName[(OPS as Record<string, number>)[k]] = k

  const { width, height: H } = page.getViewport({ scale: 1 })
  const ops = await page.getOperatorList()

  let ctm: Matrix = [1, 0, 0, 1, 0, 0]
  const stack: Matrix[] = []
  let fill = '#000000'
  const shapes: Shape[] = []

  for (let i = 0; i < ops.fnArray.length; i++) {
    const n = opName[ops.fnArray[i]]
    const a = ops.argsArray[i] as unknown[]
    if (n === 'save') stack.push(ctm)
    else if (n === 'restore') ctm = stack.pop() || ctm
    else if (n === 'transform') ctm = mul(ctm, Array.from(a as number[]) as Matrix)
    else if (n === 'setFillRGBColor') fill = String(a[0]).toLowerCase()
    else if (n === 'setFillGray') fill = `gray:${a[0]}`
    else if (n === 'constructPath') {
      const paint = opName[a[0] as number] || String(a[0])
      if (!/fill/i.test(paint)) continue
      const bbox = Array.from((a[2] as ArrayLike<number>) || [])
      if (bbox.length < 4) continue
      const p1 = apply(ctm, bbox[0], bbox[1])
      const p2 = apply(ctm, bbox[2], bbox[3])
      const x0 = Math.min(p1[0], p2[0])
      const x1 = Math.max(p1[0], p2[0])
      // pdf.js hands back PDF-space y (origin bottom-left); flip to top-down.
      const top = H - Math.max(p1[1], p2[1])
      const bottom = H - Math.min(p1[1], p2[1])
      shapes.push({
        paint,
        fill,
        x0: r2(x0),
        x1: r2(x1),
        top: r2(top),
        bottom: r2(bottom),
        w: r2(x1 - x0),
        h: r2(bottom - top),
        cx: r2((x0 + x1) / 2),
        cy: r2((top + bottom) / 2),
      })
    }
  }

  const tc = await page.getTextContent()
  const text: TextItem[] = []
  for (const it of tc.items as Array<Record<string, unknown>>) {
    if (typeof it.str !== 'string' || !it.str.trim()) continue
    const t = it.transform as number[]
    text.push({
      str: it.str,
      x: r2(t[4]),
      y: r2(H - t[5]),
      w: r2(Number(it.width) || 0),
      font: String(it.fontName || ''),
    })
  }
  text.sort((p, q) => p.y - q.y || p.x - q.x)

  return { pageNumber, width, height: H, shapes, text }
}

/** Group text items into visual rows (items whose baselines sit within `tol`). */
export type Row = { y: number; items: TextItem[]; text: string }

export function rowsOf(text: TextItem[], tol = 2.5): Row[] {
  const rows: Row[] = []
  let cur: TextItem[] = []
  let curY: number | null = null
  const flush = () => {
    if (!cur.length) return
    const items = [...cur].sort((p, q) => p.x - q.x)
    rows.push({ y: curY as number, items, text: items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim() })
    cur = []
  }
  for (const it of text) {
    if (curY === null || Math.abs(it.y - curY) > tol) {
      flush()
      curY = it.y
    }
    cur.push(it)
  }
  flush()
  return rows
}

/** Is `s` a score-like decimal ("4.33", "-0.08", "0.00")? */
export function isDecimal(s: string): boolean {
  return /^-?\d+\.\d\d$/.test(s.trim())
}

/** Least-squares fit y = a + b·x. Returns null with fewer than two points. */
export function linearFit(points: Array<[number, number]>): { a: number; b: number; maxResidual: number } | null {
  if (points.length < 2) return null
  const n = points.length
  const sx = points.reduce((s, p) => s + p[0], 0)
  const sy = points.reduce((s, p) => s + p[1], 0)
  const sxx = points.reduce((s, p) => s + p[0] * p[0], 0)
  const sxy = points.reduce((s, p) => s + p[0] * p[1], 0)
  const denom = n * sxx - sx * sx
  if (Math.abs(denom) < 1e-9) return null
  const b = (n * sxy - sx * sy) / denom
  const a = (sy - b * sx) / n
  const maxResidual = Math.max(...points.map((p) => Math.abs(a + b * p[0] - p[1])))
  return { a, b, maxResidual }
}
