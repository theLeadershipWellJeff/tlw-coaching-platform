// Pure-rule verification for the coach attention queue generator (no API key,
// no database). Run after the spike compile:
//   node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json && node scripts/spikes/verify-coach-tasks.js
const path = require('path')
const out = path.join(__dirname, '..', '..', '.spike-build')
const g = require(path.join(out, 'lib/coach-tasks/generate.js'))

let pass = 0, fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name) } else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + JSON.stringify(detail) : '')) }
}

const TZ = 'America/Los_Angeles'
const now = new Date('2026-09-10T20:00:00Z') // 13:00 PT
const nowMs = now.getTime()
const h = 60 * 60 * 1000
const appt = (over) => Object.assign({ id: 'a1', coach_id: 'c1', client_id: 'k1', scheduled_at: new Date(nowMs - 5 * h).toISOString(), duration_minutes: 60, google_event_id: 'ev1', status: 'scheduled' }, over)
const note = (over) => Object.assign({ id: 'n1', client_id: 'k1', session_date: '2026-09-10', calendar_event_id: null, status: 'draft', sent_to_client_at: null, filed_at: null, created_at: '2026-09-10T18:00:00Z' }, over)

console.log('classifyAppointment')
check('ended 4h ago, no note → write_note', g.classifyAppointment(appt(), [], TZ, nowMs).taskType === 'write_note')
check('due_at = end + 3h', g.classifyAppointment(appt(), [], TZ, nowMs).dueAt === new Date(nowMs - 4 * h + 3 * h).toISOString())
check('ended 2h ago → not due', g.classifyAppointment(appt({ scheduled_at: new Date(nowMs - 3 * h).toISOString() }), [], TZ, nowMs).kind === 'not_due')
check('ended exactly 3h ago → due', g.classifyAppointment(appt({ scheduled_at: new Date(nowMs - 4 * h).toISOString() }), [], TZ, nowMs).kind === 'task')
check('before the epoch → never a task', g.classifyAppointment(appt({ scheduled_at: '2026-09-01T10:00:00Z' }), [], TZ, nowMs).kind === 'not_due')
check('draft note matched by event id → send_note', g.classifyAppointment(appt(), [note({ calendar_event_id: 'ev1' })], TZ, nowMs).taskType === 'send_note')
check('draft note matched by same local date → send_note', g.classifyAppointment(appt(), [note()], TZ, nowMs).taskType === 'send_note')
check('note on another date → write_note', g.classifyAppointment(appt(), [note({ session_date: '2026-09-09' })], TZ, nowMs).taskType === 'write_note')
check('note for another client → write_note', g.classifyAppointment(appt(), [note({ client_id: 'k2' })], TZ, nowMs).taskType === 'write_note')
check('note tied to a DIFFERENT event is not a date match', g.classifyAppointment(appt(), [note({ calendar_event_id: 'ev9' })], TZ, nowMs).taskType === 'write_note')
// Evening PT session: 2026-09-09 19:00 PT = 2026-09-10 02:00Z. Note dated the PT day.
const evening = appt({ scheduled_at: '2026-09-10T02:00:00Z' })
check('local-date match uses the coach timezone (evening PT = same PT day)', g.classifyAppointment(evening, [note({ session_date: '2026-09-09' })], TZ, nowMs).taskType === 'send_note')
check('UTC date would NOT match that note', g.classifyAppointment(evening, [note({ session_date: '2026-09-10' })], TZ, nowMs).taskType === 'write_note')
const sent050 = g.classifyAppointment(appt(), [note({ sent_to_client_at: '2026-09-10T19:00:00Z' })], TZ, nowMs)
check('050 sent stamp (status still draft) → resolved sent', sent050.kind === 'resolved' && sent050.as === 'sent', sent050)
check('status sent → resolved sent', g.classifyAppointment(appt(), [note({ status: 'sent' })], TZ, nowMs).as === 'sent')
check('status filed → resolved filed', g.classifyAppointment(appt(), [note({ status: 'filed' })], TZ, nowMs).as === 'filed')
check('newest of two same-day drafts wins', g.classifyAppointment(appt(), [note({ id: 'old', created_at: '2026-09-10T17:00:00Z' }), note({ id: 'new', created_at: '2026-09-10T19:00:00Z' })], TZ, nowMs).noteId === 'new')
check('missing duration defaults to 60', g.appointmentEndMs({ scheduled_at: '2026-09-10T10:00:00Z', duration_minutes: 0 }) === new Date('2026-09-10T11:00:00Z').getTime())

console.log('planTaskChange')
const task = (over) => Object.assign({ id: 't1', appointment_id: 'a1', task_type: 'write_note', state: 'pending' }, over)
const cw = { kind: 'task', taskType: 'write_note', dueAt: 'x', noteId: null }
const cs = { kind: 'task', taskType: 'send_note', dueAt: 'x', noteId: 'n1' }
const cr = { kind: 'resolved', as: 'sent', dueAt: 'x', noteId: 'n1' }
check('no tasks + write → insert write_note', g.planTaskChange([], cw).op === 'insert' && g.planTaskChange([], cw).taskType === 'write_note')
check('pending write + still write → none (idempotent)', g.planTaskChange([task()], cw).op === 'none')
check('pending write + note now drafted → convert to send_note', g.planTaskChange([task()], cs).op === 'convert')
check('pending send + note sent outside the flow → resolve sent', g.planTaskChange([task({ task_type: 'send_note' })], cr).op === 'resolve' && g.planTaskChange([task({ task_type: 'send_note' })], cr).state === 'sent')
check('dismissed task → never recreated', g.planTaskChange([task({ state: 'dismissed' })], cw).op === 'none')
check('filed task → never recreated', g.planTaskChange([task({ state: 'filed' })], cs).op === 'none')
check('no task + note already sent → none (nothing to queue)', g.planTaskChange([], cr).op === 'none')
check('not due → none even with a pending task', g.planTaskChange([task()], { kind: 'not_due' }).op === 'none')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
