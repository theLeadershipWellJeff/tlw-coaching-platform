// Pure-rule verification for portal scheduling (multi-coach rollout): the
// reschedule/cancel link extraction from a calendar event, and the coach
// scheduling-contact validation. No API key, no database. Run after the spike compile:
//   node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json && node scripts/spikes/verify-portal-scheduling.js
const path = require('path')
const out = path.join(__dirname, '..', '..', '.spike-build')
const L = require(path.join(out, 'lib/portal/appointment-links.js'))
const S = require(path.join(out, 'lib/coach-scheduling.js'))

let pass = 0, fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name) } else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + JSON.stringify(detail) : '')) }
}

console.log('extractChangeLinks')
const calendlyText = {
  description:
    'Event Name: 55 Minute Meeting\n\nLocation: This is a Zoom web conference.\n\nNeed to make changes to this event?\nCancel: https://calendly.com/cancellations/1111-aaaa\nReschedule: https://calendly.com/reschedulings/2222-bbbb\n\nPowered by Calendly.com',
}
let r = L.extractChangeLinks(calendlyText)
check('Calendly plain text → reschedule', r.rescheduleUrl === 'https://calendly.com/reschedulings/2222-bbbb', r)
check('Calendly plain text → cancel', r.cancelUrl === 'https://calendly.com/cancellations/1111-aaaa', r)

const calendlyHtml = {
  description:
    'Need to make changes?<br>Cancel: <a href="https://calendly.com/cancellations/3333?x=1&amp;y=2">https://calendly.com/cancellations/3333?x=1&amp;y=2</a><br>Reschedule: <a href="https://calendly.com/reschedulings/4444">link</a>.',
}
r = L.extractChangeLinks(calendlyHtml)
check('HTML description → reschedule', r.rescheduleUrl === 'https://calendly.com/reschedulings/4444', r)
check('HTML entities decoded in cancel link', r.cancelUrl === 'https://calendly.com/cancellations/3333?x=1&y=2', r)

r = L.extractChangeLinks({ description: 'Reschedule: https://evil.example.com/reschedule/1 Cancel: https://evil.example.com/cancel/1' })
check('unknown host never returned', r.rescheduleUrl === null && r.cancelUrl === null, r)
r = L.extractChangeLinks({ description: 'Reschedule: http://calendly.com/reschedulings/5' })
check('http (not https) never returned', r.rescheduleUrl === null, r)
r = L.extractChangeLinks({ description: 'Cancel: javascript:alert(1)//calendly.com/cancellations/1' })
check('javascript: never returned', r.cancelUrl === null, r)
r = L.extractChangeLinks({ description: 'Join Zoom: https://us02web.zoom.us/j/5351319810' })
check('a plain Zoom join link is neither', r.rescheduleUrl === null && r.cancelUrl === null, r)
r = L.extractChangeLinks({ description: 'Reschedule or cancel: https://scheduler.zoom.us/jeff/reschedule?id=9 and https://scheduler.zoom.us/jeff/cancel?id=9' })
check('Zoom Scheduler reschedule', r.rescheduleUrl === 'https://scheduler.zoom.us/jeff/reschedule?id=9', r)
check('Zoom Scheduler cancel', r.cancelUrl === 'https://scheduler.zoom.us/jeff/cancel?id=9', r)
r = L.extractChangeLinks({ description: 'https://calendly.com.evil.io/reschedulings/1' })
check('look-alike host rejected', r.rescheduleUrl === null, r)
check('null event → no links', JSON.stringify(L.extractChangeLinks(null)) === JSON.stringify({ rescheduleUrl: null, cancelUrl: null }))
check('no description → no links', L.extractChangeLinks({ summary: 'x' }).rescheduleUrl === null)
r = L.extractChangeLinks({ location: 'https://calendly.com/reschedulings/77.' })
check('trailing punctuation trimmed, location read', r.rescheduleUrl === 'https://calendly.com/reschedulings/77', r)

console.log('coach scheduling fields')
check('empty booking link clears', S.parseBookingUrl('  ').ok && S.parseBookingUrl('').value === null)
check('https booking link kept', S.parseBookingUrl('https://calendly.com/jeffkholmes').value === 'https://calendly.com/jeffkholmes')
check('javascript: booking link refused', !S.parseBookingUrl('javascript:alert(1)').ok)
check('assistant email lower-cased', S.parseAssistantEmail(' Priya@Example.com ').value === 'priya@example.com')
check('bad assistant email refused', !S.parseAssistantEmail('priya@').ok)
check('assistant name collapsed', S.parseAssistantName('  Priya   Shah ').value === 'Priya Shah')
const u = S.schedulingUpdateFromBody({ bookingUrl: '', assistantEmail: 'a@b.co' })
check('body → only present keys', u.ok && u.value.booking_url === null && u.value.scheduling_assistant_email === 'a@b.co' && !('scheduling_assistant_name' in u.value), u)
check('body with a bad field fails', !S.schedulingUpdateFromBody({ assistantEmail: 'nope' }).ok)
check('first name', S.coachFirstName('Maya  Lopez') === 'Maya' && S.coachFirstName(null) === null)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
