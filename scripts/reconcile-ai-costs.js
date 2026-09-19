#!/usr/bin/env node
/**
 * Reconcile the AI usage ledger (ai_usage) against the Anthropic Console for
 * one billing month (cost-controls brief, Phase 4: "validate against the
 * Console invoice for one billing cycle, ±5%").
 *
 *   node scripts/reconcile-ai-costs.js --month 2026-09 --invoice 412.37
 *   node scripts/reconcile-ai-costs.js --month 2026-09 --csv ~/Downloads/anthropic-usage.csv
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_API_SECRET_KEY in the environment
 * (the same values Vercel holds). Read-only.
 *
 *   --month YYYY-MM   the UTC month to reconcile (default: this month)
 *   --invoice <usd>   the Console invoice / "Cost" total for that month
 *   --csv <path>      a Console usage export (Console → Usage → Export). Column
 *                     names vary by export; model / input / output / cache
 *                     creation / cache read / cost columns are matched by name.
 *   --tolerance <pct> pass threshold (default 5)
 *
 * Exit 0 when every comparison is within tolerance (or nothing to compare
 * against), 1 otherwise. Prints the ledger by model either way, so the
 * numbers can be read against the Console by hand.
 *
 * What can legitimately differ: reservations still open at month end (a
 * killed function — released by the hourly cron after 15 min), calls the
 * gateway refused (never reached Anthropic, never on the ledger), prices in
 * ai_model_prices that lag a list change, and the Console's own timezone
 * (this script uses UTC months, as the ledger does).
 */
const fs = require('fs')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const USD = 1_000_000
const usd = (m) => `$${(m / USD).toFixed(2)}`
const pctDiff = (a, b) => (b === 0 ? (a === 0 ? 0 : Infinity) : Math.abs(a - b) / Math.abs(b) * 100)

function monthBounds(input) {
  const m = /^(\d{4})-(\d{2})/.exec(input || '')
  const now = new Date()
  const y = m ? Number(m[1]) : now.getUTCFullYear()
  const mo = m ? Number(m[2]) : now.getUTCMonth() + 1
  return { label: `${y}-${String(mo).padStart(2, '0')}`, start: new Date(Date.UTC(y, mo - 1, 1)).toISOString(), end: new Date(Date.UTC(y, mo, 1)).toISOString() }
}

/** Minimal CSV parser (quotes, doubled quotes, CRLF). */
function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else q = false
      } else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (ch !== '\r') cell += ch
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function findCol(headers, patterns) {
  const lower = headers.map((h) => h.toLowerCase().trim())
  for (const p of patterns) {
    const i = lower.findIndex((h) => p.test(h))
    if (i >= 0) return i
  }
  return -1
}

async function loadLedger(bounds) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_API_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_API_SECRET_KEY are required')
  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('ai_usage')
      .select('model, status, reserved_usd_micros, actual_usd_micros, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens')
      .gte('created_at', bounds.start)
      .lt('created_at', bounds.end)
      .order('created_at', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data || []))
    if ((data || []).length < 1000) break
  }
  return rows
}

function byModel(rows) {
  const map = new Map()
  for (const r of rows) {
    let b = map.get(r.model)
    if (!b) map.set(r.model, (b = { model: r.model, requests: 0, settled: 0, reserved: 0, released: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0 }))
    b.requests++
    if (r.status === 'settled') {
      b.settled++
      b.input += r.input_tokens || 0
      b.output += r.output_tokens || 0
      b.cacheWrite += r.cache_write_tokens || 0
      b.cacheRead += r.cache_read_tokens || 0
      b.cost += r.actual_usd_micros ?? r.reserved_usd_micros ?? 0
    } else if (r.status === 'released') b.released++
    else b.reserved++
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost)
}

