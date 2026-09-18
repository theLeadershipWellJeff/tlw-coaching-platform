#!/usr/bin/env node
/**
 * Pure-rule verification for the AI gateway (Phase 1 of the cost-controls
 * brief). No API key, no database — checks lib/ai/models.ts routing and
 * lib/ai/pricing.ts arithmetic, which are the deterministic parts of the
 * budget math ("no AI in budget math").
 *
 *   node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json && node scripts/spikes/verify-ai-gateway.js
 */
const path = require('path')
const build = path.join(__dirname, '..', '..', '.spike-build', 'lib')
const models = require(path.join(build, 'ai/models.js'))
const pricing = require(path.join(build, 'ai/pricing.js'))

let pass = 0
let fail = 0
function check(name, cond, detail) {
  if (cond) {
    pass++
    console.log(`  ok   ${name}`)
  } else {
    fail++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const savedEnv = { ...process.env }
function withEnv(vars, fn) {
  for (const k of Object.keys(process.env)) if (/_MODEL$|^AI_MODEL_/.test(k)) delete process.env[k]
  Object.assign(process.env, vars)
  try {
    return fn()
  } finally {
    for (const k of Object.keys(process.env)) if (/_MODEL$|^AI_MODEL_/.test(k)) delete process.env[k]
    for (const k of Object.keys(savedEnv)) if (/_MODEL$|^AI_MODEL_/.test(k)) process.env[k] = savedEnv[k]
  }
}
// silence the one-time deprecation warnings during the run
const warn = console.warn
console.warn = () => {}

console.log('models.ts — routing')
withEnv({}, () => {
  check('portal_chat → claude-opus-5 (brief)', models.resolveModel('portal_chat') === 'claude-opus-5')
  check('portal_degraded → claude-sonnet-5 (brief)', models.resolveModel('portal_degraded') === 'claude-sonnet-5')
  check('background_compact → claude-haiku-4-5-20251001 (brief)', models.resolveModel('background_compact') === 'claude-haiku-4-5-20251001')
  check('transcript_title keeps its old default (haiku)', models.resolveModel('transcript_title') === 'claude-haiku-4-5-20251001')
  for (const p of ['scoring', 'scoring_suggest', 'growth_pass', 'growth_bands', 'nudge_extract', 'nudge_draft', 'note_narrative', 'note_client_email', 'session_prep', 'goals_generate', 'plan_session', 'portal_weekly_plan_extract']) {
    check(`${p} keeps today's model (claude-sonnet-4-6)`, models.resolveModel(p) === 'claude-sonnet-4-6')
  }
  check('every default is a known, non-retired model', Object.values(models.DEFAULT_MODELS).every((m) => models.KNOWN_MODELS[m] && !models.RETIRED_MODELS.has(m)))
  check('portal effort = medium', models.effortFor('portal_chat', 'claude-opus-5') === 'medium')
  check('coach-side purposes send no effort (API default)', models.effortFor('scoring', 'claude-sonnet-4-6') === undefined)
  check('effort never sent to Haiku (unsupported)', models.effortFor('portal_chat', 'claude-haiku-4-5-20251001') === undefined)
  let threw = false
  try {
    models.resolveModel('not_a_purpose')
  } catch {
    threw = true
  }
  check('unknown purpose throws', threw)
})
withEnv({ AI_MODEL_SCORING: 'claude-sonnet-5' }, () => {
  check('AI_MODEL_<PURPOSE> override wins', models.resolveModel('scoring') === 'claude-sonnet-5')
})
withEnv({ AI_MODEL_SCORING: 'claude-sonnet-5', SCORING_MODEL: 'claude-opus-4-8' }, () => {
  check('AI_MODEL_SCORING beats legacy SCORING_MODEL', models.resolveModel('scoring') === 'claude-sonnet-5')
})
withEnv({ SCORING_MODEL: 'claude-opus-4-8' }, () => {
  check('legacy SCORING_MODEL still honoured for scoring', models.resolveModel('scoring') === 'claude-opus-4-8')
  check('legacy SCORING_MODEL still honoured for scoring_suggest (old chain)', models.resolveModel('scoring_suggest') === 'claude-opus-4-8')
})
withEnv({ SUGGEST_MODEL: 'claude-sonnet-5', SCORING_MODEL: 'claude-opus-4-8' }, () => {
  check('SUGGEST_MODEL beats SCORING_MODEL for growth_pass (old precedence)', models.resolveModel('growth_pass') === 'claude-sonnet-5')
  check('scoring itself ignores SUGGEST_MODEL', models.resolveModel('scoring') === 'claude-opus-4-8')
})
withEnv({ SCORING_MODEL: 'claude-sonnet-4-20250514' }, () => {
  check('retired override ignored → default', models.resolveModel('scoring') === 'claude-sonnet-4-6')
})
withEnv({ AI_MODEL_SCORING: 'claude-made-up-9' }, () => {
  check('unknown (unpriced) override ignored → default', models.resolveModel('scoring') === 'claude-sonnet-4-6')
})
withEnv({ PORTAL_CHAT_MODEL: 'claude-sonnet-4-6' }, () => {
  check('PORTAL_CHAT_MODEL does NOT move portal_chat off Opus 5', models.resolveModel('portal_chat') === 'claude-opus-5')
  check('PORTAL_CHAT_MODEL still configures the weekly-plan extraction', models.resolveModel('portal_weekly_plan_extract') === 'claude-sonnet-4-6')
})
withEnv({ AI_MODEL_PORTAL_CHAT: 'claude-sonnet-5' }, () => {
  check('AI_MODEL_PORTAL_CHAT overrides portal_chat', models.resolveModel('portal_chat') === 'claude-sonnet-5')
})

console.log('models.ts — estimator')
check('v2 tokenizer estimates ~30% more than v1 for the same text', models.estimateTokens(10000, 'claude-opus-5') > models.estimateTokens(10000, 'claude-sonnet-4-6') * 1.25)
check('estimate is ≥ 0 and integer', models.estimateTokens(0, 'claude-opus-5') === 0 && Number.isInteger(models.estimateTokens(1234, 'claude-opus-5')))
check('unknown model estimates with the conservative (v2) rate', models.estimateTokens(3100, 'nope') === 1000)

console.log('pricing.ts — arithmetic (USD micros, per-MTok micros)')
const opus = { model: 'claude-opus-5', input_per_mtok_micros: 5_000_000, output_per_mtok_micros: 25_000_000, cache_read_per_mtok_micros: 500_000, cache_write_per_mtok_micros: 6_250_000, effective_from: '2026-09-18' }
check('1 MTok input on Opus 5 = $5.00', pricing.tokensCostMicros(1_000_000, opus.input_per_mtok_micros) === 5_000_000)
check('1 token rounds UP to 5 micros (never 0)', pricing.tokensCostMicros(1, opus.input_per_mtok_micros) === 5)
check('0 tokens = 0', pricing.tokensCostMicros(0, opus.input_per_mtok_micros) === 0)
const usage = { input_tokens: 30_000, output_tokens: 900, cache_read_tokens: 0, cache_write_tokens: 0 }
check('30k in + 900 out on Opus 5 = $0.1725', pricing.usageCostMicros(usage, opus) === 150_000 + 22_500)
const cached = { input_tokens: 2_000, output_tokens: 900, cache_read_tokens: 28_000, cache_write_tokens: 0 }
check('same turn with 28k cached reads = $0.0465 (cache read at 0.1×)', pricing.usageCostMicros(cached, opus) === 10_000 + 22_500 + 14_000)
check('cache write priced at 1.25× input', pricing.usageCostMicros({ input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 1_000_000 }, opus) === 6_250_000)
check('worst case = est input × input + max_tokens × output', pricing.worstCaseMicros(40_000, 4_000, opus) === 200_000 + 100_000)
check('worst case ≥ any actual with input ≤ estimate and output ≤ max_tokens', pricing.worstCaseMicros(30_000, 900, opus) >= pricing.usageCostMicros(usage, opus))
check('formatUsd', pricing.formatUsd(172_500) === '$0.17' && pricing.formatUsd(null) === '—')
const big = { input_tokens: 900_000, output_tokens: 128_000, cache_read_tokens: 0, cache_write_tokens: 0 }
check('a 1M-context request stays a safe integer', Number.isSafeInteger(pricing.usageCostMicros(big, opus)) && pricing.usageCostMicros(big, opus) === 4_500_000 + 3_200_000)

console.warn = warn
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
