// Portal reminders + goal progress + notes: the pure rules, no database.
// Build first: node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json
// Then: node scripts/spikes/verify-portal-reminders.js
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
const R = require(path.join(ROOT, '.spike-build/lib/portal/reminders.js'))
const G = require(path.join(ROOT, '.spike-build/lib/portal/goals.js'))
const N = require(path.join(ROOT, '.spike-build/lib/portal/notes.js'))

// ── quarter anchors ──────────────────────────────────────────────────────────
assert.deepStrictEqual(R.quarterAnchor('2026-10-15'), { firstMonday: '2026-10-05', key: 'goals-2026Q4' })
assert.deepStrictEqual(R.quarterAnchor('2026-01-01'), { firstMonday: '2026-01-05', key: 'goals-2026Q1' })
assert.deepStrictEqual(R.quarterAnchor('2027-04-30'), { firstMonday: '2027-04-05', key: 'goals-2027Q2' })
assert.deepStrictEqual(R.quarterAnchor('2026-07-02'), { firstMonday: '2026-07-06', key: 'goals-2026Q3' })

const base = { id: 'c1', name: 'Pat Example', email: 'pat@example.com', status: 'active', clientType: 'client', timezone: 'America/Los_Angeles', portalFeatures: {}, accessExpiresAt: null, invitedAt: null, lastSeenAt: null }
const at = (s) => new Date(s)
const none = new Set()

// ── skips ────────────────────────────────────────────────────────────────────
assert.strictEqual(R.decideReminder({ ...base, invitedAt: '2026-09-01T00:00:00Z' }, at('2026-09-20T16:00:00Z'), none) && R.decideReminder({ ...base, email: null, invitedAt: '2026-09-01T00:00:00Z' }, at('2026-09-20T16:00:00Z'), none), null, 'no email → nothing')
assert.strictEqual(R.decideReminder({ ...base, status: 'archived', invitedAt: '2026-09-01T00:00:00Z' }, at('2026-09-20T16:00:00Z'), none), null)
assert.strictEqual(R.decideReminder({ ...base, portalFeatures: { reminders: false }, invitedAt: '2026-09-01T00:00:00Z' }, at('2026-09-20T16:00:00Z'), none), null)
assert.strictEqual(R.decideReminder({ ...base, accessExpiresAt: '2026-01-01T00:00:00Z', invitedAt: '2026-09-01T00:00:00Z' }, at('2026-09-20T16:00:00Z'), none), null)
assert.strictEqual(R.decideReminder({ ...base }, at('2026-09-20T16:00:00Z'), none), null, 'never invited, never seen → nothing')

// ── welcome ladder ───────────────────────────────────────────────────────────
const invited = { ...base, invitedAt: '2026-09-01T17:00:00Z' } // Sep 1 in LA
assert.strictEqual(R.decideReminder(invited, at('2026-09-03T16:00:00Z'), none), null, 'day 2 → nothing')
assert.deepStrictEqual(R.decideReminder(invited, at('2026-09-04T16:00:00Z'), none), { kind: 'welcome', periodKey: 'welcome-3d-2026-09-01' })
assert.strictEqual(R.decideReminder(invited, at('2026-09-05T16:00:00Z'), new Set(['welcome:welcome-3d-2026-09-01'])), null, 'day 4 after 3d sent → nothing')
assert.deepStrictEqual(R.decideReminder(invited, at('2026-09-11T16:00:00Z'), new Set(['welcome:welcome-3d-2026-09-01'])), { kind: 'welcome', periodKey: 'welcome-10d-2026-09-01' })
assert.deepStrictEqual(R.decideReminder(invited, at('2026-09-13T16:00:00Z'), none), { kind: 'welcome', periodKey: 'welcome-10d-2026-09-01' }, 'day 12, nothing sent → only the 10d rung')
assert.strictEqual(R.decideReminder(invited, at('2026-10-20T16:00:00Z'), new Set(['welcome:welcome-10d-2026-09-01'])), null, 'welcome ladder ends; no quarterly for someone never in')

