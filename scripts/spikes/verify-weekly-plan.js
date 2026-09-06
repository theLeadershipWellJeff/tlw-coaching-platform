// Plan-your-week helpers: week boundaries, task cleaning, prompt layering.
// Build first: node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json
// Then: node scripts/spikes/verify-weekly-plan.js
const assert = require('assert')
const Module = require('module')
const path = require('path')
const ROOT = '/home/user/tlw-coaching-platform'
const orig = Module._resolveFilename
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith('@/')) {
    const rel = request.slice(2)
    try { return orig.call(this, path.join(ROOT, '.spike-build', rel), parent, ...rest) } catch {}
    return orig.call(this, path.join(ROOT, rel), parent, ...rest)
  }
  return orig.call(this, request, parent, ...rest)
}
const wp = require('/home/user/tlw-coaching-platform/.spike-build/lib/portal/weekly-plan.js')
const prompt = require('/home/user/tlw-coaching-platform/.spike-build/lib/portal/prompt.js')
// Sunday Sep 6 2026 UTC 23:30 → in Los Angeles it is still Sunday afternoon → Monday Aug 31
assert.strictEqual(wp.weekStartFor(new Date('2026-09-06T23:30:00Z'), 'America/Los_Angeles'), '2026-08-31')
// Same instant in Amman is Monday Sep 7 02:30 → week of Sep 7
assert.strictEqual(wp.weekStartFor(new Date('2026-09-06T23:30:00Z'), 'Asia/Amman'), '2026-09-07')
assert.strictEqual(wp.weekStartFor(new Date('2026-09-09T12:00:00Z'), 'UTC'), '2026-09-07')
assert.strictEqual(wp.weekLabel('2026-09-07'), 'Week of Sep 7')
// cleanTasks: trims, dedupes, caps at 7, keeps prior ids + done state
const prior = [{ id: 'keep', text: 'Call the board chair', done: true, done_at: '2026-09-01T00:00:00Z' }]
const t = wp.cleanTasks(['  Call the board chair ', 'call the board chair', '', 'Draft the offsite agenda', 3, 4, 5, 6, 7, 8, 9].map(String), prior)
assert.strictEqual(t.length, 7)
assert.strictEqual(t[0].id, 'keep'); assert.strictEqual(t[0].done, true); assert.strictEqual(t[0].done_at, '2026-09-01T00:00:00Z')
assert.strictEqual(t[1].text, 'Draft the offsite agenda'); assert.strictEqual(t[1].done, false)
assert.deepStrictEqual(wp.cleanTasks([{ id: 'x', text: 'Ship it', done: true }])[0].id, 'x')
assert.strictEqual(wp.cleanTasks(null).length, 0)
assert.ok(wp.isValidWeekStart('2026-09-07') && !wp.isValidWeekStart('2026-13-40') && !wp.isValidWeekStart(7))
// prompt composer: brief first, mechanics, goals, plans; no general preamble
const sys = prompt.composeWeeklyPlanSystem({
  clientName: 'Pat Example', preferredName: 'Pat', hasCoach: false,
  brief: { slug: 'weekly_plan', version: 1, body: 'BRIEF BODY HERE' },
  goals: [{ title: 'Delegate more', description: 'Free 4h/wk', metrics: ['2 tasks handed off'] }],
  assessmentSummary: 'Development candidates the report points toward: Strategic Perspective',
  clientDocuments: [], recentPlans: 'Week of Aug 31 (1/2 done):\n  [x] a\n  [ ] b', noteParts: [],
  today: '2026-09-08', weekStart: '2026-09-07',
})
assert.ok(sys.startsWith('BRIEF BODY HERE'))
assert.ok(sys.includes('WRITING STANDARDS'))
assert.ok(sys.includes('Save this week\'s plan'))
assert.ok(sys.includes("PAT EXAMPLE'S COACHING GOALS") && sys.includes('2 tasks handed off'))
assert.ok(sys.includes('360 DEVELOPMENT PICTURE') && sys.includes('RECENT WEEKLY PLANS'))
assert.ok(sys.includes('Talk to a coach'))
assert.ok(!sys.includes('warm, insightful coaching assistant'))
assert.ok(sys.includes('they go by "Pat"'))
// no brief → floor; no goals → section omitted
const sys2 = prompt.composeWeeklyPlanSystem({ clientName: 'X', preferredName: null, hasCoach: true, brief: null, goals: [], assessmentSummary: null, recentPlans: '', noteParts: [], today: '2026-09-08', weekStart: '2026-09-07' })
assert.ok(sys2.includes('plan their week') && !sys2.includes('COACHING GOALS') && sys2.includes('human coach'))
console.log('weekly-plan helpers: all checks passed')
