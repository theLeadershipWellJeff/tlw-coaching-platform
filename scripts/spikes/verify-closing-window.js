// v0.5.4 closing window (the coach's offer) + accuracy soundings — pure engine
// rules, no API key needed.
// Build first: node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json
// Then: node scripts/spikes/verify-closing-window.js
const assert = require('assert')
const Module = require('module')
const path = require('path')
const ROOT = path.resolve(__dirname, '..', '..')
const orig = Module._resolveFilename
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith('@/')) {
    const rel = request.slice(2)
    try { return orig.call(this, path.join(ROOT, '.spike-build', rel), parent, ...rest) } catch {}
    return orig.call(this, path.join(ROOT, rel), parent, ...rest)
  }
  return orig.call(this, request, parent, ...rest)
}
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'unused'
const eng = require(path.join(ROOT, '.spike-build/lib/scoring/engine.js'))

// --- clock helpers -----------------------------------------------------------
assert.strictEqual(eng.parseClock('50:40'), 50 * 60 + 40)
assert.strictEqual(eng.parseClock('00:53:21'), 53 * 60 + 21)
assert.strictEqual(eng.parseClock('1:02:03'), 3723)
assert.strictEqual(eng.parseClock('12:75'), null)
assert.strictEqual(eng.parseClock('nope'), null)
assert.strictEqual(eng.formatClock(3723), '01:02:03')
assert.strictEqual(eng.spanStart('50:40-53:21'), 3040)
assert.strictEqual(eng.spanStart('00:50:40 – 00:53:21'), 3040)
assert.strictEqual(eng.spanStart(undefined), null)

// A synthetic 55-minute Plaud-style transcript: one timestamped turn a minute.
function transcript(minutes, extra = '') {
  const lines = ['# 2026-09-08 10:00:00', '']
  for (let m = 0; m <= minutes; m++) {
    const who = m % 2 === 0 ? 'Speaker 1' : 'Speaker 2'
    lines.push(`${who} 00:${String(m).padStart(2, '0')}:${m % 2 === 0 ? '05' : '35'}`)
    lines.push(m % 2 === 0 ? 'What would be most useful to look at today?' : 'I keep circling the same decision.')
    lines.push('')
  }
  return lines.join('\n') + extra
}
const t55 = transcript(55, '\nSpeaker 1 00:48:30\nCan I change hats for a minute?\n\nSpeaker 2 00:48:40\nSure, go ahead.\n')
const timing = eng.transcriptTiming(t55)
assert.ok(timing, 'timing derived from timestamps')
assert.strictEqual(timing.start, 5)
assert.strictEqual(timing.end, 55 * 60 + 35)
// Too few timestamps → null (fail-loud path)
assert.strictEqual(eng.transcriptTiming('Coach: hi 00:01:00\nClient: hi 00:02:00'), null)
// A clock time in prose does not create a session ("meet at 10:30")
assert.strictEqual(eng.transcriptTiming('we said 10:30 and 11:45 and 3:15 x 9:00 8:00 7:00 6:00 5:00 4:00'), null)

const ctx = {
  coachName: 'Jeff',
  clientInitials: 'T.S.',
  sessionNumber: 5,
  sessionNumberConfidence: 'confirmed',
  sessionDate: '2026-09-08',
  agreementOnFile: true,
  recordingAuthorized: true,
}
function raw(moves, closing_window, extra = {}) {
  return {
    session: { standing_engagement: true },
    competencies: [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({
      id,
      score: 3.5,
      evidence: 'x',
      subcompetency_refs: [],
      ...(id === 6 ? { dimensions: { emotional: { score: 3.5 }, cognitive_structural: { score: 3.5 } } } : {}),
    })),
    metrics: {
      source: 'parsed',
      coach_talk_time_pct_raw: 30,
      flagged_emotion_count: 3,
      feeling_explorations: 1,
      question_to_statement: '1.5:1',
      utterance_taxonomy: { questions: 20, accuracy_soundings: 4, evocative_reflections: 5, co_thinking: 1, consultative_telling: 8, process_logistics: 2, contracting: 0 },
      consultant_moves: { count: moves.length, unit: 'envelope', moves },
      closing_window,
    },
    verbal_consent_to_record: true,
    gates_triggered: {},
    win: {},
    evidence_moments: [],
    ...extra,
  }
}