async function main() {
  const bounds = monthBounds(arg('month'))
  const tolerance = Number(arg('tolerance', '5'))
  const invoice = arg('invoice') ? Number(arg('invoice')) : null
  const csvPath = arg('csv')
  const rows = await loadLedger(bounds)
  const models = byModel(rows)
  const total = models.reduce((s, b) => s + b.cost, 0)
  const open = models.reduce((s, b) => s + b.reserved, 0)
  const released = models.reduce((s, b) => s + b.released, 0)

  console.log(`\nLedger — ${bounds.label} (UTC), ${rows.length} rows`)
  console.log('model'.padEnd(30), 'settled'.padStart(8), 'input'.padStart(11), 'output'.padStart(9), 'cache w'.padStart(10), 'cache r'.padStart(11), 'cost'.padStart(10))
  for (const b of models) {
    console.log(b.model.padEnd(30), String(b.settled).padStart(8), String(b.input).padStart(11), String(b.output).padStart(9), String(b.cacheWrite).padStart(10), String(b.cacheRead).padStart(11), usd(b.cost).padStart(10))
  }
  console.log('total'.padEnd(30), ''.padStart(8), ''.padStart(11), ''.padStart(9), ''.padStart(10), ''.padStart(11), usd(total).padStart(10))
  if (open) console.log(`  note: ${open} reservation(s) still open — worth $0 here; the hourly cron releases them after 15 min`)
  if (released) console.log(`  note: ${released} call(s) failed (released) — never billed by Anthropic unless the failure was after the request landed`)

  let ok = true

  if (csvPath) {
    const table = parseCsv(fs.readFileSync(csvPath, 'utf8'))
    const headers = table[0]
    const col = {
      model: findCol(headers, [/^model/, /model/]),
      input: findCol(headers, [/uncached.*input/, /^input.?tokens?$/, /input.*tokens?(?!.*cache)/]),
      output: findCol(headers, [/output.*tokens?/]),
      cacheWrite: findCol(headers, [/cache.*(creation|write)/]),
      cacheRead: findCol(headers, [/cache.*read/]),
      cost: findCol(headers, [/cost/, /amount/, /usd/]),
    }
    console.log(`\nConsole export — ${csvPath}\n  columns: ${JSON.stringify(col)} of ${JSON.stringify(headers)}`)
    if (col.model < 0) throw new Error('could not find a model column in the CSV')
    const agg = new Map()
    for (const r of table.slice(1)) {
      const key = (r[col.model] || '').trim()
      if (!key) continue
      let b = agg.get(key)
      if (!b) agg.set(key, (b = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0 }))
      const n = (i) => (i >= 0 ? Number(String(r[i]).replace(/[^0-9.\-]/g, '')) || 0 : 0)
      b.input += n(col.input)
      b.output += n(col.output)
      b.cacheWrite += n(col.cacheWrite)
      b.cacheRead += n(col.cacheRead)
      b.cost += n(col.cost)
    }
    console.log('\nmodel'.padEnd(31), 'ledger in'.padStart(11), 'console in'.padStart(11), 'ledger out'.padStart(11), 'console out'.padStart(12), 'ledger $'.padStart(10), 'console $'.padStart(10), 'diff'.padStart(7))
    for (const b of models) {
      // Console model names may carry a date suffix or a display name; match on the longest common prefix.
      const c = agg.get(b.model) || [...agg.entries()].find(([k]) => k.startsWith(b.model) || b.model.startsWith(k))?.[1]
      if (!c) { console.log(b.model.padEnd(30), 'not in the export'); continue }
      const d = col.cost >= 0 ? pctDiff(b.cost / USD, c.cost) : pctDiff(b.input + b.cacheRead + b.cacheWrite, c.input + c.cacheRead + c.cacheWrite)
      if (d > tolerance) ok = false
      console.log(b.model.padEnd(30), String(b.input).padStart(11), String(c.input).padStart(11), String(b.output).padStart(11), String(c.output).padStart(12), usd(b.cost).padStart(10), `$${c.cost.toFixed(2)}`.padStart(10), `${d.toFixed(1)}%`.padStart(7))
    }
    if (col.cost >= 0) {
      const consoleTotal = [...agg.values()].reduce((s, b) => s + b.cost, 0)
      const d = pctDiff(total / USD, consoleTotal)
      if (d > tolerance) ok = false
      console.log(`\n  total: ledger ${usd(total)} vs console $${consoleTotal.toFixed(2)} → ${d.toFixed(1)}% ${d <= tolerance ? 'OK' : 'OVER TOLERANCE'}`)
    }
  }

  if (invoice != null && Number.isFinite(invoice)) {
    const d = pctDiff(total / USD, invoice)
    if (d > tolerance) ok = false
    console.log(`\nInvoice check: ledger ${usd(total)} vs invoice $${invoice.toFixed(2)} → ${d.toFixed(1)}% (tolerance ${tolerance}%) ${d <= tolerance ? 'OK' : 'OVER TOLERANCE'}`)
  }

  if (!csvPath && invoice == null) console.log('\n(no --invoice or --csv given: ledger printed for a by-hand read)')
  process.exit(ok ? 0 : 1)
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message || e)
    process.exit(2)
  })
} else {
  module.exports = { parseCsv, findCol, byModel, monthBounds }
}
