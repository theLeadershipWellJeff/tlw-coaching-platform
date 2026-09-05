// Dump positioned text items for a page, grouped into rows by y.
//   PDF=... node scripts/spikes/dump-text.js <page>
const { getDocumentProxy } = require('unpdf')
const fs = require('fs')
;(async () => {
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(process.env.PDF)))
  const page = await pdf.getPage(Number(process.argv[2]))
  const H = page.getViewport({ scale: 1 }).height
  const tc = await page.getTextContent()
  const items = tc.items
    .filter((t) => t.str.trim())
    .map((t) => ({ s: t.str, x: +t.transform[4].toFixed(1), y: +(H - t.transform[5]).toFixed(1), w: +t.width.toFixed(1), f: t.fontName }))
    .sort((a, b) => a.y - b.y || a.x - b.x)
  let rowY = null
  let line = []
  const flush = () => { if (line.length) console.log(`y=${rowY}  ` + line.map((i) => `[${i.x}]${JSON.stringify(i.s)}`).join(' ')); line = [] }
  for (const it of items) {
    if (rowY === null || Math.abs(it.y - rowY) > 2.5) { flush(); rowY = it.y }
    line.push(it)
  }
  flush()
})()