// 1. T.S. shape: two UNSIGNALED envelopes inside the window → no exemption, red execution.
{
  const r = eng.enforceRules(raw([
    { description: 'budget advice', span: '50:40-53:21', signaled: false, permissioned: false, brief: false, floor_returned: true },
    { description: 'board access', span: '53:30-55:00', signaled: false, permissioned: false, brief: true, floor_returned: false },
  ], { basis: 'timestamps', signaled: false }), ctx, t55)
  const cm = r.metrics.consultant_moves
  assert.strictEqual(cm.count, 2)
  assert.strictEqual(cm.execution_flag, 'red')
  assert.strictEqual(r.metrics.closing_window.exempt_count, 0)
  assert.strictEqual(r.metrics.closing_window.signaled, false)
  assert.strictEqual(r.metrics.closing_window.basis, 'timestamps')
  assert.strictEqual(r.metrics.closing_window.opens_at, eng.formatClock(5 + 0.8 * (55 * 60 + 35 - 5)))
  assert.ok(!r.integrity.flags_for_manual_review.some((f) => f.startsWith('closing_window')))
  assert.strictEqual(r.metrics.utterance_taxonomy.accuracy_soundings, 4)
}

// 2. Signaled coach's offer at 48:30 (window opens ~44:29): exempt, still counted,
//    execution flag reads the non-exempt envelope only. A later unsignaled
//    envelope after the signal is covered by it ("from that moment on").
{
  const r = eng.enforceRules(raw([
    { description: 'mid-session framework', span: '20:00-22:00', signaled: true, permissioned: false, brief: true, floor_returned: true },
    { description: 'closing offer', span: '48:30-53:21', signaled: true, permissioned: true, brief: false, floor_returned: true, closing_window_exempt: true, signal_quote: 'Can I change hats for a minute?' },
    { description: 'follow-on advice', span: '54:00-55:20', signaled: false, permissioned: false, brief: false, floor_returned: false, closing_window_exempt: true },
  ], { basis: 'timestamps', signaled: true, signal_at: '00:48:30', signal_quote: 'Can I change hats for a minute?' }), ctx, t55)
  const cm = r.metrics.consultant_moves
  assert.strictEqual(cm.count, 3, 'coach offers stay in the count')
  assert.strictEqual(cm.moves[0].closing_window_exempt, false)
  assert.strictEqual(cm.moves[1].closing_window_exempt, true)
  assert.strictEqual(cm.moves[1].signal_quote, 'Can I change hats for a minute?')
  assert.strictEqual(cm.moves[2].closing_window_exempt, true)
  assert.strictEqual(cm.execution_flag, 'amber', 'mid-session 3/4 → amber; exempt rows excluded')
  assert.strictEqual(r.metrics.closing_window.exempt_count, 2)
  assert.strictEqual(r.metrics.closing_window.signaled, true)
  assert.strictEqual(r.metrics.closing_window.signal_at, '00:48:30')
  assert.deepStrictEqual(r.integrity.flags_for_manual_review.filter((f) => f.startsWith('closing_window')), [])
  assert.strictEqual(r.integrity.evidence_verbatim_check, 'pass', 'signal quote verified verbatim')
}

// 3. Claimed exemption but the signal is BEFORE the window (30:00) → revoked + mismatch flag.
{
  const r = eng.enforceRules(raw([
    { description: 'early hat change', span: '30:00-40:00', signaled: true, permissioned: true, brief: false, floor_returned: true, closing_window_exempt: true },
  ], { basis: 'timestamps', signaled: true, signal_at: '00:30:00' }), ctx, t55)
  const cm = r.metrics.consultant_moves
  assert.strictEqual(cm.moves[0].closing_window_exempt, false)
  assert.strictEqual(cm.execution_flag, 'amber')
  assert.strictEqual(r.metrics.closing_window.signaled, false)
  assert.ok(r.integrity.flags_for_manual_review.includes('closing_window_timing_mismatch'))
}

// 4. Claimed exemption on an envelope that opened BEFORE a valid signal → revoked + mismatch.
{
  const r = eng.enforceRules(raw([
    { description: 'pre-signal advice', span: '45:00-47:00', signaled: false, permissioned: false, brief: true, floor_returned: true, closing_window_exempt: true },
    { description: 'closing offer', span: '48:30-53:00', signaled: true, permissioned: true, brief: true, floor_returned: true, closing_window_exempt: true },
  ], { basis: 'timestamps', signaled: true, signal_at: '00:48:30' }), ctx, t55)
  const cm = r.metrics.consultant_moves
  assert.strictEqual(cm.moves[0].closing_window_exempt, false)
  assert.strictEqual(cm.moves[1].closing_window_exempt, true)
  assert.ok(r.integrity.flags_for_manual_review.includes('closing_window_timing_mismatch'))
}

