// Pure-rule verification for the session-note send flow (no API key, no DB):
// the narrative cache format and the status view-filter predicates.
//   node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json && node scripts/spikes/verify-note-send.js
const path = require('path')
const out = path.join(__dirname, '..', '..', '.spike-build')
const fmt = require(path.join(out, 'lib/notes/narrative-format.js'))
const st = require(path.join(out, 'lib/notes/status.js'))
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log('  ok   ' + n) } else { fail++; console.log('  FAIL ' + n + (d ? ' — ' + JSON.stringify(d) : '')) } }

console.log('narrative-format')
const j = fmt.joinNarrative('Our session on Tuesday', 'Hi Sam,\n\n- one\n- two\n\nJeff')
check('join puts SUBJECT first', j.startsWith('SUBJECT: Our session on Tuesday\n\n'))
const sp = fmt.splitNarrative(j)
check('split round-trips subject', sp.subject === 'Our session on Tuesday')
check('split round-trips body', sp.body === 'Hi Sam,\n\n- one\n- two\n\nJeff')
check('no SUBJECT line → empty subject, whole text is body', fmt.splitNarrative('Hi Sam,\nthanks').subject === '' && fmt.splitNarrative('Hi Sam,\nthanks').body === 'Hi Sam,\nthanks')
check('partial stream (subject only, no newline yet) → body empty', fmt.splitNarrative('SUBJECT: Our ses').body === '' || fmt.splitNarrative('SUBJECT: Our ses').subject === '')
check('CRLF tolerated', fmt.splitNarrative('SUBJECT: A\r\n\r\nBody').body === 'Body')
check('null → empty', fmt.splitNarrative(null).subject === '' && fmt.splitNarrative(null).body === '')
check('join with empty subject stores body only', fmt.joinNarrative('', 'Body') === 'Body')
check('default subject uses first name', fmt.defaultSubject('Sam') === 'A note from our session, Sam')

console.log('status (view filter)')
const n = (o) => Object.assign({ status: 'draft', sent_to_client_at: null, filed_at: null }, o)
check('draft is active', st.isNoteActive(n({})))
check('pre-067 note (no status) with 050 stamp is sent', st.isNoteSent(n({ status: undefined, sent_to_client_at: '2026-09-01T00:00:00Z' })))
check('status sent is sent', st.isNoteSent(n({ status: 'sent' })))
check('sent is not active', !st.isNoteActive(n({ status: 'sent' })))
check('filed is filed, not sent, not active', st.isNoteFiled(n({ status: 'filed' })) && !st.isNoteSent(n({ status: 'filed' })) && !st.isNoteActive(n({ status: 'filed' })))
check('sent wins over filed', st.isNoteSent(n({ status: 'filed', sent_to_client_at: 'x' })) && !st.isNoteFiled(n({ status: 'filed', sent_to_client_at: 'x' })))
check('filed_at alone reads as filed', st.isNoteFiled(n({ filed_at: 'x' })))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