// F1 (2026-10-07): the anchor stays on the invitation. Reminder emails mint
// 'reminder_login' tokens, which invitedAt (purpose='login' only) ignores, so
// day 3's send can no longer restart the ladder. With the anchor fixed at day 0:
const sent3 = new Set(['welcome:welcome-3d-2026-09-01'])
for (let d = 4; d <= 9; d++) {
  const day = String(1 + d).padStart(2, '0')
  assert.strictEqual(R.decideReminder(invited, at(`2026-09-${day}T16:00:00Z`), sent3), null, `day ${d} after the 3d rung → nothing`)
}
assert.deepStrictEqual(R.decideReminder(invited, at('2026-09-11T16:00:00Z'), sent3), { kind: 'welcome', periodKey: 'welcome-10d-2026-09-01' }, 'day 10 → the 10d rung')
const sentBoth = new Set(['welcome:welcome-3d-2026-09-01', 'welcome:welcome-10d-2026-09-01'])
for (const day of ['12', '15', '20', '30']) {
  assert.strictEqual(R.decideReminder(invited, at(`2026-09-${day}T16:00:00Z`), sentBoth), null, `day ${Number(day) - 1} after both rungs → nothing`)
}

// F2: access window + archive, the one auth/session test.
const A = require(path.join(ROOT, '.spike-build/lib/portal/archive.js'))
const nowMs = Date.parse('2026-10-07T12:00:00Z')
assert.strictEqual(A.isPortalAccessExpired(null, nowMs), false, 'no window → open')
assert.strictEqual(A.isPortalAccessExpired('not a date', nowMs), false, 'unparseable → open')
assert.strictEqual(A.isPortalAccessExpired('2026-10-07T11:59:59Z', nowMs), true, 'past → expired')
assert.strictEqual(A.isPortalAccessExpired('2026-12-31T00:00:00Z', nowMs), false, 'future → open')
assert.strictEqual(A.isPortalAccessBlocked({ portal_features: { archived: true }, portal_access_expires_at: null }), true, 'archived → blocked')
assert.strictEqual(A.isPortalAccessBlocked({ portal_features: {}, portal_access_expires_at: '2020-01-01T00:00:00Z' }), true, 'expired → blocked')
assert.strictEqual(A.isPortalAccessBlocked({ portal_features: { assessments: true }, portal_access_expires_at: '2099-01-01T00:00:00Z' }), false, 'live participant → open')
assert.strictEqual(A.isPortalAccessBlocked(null), false, 'no row → not blocked here (the cookie decides)')

// ── quarterly, for people who have been in ───────────────────────────────────
const seen = { ...base, invitedAt: '2026-06-01T00:00:00Z', lastSeenAt: '2026-09-28T16:00:00Z' }
assert.strictEqual(R.decideReminder(seen, at('2026-10-04T16:00:00Z'), none), null, 'Sunday before the first Monday → nothing')
assert.deepStrictEqual(R.decideReminder(seen, at('2026-10-05T16:00:00Z'), none), { kind: 'quarterly_goals', periodKey: 'goals-2026Q4' })
assert.deepStrictEqual(R.decideReminder(seen, at('2026-10-09T16:00:00Z'), none), { kind: 'quarterly_goals', periodKey: 'goals-2026Q4' }, 'still inside the 7-day window')
assert.strictEqual(R.decideReminder(seen, at('2026-10-09T16:00:00Z'), new Set(['quarterly_goals:goals-2026Q4'])), null, 'sent once → not again; not quiet long enough for comeback')
assert.deepStrictEqual(R.decideReminder(seen, at('2026-10-12T16:00:00Z'), new Set(['quarterly_goals:goals-2026Q4'])), { kind: 'comeback', periodKey: 'comeback-14d-2026-09-28' }, 'window closed; 14 days quiet → comeback')

// ── comeback ladder ──────────────────────────────────────────────────────────
const quiet = { ...base, invitedAt: '2026-06-01T00:00:00Z', lastSeenAt: '2026-08-01T16:00:00Z' } // Aug 1 in LA
assert.deepStrictEqual(R.decideReminder(quiet, at('2026-08-15T16:00:00Z'), none), { kind: 'comeback', periodKey: 'comeback-14d-2026-08-01' })
assert.strictEqual(R.decideReminder(quiet, at('2026-08-20T16:00:00Z'), new Set(['comeback:comeback-14d-2026-08-01'])), null)
assert.deepStrictEqual(R.decideReminder(quiet, at('2026-09-05T16:00:00Z'), new Set(['comeback:comeback-14d-2026-08-01'])), { kind: 'comeback', periodKey: 'comeback-35d-2026-08-01' })
assert.strictEqual(R.decideReminder(quiet, at('2026-09-20T16:00:00Z'), new Set(['comeback:comeback-14d-2026-08-01', 'comeback:comeback-35d-2026-08-01'])), null, 'ladder done → quarterly only')
// came back, went quiet again → ladder restarts on the new last-seen date
assert.deepStrictEqual(R.decideReminder({ ...quiet, lastSeenAt: '2026-09-10T16:00:00Z' }, at('2026-09-25T16:00:00Z'), new Set(['comeback:comeback-14d-2026-08-01', 'comeback:comeback-35d-2026-08-01'])), { kind: 'comeback', periodKey: 'comeback-14d-2026-09-10' })
// quarterly wins over comeback on the same day
assert.deepStrictEqual(R.decideReminder({ ...quiet, lastSeenAt: '2026-09-15T16:00:00Z' }, at('2026-10-05T16:00:00Z'), none), { kind: 'quarterly_goals', periodKey: 'goals-2026Q4' })

