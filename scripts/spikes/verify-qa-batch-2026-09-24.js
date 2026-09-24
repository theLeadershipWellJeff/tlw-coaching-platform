/* Pure-rule checks for the 2026-09-24 QA batch (no DB, no API key):
 *   node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json && node scripts/spikes/verify-qa-batch-2026-09-24.js
 */
const path = require('path')
const B = path.join(__dirname, '../../.spike-build/lib')
const { noteCountsAsSession, dedupeByCalendarEvent, LOGGED_SESSION_CONTENT } = require(B + '/notes/session-count.js')
const { extractCaptures, normalizeCaptureText } = require(B + '/notes/extract.js')
const { tableToSentences, parseMapMarkdown } = require(B + '/vault/maps.js')

let pass = 0, fail = 0
const ok = (c, m) => (c ? pass++ : (fail++, console.log('FAIL:', m)))

// TLW-002 — empty notes are not sessions
ok(!noteCountsAsSession({ content: '' }), 'empty string not a session')
ok(!noteCountsAsSession({ content: '<p></p>' }), 'empty paragraph not a session')
ok(!noteCountsAsSession({ content: '<p>&nbsp; </p><p><br></p>' }), 'whitespace-only not a session')
ok(!noteCountsAsSession({ content: null }), 'null not a session')
ok(noteCountsAsSession({ content: '<p>ACTION: call CFO</p>' }), 'text note is a session')
ok(noteCountsAsSession({ content: LOGGED_SESSION_CONTENT }), 'hand-logged session counts')
const d = dedupeByCalendarEvent([
  { id: 1, calendar_event_id: 'e1' }, { id: 2, calendar_event_id: 'e1' },
  { id: 3, calendar_event_id: null }, { id: 4, calendar_event_id: null },
])
ok(d.map((n) => n.id).join() === '1,3,4', 'one session per calendar event; unlinked kept')

// TLW-004 — capture text is canonical across normalizers
const nb = 'ACTION: Hand off the weekly status report  to a senior IC.'
const a1 = extractCaptures(nb).actions[0].text
const a2 = extractCaptures(nb.replace(/ /g, ' ')).actions[0].text
ok(a1 === a2, 'nbsp vs space yields the same action text')
ok(normalizeCaptureText('  a   b ') === 'a b', 'normalize collapses whitespace')

// TLW-005 — document order preserved
const caps = extractCaptures('ACTION: One\nACTION: Two\nACTION: Three').actions.map((a) => a.text)
ok(caps.join() === 'One,Two,Three', 'captures in document order')

// TLW-007 — tables become sentences
const rows = [
  '| Scenario | What It Is | Winning Strategy |',
  '|---|---|---|',
  '| Start-Up | Build from scratch | Recruit fast |',
]
const s = tableToSentences(rows)
ok(s.length === 1 && !s[0].includes('|'), 'no pipes in table output')
ok(s[0] === 'Start-Up — What It Is: Build from scratch; Winning Strategy: Recruit fast.', 'row sentence: ' + s[0])
const map = parseMapMarkdown(
  '# First 90 Days\n\nIntro.\n\n### 03 · Wins\nSome text.\n\n' + rows.join('\n') + '\n\nAfter.\n',
  'x'
)
const desc = map.components[0].description
ok(!desc.includes('|') && desc.includes('Start-Up —') && desc.endsWith('After.'), 'map description: ' + desc)

console.log(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