// 5. Exempt claimed with NO signal anywhere → revoked (the signal is the price).
{
  const r = eng.enforceRules(raw([
    { description: 'unsignaled late advice', span: '50:00-54:00', signaled: false, permissioned: false, brief: false, floor_returned: false, closing_window_exempt: true },
  ], { basis: 'timestamps', signaled: false }), ctx, t55)
  assert.strictEqual(r.metrics.consultant_moves.moves[0].closing_window_exempt, false)
  assert.strictEqual(r.metrics.consultant_moves.execution_flag, 'red')
  assert.ok(r.integrity.flags_for_manual_review.includes('closing_window_timing_mismatch'))
}

// 6. No usable timestamps: the model's estimate is honored but flagged unverified.
{
  const plain = 'Coach: What would be useful today?\nClient: The decision.\n'.repeat(40) + 'Coach: May I give some advice?\nClient: Please.\n'
  const r = eng.enforceRules(raw([
    { description: 'closing offer', span: '48:30-53:21', signaled: true, permissioned: true, brief: false, floor_returned: true, closing_window_exempt: true, signal_quote: 'May I give some advice?' },
  ], { basis: 'estimated', signaled: true, signal_at: '00:48:30', session_start: '00:00:00', session_end: '00:55:00', signal_quote: 'May I give some advice?' }), ctx, plain)
  assert.strictEqual(r.metrics.closing_window.basis, 'estimated')
  assert.strictEqual(r.metrics.closing_window.opens_at, '00:44:00')
  assert.strictEqual(r.metrics.consultant_moves.moves[0].closing_window_exempt, true)
  assert.strictEqual(r.metrics.consultant_moves.execution_flag, 'green', 'no non-exempt envelopes')
  assert.ok(r.integrity.flags_for_manual_review.includes('closing_window_unverified'))
  assert.ok(!r.integrity.flags_for_manual_review.includes('closing_window_timing_mismatch'))
}

// 7. No timestamps AND no exemption claimed → no closing-window flags at all.
{
  const plain = 'Coach: hello\nClient: hi\n'.repeat(30)
  const r = eng.enforceRules(raw([
    { description: 'advice', span: '10:00-12:00', signaled: false, permissioned: false, brief: true, floor_returned: true },
  ], { basis: 'unknown', signaled: false }), ctx, plain)
  assert.strictEqual(r.metrics.closing_window.basis, 'unknown')
  assert.strictEqual(r.metrics.closing_window.exempt_count, 0)
  assert.ok(!r.integrity.flags_for_manual_review.some((f) => f.startsWith('closing_window')))
}

// 8. Unavailable metrics → closing_window null, no flags.
{
  const r = eng.enforceRules({ ...raw([], null), metrics: { source: 'unavailable' } }, ctx, t55)
  assert.strictEqual(r.metrics.closing_window, null)
  assert.strictEqual(r.metrics.consultant_moves, null)
}

// 9. A signal quote that is NOT in the transcript fails the L0.3 verbatim check.
{
  const r = eng.enforceRules(raw([
    { description: 'closing offer', span: '48:30-53:21', signaled: true, permissioned: true, brief: true, floor_returned: true, closing_window_exempt: true, signal_quote: 'Let me put my consultant hat on now' },
  ], { basis: 'timestamps', signaled: true, signal_at: '00:48:30', signal_quote: 'Let me put my consultant hat on now' }), ctx, t55)
  assert.strictEqual(r.integrity.evidence_verbatim_check, 'fail')
  assert.ok(r.integrity.flags_for_manual_review.includes('evidence_verbatim_failed'))
}

// 10. Pre-v0.5.4 model output (no closing_window block, no per-move fields) still parses.
{
  const r = eng.enforceRules(raw([
    { description: 'advice', span: '50:40-53:21', signaled: false, permissioned: false, brief: false, floor_returned: true },
  ], undefined), ctx, t55)
  assert.strictEqual(r.metrics.closing_window.basis, 'timestamps')
  assert.strictEqual(r.metrics.closing_window.exempt_count, 0)
  assert.strictEqual(r.metrics.consultant_moves.execution_flag, 'red')
}

console.log('verify-closing-window: all checks passed')