// timezone: 23:30 UTC Sunday Oct 4 is still Sunday in LA (no quarterly) but Monday Oct 5 in Amman (quarterly)
assert.strictEqual(R.decideReminder(seen, at('2026-10-04T23:30:00Z'), none), null)
assert.deepStrictEqual(R.decideReminder({ ...seen, timezone: 'Asia/Amman' }, at('2026-10-04T23:30:00Z'), none), { kind: 'quarterly_goals', periodKey: 'goals-2026Q4' })

// ── per-client settings ──────────────────────────────────────────────────────
assert.deepStrictEqual(R.normalizeReminderSettings(undefined), { weekly: false, weekly_day: 1, comeback: true, comeback_days: 14, quarterly: true })
assert.deepStrictEqual(R.normalizeReminderSettings({ comeback_days: 45, weekly_day: 9, weekly: true }), { weekly: true, weekly_day: 1, comeback: true, comeback_days: 14, quarterly: true }, 'invalid values fall back')
assert.deepStrictEqual(R.comebackRungs(30), [30, 75]); assert.deepStrictEqual(R.comebackRungs(60), [60, 150])
// comeback off → nothing at 14 days; 30-day setting → nothing at 20, comeback-30d at 31
assert.strictEqual(R.decideReminder({ ...quiet, portalFeatures: { reminder_settings: { comeback: false } } }, at('2026-08-20T16:00:00Z'), none), null)
assert.strictEqual(R.decideReminder({ ...quiet, portalFeatures: { reminder_settings: { comeback_days: 30 } } }, at('2026-08-21T16:00:00Z'), none), null)
assert.deepStrictEqual(R.decideReminder({ ...quiet, portalFeatures: { reminder_settings: { comeback_days: 30 } } }, at('2026-09-01T16:00:00Z'), none), { kind: 'comeback', periodKey: 'comeback-30d-2026-08-01' })
// quarterly off → nothing on the first Monday
assert.strictEqual(R.decideReminder({ ...seen, portalFeatures: { reminder_settings: { quarterly: false } } }, at('2026-10-05T16:00:00Z'), none), null)
// weekly: Monday Sep 14 2026 in LA, no plan for the week → plan nudge; a saved plan for 2026-09-14 → nothing; Tuesday → nothing
const weekly = { ...base, invitedAt: '2026-06-01T00:00:00Z', lastSeenAt: '2026-09-12T16:00:00Z', portalFeatures: { reminder_settings: { weekly: true, weekly_day: 1 } } }
assert.deepStrictEqual(R.decideReminder(weekly, at('2026-09-14T16:00:00Z'), none), { kind: 'weekly_plan', periodKey: 'plan-2026-09-14' })
assert.strictEqual(R.decideReminder({ ...weekly, plannedWeeks: ['2026-09-14'] }, at('2026-09-14T16:00:00Z'), none), null)
assert.strictEqual(R.decideReminder(weekly, at('2026-09-15T16:00:00Z'), none), null)
assert.strictEqual(R.decideReminder(weekly, at('2026-09-14T16:00:00Z'), new Set(['weekly_plan:plan-2026-09-14'])), null)
// weekly off by default
assert.strictEqual(R.decideReminder({ ...weekly, portalFeatures: {} }, at('2026-09-14T16:00:00Z'), none), null)
// comeback beats weekly on the same day (away 14+ days, Monday)
assert.deepStrictEqual(R.decideReminder({ ...weekly, lastSeenAt: '2026-08-20T16:00:00Z' }, at('2026-09-14T16:00:00Z'), none), { kind: 'comeback', periodKey: 'comeback-14d-2026-08-20' })

