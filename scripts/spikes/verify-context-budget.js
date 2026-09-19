#!/usr/bin/env node
/**
 * Pure-rule verification of the portal context budgeter (cost-controls
 * Phase 3, lib/ai/context-budget.ts). No API key, no database.
 *
 *   node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json && node scripts/spikes/verify-context-budget.js
 */
const path = require('path')
const build = path.join(__dirname, '../../.spike-build/lib')
const { CONTEXT_BUDGET, clipToTokens, fitAttachment, assembleContext } = require(path.join(build, 'ai/context-budget.js'))
const { estimateTokens, resolveModel } = require(path.join(build, 'ai/models.js'))

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`)
}

const model = resolveModel('portal_chat')
const tok = (t) => (t ? estimateTokens(t.length, model) : 0)
/** Text estimated at (just under) n tokens for the routed model's tokenizer. */
const text = (n, seed = 'x') => {
  let chars = n * 4
  while (chars > 0 && estimateTokens(chars, model) > n) chars--
  return `${seed} `.repeat(Math.ceil(chars / (seed.length + 1))).slice(0, chars)
}

console.log('[1] clipToTokens')
{
  const short = clipToTokens('hello world', 100, model)
  check('short text untouched', short.text === 'hello world' && !short.clipped)
  const long = clipToTokens(text(5000), 1000, model)
  check('long text clipped to the budget', long.clipped && tok(long.text) <= 1000 && long.text.endsWith('…'), `tokens=${tok(long.text)}`)
  check('empty stays empty', clipToTokens('', 10, model).text === '')
}

console.log('[2] fitAttachment')
{
  const small = fitAttachment('What do you make of this?', { filename: 'plan.pdf', text: text(500) }, model)
  check('small upload kept whole, no note', small.note === null && small.omittedChars === 0 && small.text.length > 0)
  const big = fitAttachment('What do you make of this?', { filename: 'annual-review.pdf', text: text(20000) }, model)
  check('huge upload trimmed to the CURRENT budget', big.text && tok(big.text) + tok('What do you make of this?') < CONTEXT_BUDGET.CURRENT, `tokens=${big.text && tok(big.text)}`)
  check('trimmed upload carries a client-facing note naming the file', /annual-review\.pdf/.test(big.note || '') && big.omittedChars > 0)
  check('no attachment → nothing', fitAttachment('hi', null, model).text === null)
}

console.log('[3] assembleContext — per-slice budgets')
{
  const excerpts = Array.from({ length: 15 }, (_, i) => text(1000, `e${i}`))
  const history = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: text(1000, `h${i}`) }))
  const out = assembleContext({
    model,
    system: text(20000, 's'),
    snapshot: text(9000, 'n'),
    excerpts,
    historySummary: text(5000, 'sum'),
    history,
    current: text(9000, 'c'),
  })
  const L = out.log
  check('system clipped to its budget (never more)', L.system.tokens <= CONTEXT_BUDGET.SYSTEM && L.system.clipped)
  check('snapshot within budget', L.snapshot.tokens <= CONTEXT_BUDGET.SNAPSHOT && L.snapshot.clipped)
  check('excerpts kept whole, most relevant first, within budget', L.excerpts.tokens <= CONTEXT_BUDGET.EXCERPTS && /e0 /.test(out.tail) && !/e14 /.test(out.tail) && L.excerpts.clipped)
  check('history keeps the NEWEST turns, in order', out.history.length > 0 && out.history[out.history.length - 1].content.startsWith('h19') && out.history.every((h, i) => i === 0 || Number(h.content.match(/^h(\d+)/)[1]) > Number(out.history[i - 1].content.match(/^h(\d+)/)[1])))
  check('history + summary within budget; summary capped at a third', L.history.tokens <= CONTEXT_BUDGET.HISTORY && tok(out.tail.match(/EARLIER IN THIS CONVERSATION[^]*?(?=\n\nEARLIER SESSIONS|$)/)[0]) <= CONTEXT_BUDGET.HISTORY / 3 + 30)
  check('current clipped, never dropped', L.current.tokens <= CONTEXT_BUDGET.CURRENT && out.current.length > 0 && L.current.clipped)
  check('total within the ceiling', L.total <= CONTEXT_BUDGET.CEILING, `total=${L.total}`)
  check('tail carries the summary + excerpt headers', /EARLIER IN THIS CONVERSATION/.test(out.tail) && /EARLIER SESSIONS AND NOTES RELEVANT/.test(out.tail))
  check('no drops needed at the default budgets', L.drops.length === 0)
}

console.log('[4] ceiling drop order: excerpts → history → snapshot, never system')
{
  const base = {
    model,
    system: text(12000, 's'),
    snapshot: text(6000, 'n'),
    excerpts: Array.from({ length: 5 }, (_, i) => text(2000, `e${i}`)),
    historySummary: '',
    history: Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: text(1000, `h${i}`) })),
    current: text(6000, 'c'),
  }
  const b = (ceiling) => ({ ...CONTEXT_BUDGET, CEILING: ceiling })
  // 40k fits exactly; 34k must shed excerpts partially
  const a = assembleContext(base, b(34000))
  check('34k: excerpts shed first (partially), history intact', a.log.excerpts.clipped && !a.log.excerpts.dropped && !a.log.history.clipped && a.log.total <= 34000, JSON.stringify(a.log.drops))
  const c = assembleContext(base, b(28000))
  check('28k: excerpts dropped entirely, then history shed', c.log.drops[0] === 'excerpts' && c.log.history.clipped && c.log.total <= 28000, JSON.stringify(c.log))
  const d = assembleContext(base, b(20000))
  check('20k: excerpts + history dropped, snapshot clipped, system intact', d.log.drops.includes('excerpts') && d.log.drops.includes('history') && d.log.snapshot.clipped && !d.log.system.dropped && d.system === base.system && d.log.total <= 20000, JSON.stringify(d.log.drops))
  const e = assembleContext(base, b(15000))
  check('15k: snapshot dropped too; system never touched', e.log.drops.includes('snapshot') && e.snapshot === '' && e.system === base.system && !e.log.system.dropped, JSON.stringify(e.log.drops))
  check('drop order recorded as excerpts, history, snapshot', JSON.stringify(e.log.drops) === JSON.stringify(['excerpts', 'history', 'snapshot']))
  check('the current message survives every drop', e.current === base.current)
}

console.log('[5] empty input')
{
  const out = assembleContext({ model, system: 'sys', snapshot: '', excerpts: [], historySummary: '', history: [], current: 'hi' })
  check('empty slices → empty tail, no drops, nothing clipped', out.tail === '' && out.log.drops.length === 0 && !Object.values(out.log).some((v) => v && v.clipped))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
