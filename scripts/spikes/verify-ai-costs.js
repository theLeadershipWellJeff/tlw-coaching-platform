#!/usr/bin/env node
/**
 * Pure-rule verification of the AI cost cockpit arithmetic (cost-controls
 * Phase 4, lib/ai/costs-math.ts). No API key, no database.
 *
 *   node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json && node scripts/spikes/verify-ai-costs.js
 */
const path = require('path')
const build = path.join(__dirname, '../../.spike-build/lib')
const m = require(path.join(build, 'ai/costs-math.js'))

let pass = 0
let fail = 0
function check(name, ok, detail) {
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`)
}
const USD = 1_000_000
const row = (o) => ({
  coach_id: 'coach-a', client_id: null, principal: 'coach', purpose: 'scoring', feature: 'scoring', model: 'claude-sonnet-5',
  status: 'settled', reserved_usd_micros: 2 * USD, actual_usd_micros: 1 * USD,
  input_tokens: 1000, output_tokens: 200, cache_read_tokens: 0, cache_write_tokens: 0, created_at: '2026-09-10T10:00:00Z', ...o,
})

console.log('[1] row cost')
check('settled → actual', m.rowCostMicros(row({})) === 1 * USD)
check('settled without actual → reserved', m.rowCostMicros(row({ actual_usd_micros: null })) === 2 * USD)
check('reserved → worst case', m.rowCostMicros(row({ status: 'reserved', actual_usd_micros: null })) === 2 * USD)
check('released → free', m.rowCostMicros(row({ status: 'released' })) === 0)

console.log('[2] months')
check('monthKey is the UTC first', m.monthKey(new Date('2026-09-19T23:30:00Z')) === '2026-09-01')
check('parseMonth YYYY-MM', m.parseMonth('2026-09') === '2026-09-01' && m.parseMonth('2026-09-15') === '2026-09-01')
check('parseMonth rejects junk', m.parseMonth('13/2026') === null && m.parseMonth('2026-13') === null && m.parseMonth('') === null)
const b = m.monthBounds('2026-09-01', new Date('2026-09-19T12:00:00Z'))
check('bounds: 30 days, day 19, current', b.days === 30 && b.elapsedDays === 19 && b.isCurrent && b.startIso === '2026-09-01T00:00:00.000Z' && b.endIso === '2026-10-01T00:00:00.000Z', JSON.stringify(b))
const past = m.monthBounds('2026-08-01', new Date('2026-09-19T12:00:00Z'))
check('past month: fully elapsed, not current', past.days === 31 && past.elapsedDays === 31 && !past.isCurrent)
const future = m.monthBounds('2026-10-01', new Date('2026-09-19T12:00:00Z'))
check('future month: nothing elapsed', future.elapsedDays === 0 && !future.isCurrent)
check('projection: $19 over 19 of 30 days → $30', m.projectMonthEnd(19 * USD, b) === 30 * USD)
check('projection of a future month is 0', m.projectMonthEnd(5 * USD, future) === 0)

console.log('[3] aggregation')
const rows = [
  row({}), // coach scoring $1
  row({ purpose: 'session_prep', feature: 'session_prep', actual_usd_micros: 0.5 * USD, coach_id: 'coach-b' }),
  row({ principal: 'client', client_id: 'c1', purpose: 'portal_chat', feature: 'portal_chat:general', model: 'claude-opus-5', actual_usd_micros: 0.4 * USD, input_tokens: 1000, cache_read_tokens: 9000, cache_write_tokens: 0, created_at: '2026-09-12T10:00:00Z' }),
  row({ principal: 'client', client_id: 'c1', purpose: 'portal_chat', feature: 'portal_chat:general', model: 'claude-opus-5', actual_usd_micros: 0.6 * USD, input_tokens: 1000, cache_read_tokens: 9000, created_at: '2026-09-13T10:00:00Z' }),
  row({ principal: 'client', client_id: 'c2', purpose: 'portal_chat', feature: 'portal_chat:general', model: 'claude-opus-5', actual_usd_micros: 3 * USD, input_tokens: 2000, cache_read_tokens: 0 }),
  row({ principal: 'client', client_id: 'c2', purpose: 'background_compact', feature: 'portal_chat:summary', model: 'claude-haiku-4-5-20251001', status: 'reserved', reserved_usd_micros: 0.01 * USD, actual_usd_micros: null }),
  row({ principal: 'client', client_id: 'c3', purpose: 'portal_chat', model: 'claude-opus-5', status: 'released', reserved_usd_micros: 5 * USD, actual_usd_micros: null }),
  row({ principal: 'coach', client_id: 'c1', purpose: 'scoring', actual_usd_micros: 0.7 * USD }), // coach scoring OF c1 — not c1's spend
]
const a = m.aggregateUsage(rows)
check('total spend excludes released, includes reserved worst case', a.total.spent === (1 + 0.5 + 0.4 + 0.6 + 3 + 0.01 + 0.7) * USD, String(a.total.spent))
check('request counts by status', a.total.requests === 8 && a.total.settled === 6 && a.total.reserved === 1 && a.total.released === 1)
check('client principal = portal spend only', a.clientPrincipal.spent === (0.4 + 0.6 + 3 + 0.01) * USD)
check('coach principal', a.coachPrincipal.spent === (1 + 0.5 + 0.7) * USD)
check('byPurpose sorted by spend, keys right', a.byPurpose[0].key === 'portal_chat' && a.byPurpose[1].key === 'scoring' && a.byPurpose.map((x) => x.key).includes('background_compact'))
check('byModel: opus 5 first', a.byModel[0].key === 'claude-opus-5' && a.byModel[0].spent === 4 * USD)
check('byClient counts client-principal only (coach scoring of c1 excluded)', a.byClient.find((x) => x.key === 'c1').spent === 1 * USD && a.byClient.find((x) => x.key === 'c1').requests === 2)
check('byClient sorted: c2 first', a.byClient[0].key === 'c2')
check('byClient includes the released-only client with 0 spend', a.byClient.some((x) => x.key === 'c3' && x.spent === 0 && x.released === 1))
check('byCoach: coach-a carries its own + its clients\' calls', a.byCoach.find((x) => x.key === 'coach-a').requests === 7 && a.byCoach.find((x) => x.key === 'coach-b').spent === 0.5 * USD)
check('lastAt is the newest created_at', a.byClient.find((x) => x.key === 'c1').lastAt === '2026-09-13T10:00:00Z')
const c1 = a.byClient.find((x) => x.key === 'c1')
check('cache-read ratio: 18000 / (2000 + 18000) = 90%', Math.round(m.cacheReadRatio(c1) * 100) === 90)
check('cache-read ratio null with no input', m.cacheReadRatio({ input: 0, cacheRead: 0, cacheWrite: 0 }) === null)
check('portalChat bucket = the three portal_chat rows (released included in count, not spend)', a.portalChat.requests === 4 && a.portalChat.spent === 4 * USD)

console.log('[4] caps (mirror of ai_resolve_cap)')
const budgets = [
  { scope: 'org', scope_id: 'org1', period_month: null, cap_usd_micros: 500 * USD, soft_pct: 80, enabled: true },
  { scope: 'client', scope_id: 'default', period_month: null, cap_usd_micros: 10 * USD, soft_pct: 80, enabled: true },
  { scope: 'client', scope_id: 'default:portal', period_month: null, cap_usd_micros: 3 * USD, soft_pct: 80, enabled: true },
  { scope: 'client', scope_id: 'c1', period_month: null, cap_usd_micros: 20 * USD, soft_pct: 80, enabled: true },
  { scope: 'client', scope_id: 'c1', period_month: '2026-09-01', cap_usd_micros: 30 * USD, soft_pct: 80, enabled: true },
  { scope: 'client', scope_id: 'c9', period_month: null, cap_usd_micros: 99 * USD, soft_pct: 80, enabled: false },
  { scope: 'feature', scope_id: 'scoring', period_month: '2026-08-01', cap_usd_micros: 40 * USD, soft_pct: 80, enabled: true },
]
check('org cap resolves', m.resolveCap(budgets, 'org', ['org1'], '2026-09-01').cap === 500 * USD)
check('dated row outranks standing (Extend)', m.resolveCap(budgets, 'client', m.clientCapIds('c1', 'client'), '2026-09-01').cap === 30 * USD)
check('other month → standing row', m.resolveCap(budgets, 'client', m.clientCapIds('c1', 'client'), '2026-10-01').cap === 20 * USD)
check('coaching client falls to default $10', m.resolveCap(budgets, 'client', m.clientCapIds('c2', 'client'), '2026-09-01').cap === 10 * USD)
check('portal participant falls to default:portal $3', m.resolveCap(budgets, 'client', m.clientCapIds('c2', 'portal'), '2026-09-01').cap === 3 * USD)
check('null client_type reads as client', JSON.stringify(m.clientCapIds('x', null)) === JSON.stringify(['x', 'default:client', 'default']))
check('disabled rows never count', m.resolveCap(budgets, 'client', ['c9'], '2026-09-01') === null)
check('a cap dated another month does not apply', m.resolveCap(budgets, 'feature', ['scoring'], '2026-09-01') === null && m.resolveCap(budgets, 'feature', ['scoring'], '2026-08-01').cap === 40 * USD)
const ten = { cap: 10 * USD, softPct: 80, source: 'default' }
check('capState ok / soft / hard / none', m.capState(5 * USD, ten) === 'ok' && m.capState(8 * USD, ten) === 'soft' && m.capState(10 * USD, ten) === 'hard' && m.capState(5 * USD, null) === 'none')
check('pctOfCap rounds and caps at 999', m.pctOfCap(2.5 * USD, ten) === 25 && m.pctOfCap(200 * USD, ten) === 999 && m.pctOfCap(1, null) === null)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
