// Phase 2 spike: recover bar geometry + fill colour from a 360 report page with
// pdfjs (via unpdf, the library the app already ships). Tracks the CTM stack so
// shapes drawn under per-row transforms land in page coordinates, decodes the
// paint op folded into constructPath (pdfjs ≥4), and reads hex fill colours.
//
//   PDF=/path/to/report.pdf node scripts/spikes/spike-geometry.js <page>
const { getDocumentProxy } = require('unpdf')
const fs = require('fs')

const PDF = process.env.PDF
const PAGE = Number(process.argv[2] || 7)

function mul(m, n) {
  // m × n (pdf.js convention: apply n then m)
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}
function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

async function main() {
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(PDF)))
  const page = await pdf.getPage(PAGE)
  const H = page.getViewport({ scale: 1 }).height
  const { OPS } = await import('unpdf/pdfjs')
  const names = {}
  for (const k in OPS) names[OPS[k]] = k
  const ops = await page.getOperatorList()

  let ctm = [1, 0, 0, 1, 0, 0]
  const stack = []
  let fill = null
  const shapes = []
  for (let i = 0; i < ops.fnArray.length; i++) {
    const n = names[ops.fnArray[i]]
    const a = ops.argsArray[i]
    if (n === 'save') stack.push(ctm)
    else if (n === 'restore') ctm = stack.pop() || ctm
    else if (n === 'transform') ctm = mul(ctm, Array.from(a))
    else if (n === 'setFillRGBColor') fill = String(a[0])
    else if (n === 'setFillGray') fill = `gray:${a[0]}`
    else if (n === 'constructPath') {
      const [paintOp, segs, bbox] = a
      const paint = names[paintOp] || String(paintOp)
      const seg = segs && segs[0] ? Array.from(segs[0]) : []
      const [bx0, by0, bx1, by1] = Array.from(bbox || [])
      const p1 = apply(ctm, bx0, by0)
      const p2 = apply(ctm, bx1, by1)
      const x0 = Math.min(p1[0], p2[0]), x1 = Math.max(p1[0], p2[0])
      // pdf.js hands us y already flipped (negative); page-space y grows down.
      const yA = H - (H + Math.max(p1[1], p2[1])), yB = H - (H + Math.min(p1[1], p2[1]))
      const y0 = Math.min(-p1[1], -p2[1]) , y1 = Math.max(-p1[1], -p2[1])
      shapes.push({
        paint,
        fill,
        x0: +x0.toFixed(2),
        x1: +x1.toFixed(2),
        y0: +y0.toFixed(2),
        y1: +y1.toFixed(2),
        w: +(x1 - x0).toFixed(2),
        h: +(y1 - y0).toFixed(2),
        segs: seg.length / 3,
      })
      void yA; void yB
    }
  }

  const filled = shapes.filter((s) => /fill/i.test(s.paint))
  console.log(`page ${PAGE}: ${shapes.length} paths, ${filled.length} filled`)
  const colours = {}
  for (const s of filled) colours[s.fill] = (colours[s.fill] || 0) + 1
  console.log('fill colours:', JSON.stringify(colours))

  const bars = filled.filter((s) => s.h > 5 && s.h < 25 && s.w > 15)
  const markers = filled.filter((s) => s.w < 14 && s.h < 14 && s.w > 2)
  console.log('\nBARS (y, x0..x1, w, h, colour):')
  bars.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0).forEach((b) => console.log(`  y=${b.y0} x=${b.x0}..${b.x1} w=${b.w} h=${b.h} fill=${b.fill}`))
  console.log('\nMARKERS (y, x-centre, w, h, segs, colour):')
  markers
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    .forEach((m) => console.log(`  y=${m.y0} cx=${+((m.x0 + m.x1) / 2).toFixed(2)} w=${m.w} h=${m.h} segs=${m.segs} fill=${m.fill}`))

  const tc = await page.getTextContent()
  const nums = tc.items
    .filter((t) => /^\d\.\d\d$/.test(t.str.trim()))
    .map((t) => ({ str: t.str, x: +t.transform[4].toFixed(2), y: +(H - t.transform[5]).toFixed(2) }))
  console.log('\nNUMERIC TEXT (y, x, value):')
  nums.sort((a, b) => a.y - b.y || a.x - b.x).forEach((t) => console.log(`  y=${t.y} x=${t.x} ${t.str}`))
  const labels = tc.items
    .filter((t) => t.str.trim().length > 4 && !/^\d/.test(t.str))
    .map((t) => ({ str: t.str.trim(), x: +t.transform[4].toFixed(1), y: +(H - t.transform[5]).toFixed(1) }))
  console.log('\nLABELS:')
  labels.sort((a, b) => a.y - b.y).forEach((t) => console.log(`  y=${t.y} x=${t.x} ${t.str}`))
}
main().catch((e) => {
  console.error('ERR', e.stack)
  process.exit(1)
})