// ── goal progress ────────────────────────────────────────────────────────────
assert.strictEqual(G.clampProgress(103), 100); assert.strictEqual(G.clampProgress(-4), 0); assert.strictEqual(G.clampProgress('42.6'), 43); assert.strictEqual(G.clampProgress('x'), null)
const g0 = { title: 'Delegate more', description: '', metrics: ['2 handed off'], author: 'coach' }
let r = G.applyProgress(g0, 40, '2026-09-08T00:00:00Z')
assert.strictEqual(r.justCompleted, false); assert.strictEqual(r.goal.progress, 40); assert.strictEqual(r.goal.completed_at, null)
r = G.applyProgress(r.goal, 100, '2026-09-09T00:00:00Z')
assert.strictEqual(r.justCompleted, true); assert.strictEqual(r.goal.completed_at, '2026-09-09T00:00:00Z')
const again = G.applyProgress(r.goal, 100, '2026-09-10T00:00:00Z')
assert.strictEqual(again.justCompleted, false, 'staying at 100 does not re-celebrate'); assert.strictEqual(again.goal.completed_at, '2026-09-09T00:00:00Z')
const back = G.applyProgress(r.goal, 80, '2026-09-11T00:00:00Z')
assert.strictEqual(back.goal.completed_at, null)
assert.strictEqual(G.applyProgress(back.goal, 100, '2026-09-12T00:00:00Z').justCompleted, true, 'drop below and return → celebrates again')
// coach re-save keeps the client's progress by title
const merged = G.mergeCoachGoalSave([{ ...r.goal, author: 'coach' }], [{ title: 'Delegate more', description: 'edited by coach', metrics: ['2 handed off'], source: 'manual' }])
assert.strictEqual(merged[0].progress, 100); assert.strictEqual(merged[0].completed_at, '2026-09-09T00:00:00Z'); assert.strictEqual(merged[0].description, 'edited by coach'); assert.strictEqual(merged[0].author, 'coach')

// ── notes ────────────────────────────────────────────────────────────────────
assert.deepStrictEqual(N.cleanNoteInput({ title: '  Q4  focus ', body: 'a\r\nb  ' }), { ok: true, title: 'Q4 focus', body: 'a\nb' })
assert.strictEqual(N.cleanNoteInput({ title: '', body: '   ' }).ok, false)
assert.ok(N.formatNotesForPrompt([{ title: 'Q4 focus', date: '2026-09-08', text: 'x' }]).startsWith('## Q4 focus — 2026-09-08'))

console.log('portal reminders / progress / notes: all checks passed')

// PR 2: invitation context line + report-ready email copy.
{
  const E = require(path.join(ROOT, '.spike-build/lib/portal/email.js'))
  assert.strictEqual(E.portalInviteContextLine({ companyName: 'Acme', hasReport: true }), 'Your portal for the Acme program is ready, and your 360 feedback report is inside.')
  assert.strictEqual(E.portalInviteContextLine({ companyName: null, hasReport: true }), 'Your portal is ready, and your 360 feedback report is inside.')
  assert.strictEqual(E.portalInviteContextLine({ companyName: 'Acme', hasReport: false }), 'Your portal for the Acme program is ready.')
  assert.strictEqual(E.portalInviteContextLine({ companyName: '  ', hasReport: false }), null, 'coaching client: plain email')
  const inv = E.buildMagicLinkEmailHtml({ firstName: 'Pat', link: 'https://x/portal/verify?token=t', coachName: null, contextLine: 'A & B <program>' })
  assert.ok(inv.includes('A &amp; B &lt;program&gt;'), 'context line escaped')
  assert.ok(inv.includes('— theLeadershipWell'), 'firm sign-off when no coach name')
  const ready = E.buildReminderEmailHtml({ firstName: 'Pat', kind: 'report_ready', link: 'https://x/l', settingsLink: 'https://x/s', coachName: 'Jeff Holmes' })
  assert.ok(ready.includes('Your 360 feedback report is ready'), 'report-ready lead')
  assert.ok(!ready.includes('switch these reminders off'), 'report-ready is not a reminder: no opt-out line')
  const wel = E.buildReminderEmailHtml({ firstName: 'Pat', kind: 'welcome', link: 'https://x/l', settingsLink: 'https://x/s', coachName: null })
  assert.ok(wel.includes('switch these reminders off'), 'reminders keep the opt-out line')
  assert.strictEqual(R.REMINDER_SUBJECTS.report_ready, 'Your 360 report is ready')
  console.log('invitation context + report-ready copy: all checks passed')
}
