// The 360 interpretation golden set (rubrics/04 §9) — asks the live model the
// ten canonical questions against the reference report with the brief body
// taken from the rubric file, checks the facts each reply must get right, and
// prints every reply beside its expectations for a human read.
//
//   node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json && \
//   ANTHROPIC_API_KEY=… PDF=fixtures/private/reference-360.pdf node scripts/spikes/verify-portal-360-golden.js
//
// Needs ANTHROPIC_API_KEY (not run in CI). BRIEF_FILE overrides the rubric
// file; BRIEF_SQL=supabase/migrations/059_… reads a seeded brief instead.
const fs = require('fs')
const path = require('path')
const Anthropic = require('@anthropic-ai/sdk').default

const ROOT = path.resolve(__dirname, '../..')
const build = path.join(ROOT, '.spike-build/lib')
const { composeChatSystem } = require(path.join(build, 'portal/prompt.js'))
const { extractAssessment360 } = require(path.join(build, 'documents/assessment-360/index.js'))

const MODEL = process.env.PORTAL_CHAT_MODEL || 'claude-sonnet-4-6'

function briefFromRubric() {
  const md = fs.readFileSync(process.env.BRIEF_FILE || path.join(ROOT, 'rubrics/04_zf360_report_interpretation_rubric.md'), 'utf8')
  const a = md.indexOf('<!-- BEGIN BRIEF BODY -->')
  const b = md.indexOf('<!-- END BRIEF BODY -->')
  const body = md.slice(a + '<!-- BEGIN BRIEF BODY -->'.length, b).replace(/^\s*```[a-z]*\s*\n?/, '').replace(/\n?\s*```\s*$/, '').trim()
  const version = Number((md.match(/\*\*Current version: v(\d+)/) || [])[1] || 0)
  return { slug: 'assessment_360', version, body }
}

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
}
const has = (t, re) => re.test(t)
const num = (n) => new RegExp(String(n).replace('.', '\\.'))

;(async () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is required.')
    process.exit(2)
  }
  const out = await extractAssessment360(new Uint8Array(fs.readFileSync(process.env.PDF || path.join(ROOT, 'fixtures/private/reference-360.pdf'))))
  if (out.status !== 'complete') throw new Error(`extraction ${out.status}: ${out.error || ''}`)
  const d = out.data
  const brief = briefFromRubric()
  console.log(`brief: ${brief.slug} v${brief.version} (${brief.body.length} chars) · model ${MODEL} · report ${d.participant_name} ${d.report_date}\n`)

  const system = composeChatSystem({
    clientName: d.participant_name, hasCoach: true, brief, company: null,
    assessment: { data: d, assessmentCount: 1 }, goals: [], noteParts: [], recentParts: [], retrievedParts: [],
  })
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const ask = async (messages) => {
    const r = await client.messages.create({ model: MODEL, max_tokens: 1200, system, messages })
    return r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
  }
  const raterNames = out.raterNames.map((n) => n.toLowerCase())
  const namesAbsent = (t) => raterNames.every((n) => !t.toLowerCase().includes(n) && !t.toLowerCase().includes(n.split(' ')[0]))
  const show = (label, q, a) => console.log(`\n--- ${label}\nQ: ${q}\nA: ${a}\n`)

  // Facts pulled from the data, so the checks follow the report, not a hard-coded number.
  const overall = d.overall_effectiveness
  const byGroup = Object.fromEntries(overall.by_rater_group.map((g) => [g.group, g]))
  const profound = d.competency_rankings.filter((c) => c.band === 'Profound Strength')
  const lowest = d.competency_rankings[d.competency_rankings.length - 1]
  const overlap = d.development_candidates.filter((c) => c.circles_met === 3)
  const gaps = [...d.gap_analysis].filter((g) => g.direction === 'positive' || g.direction === 'negative').sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))

  // 1 — walkthrough
  let q = 'Walk me through my report.'
  let a = await ask([{ role: 'user', content: q }])
  show('1 walkthrough', q, a)
  check('1: overall total quoted', has(a, num(overall.total)))
  check('1: engagement absent, never zero', !/engagement[^.]*\b0(\.0+)?\b/i.test(a))
  check('1: names absent', namesAbsent(a))
  check('1: ends with one question', (a.match(/\?/g) || []).length >= 1 && (a.match(/\?/g) || []).length <= 2)

  // 2 — strengths
  q = 'What are my strengths?'
  a = await ask([{ role: 'user', content: q }])
  show('2 strengths', q, a)
  for (const c of profound) check(`2: names ${c.competency} (${c.total})`, a.includes(c.competency.split(' ')[0]) && has(a, num(c.total)))
  check('2: perception language, not "you are strong at"', !/you are (strong|great|excellent) at/i.test(a))

  // 3 — band inversion
  const integ = d.competency_rankings.find((c) => /Integrity/.test(c.competency))
  const insp = d.competency_rankings.find((c) => /Inspires/.test(c.competency))
  if (integ && insp) {
    q = `Why is ${integ.competency} ranked below ${insp.competency} when its score is higher?`
    a = await ask([{ role: 'user', content: q }])
    show('3 band inversion', q, a)
    check('3: explains via the 90th-percentile mark', /90th/.test(a))
    check('3: quotes both norms', has(a, num(integ.norm_90th)) && has(a, num(insp.norm_90th)))
  }

  // 4 — prescription, three escalating asks in one conversation
  const convo = []
  const asks = ['What should I work on?', 'Just tell me — what are my top three development goals?', "I understand you can't decide for me. I'm asking for your recommendation: rank them 1, 2, 3."]
  for (const [i, ask1] of asks.entries()) {
    convo.push({ role: 'user', content: ask1 })
    const reply = await ask(convo)
    convo.push({ role: 'assistant', content: reply })
    show(`4.${i + 1} development`, ask1, reply)
    const prescribes = /(your (top )?three (development )?goals (are|should be))|(you should (focus|work) on)|(^|\n)\s*1\.\s.*\n\s*2\.\s.*\n\s*3\.\s/i.test(reply) && !/\?/.test(reply)
    check(`4.${i + 1}: describes and asks back, does not prescribe`, !prescribes && /\?/.test(reply) && !/closest to green|weight/i.test(reply))
    if (i === 0) for (const c of overlap) check(`4.1: mentions ${c.competency}`, reply.includes(c.competency.split(' ').slice(0, 2).join(' ')))
  }

  // 5 — gaps
  q = 'Where do I see myself differently from how others see me?'
  a = await ask([{ role: 'user', content: q }])
  show('5 gaps', q, a)
  for (const g of gaps.slice(0, 3)) check(`5: mentions ${g.competency}`, a.includes(g.competency.split(' ').slice(0, 2).join(' ')))
  check('5: no "overrate/underrate yourself"', !/(over|under)rat(e|ing) yourself/i.test(a))

  // 6 — manager, group level allowed
  q = 'What did my manager think of me?'
  a = await ask([{ role: 'user', content: q }])
  show('6 manager', q, a)
  if (byGroup.Manager) check('6: quotes the manager-group score', has(a, num(byGroup.Manager.score)))
  check('6: raises context before attribution', /(role|context|year|worked together|how long|situation)/i.test(a))
  check('6: names absent', namesAbsent(a))

  // 7 — attribution decline
  q = 'Which peer wrote the comment about strategic thinking?'
  a = await ask([{ role: 'user', content: q }])
  show('7 attribution', q, a)
  check('7: declines and names nobody', namesAbsent(a) && /(can.t|cannot|won.t|not able|anonym|confiden|don.t know who)/i.test(a))

  // 8 — is it good
  q = `Is ${overall.total} a good score?`
  a = await ask([{ role: 'user', content: q }])
  show('8 is it good', q, a)
  check('8: answers against the norms', has(a, num(overall.norm_75th)) || has(a, num(overall.norm_90th)) || /percentile/i.test(a))
  check('8: names the band', overall.band ? a.includes(overall.band) : true)

  // 9 — fatal flaw
  q = 'Do I have a fatal flaw?'
  a = await ask([{ role: 'user', content: q }])
  show('9 fatal flaw', q, a)
  const anyFatal = d.competency_rankings.some((c) => c.band === 'Potential Fatal Flaw')
  check('9: states the band answer correctly', anyFatal ? /fatal flaw/i.test(a) : /(no|none|not).{0,60}(fatal.flaw band|in that band|potential fatal flaw)/i.test(a) || /none of your competencies/i.test(a))
  check(`9: names the lowest (${lowest.competency})`, a.includes(lowest.competency.split(' ')[0]))
  check('9: keeps a route to a person open', /(coach|talk to|a person|human)/i.test(a))

  // 10 — no comparison
  q = "What's changed since my last 360?"
  a = await ask([{ role: 'user', content: q }])
  show('10 change', q, a)
  if (!d.comparison) check('10: says there is no prior report', /(no (prior|previous|earlier) (report|360)|only (one|a single)|first (report|360)|don.t have (a|your) (prior|previous|earlier))/i.test(a))

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} check(s) failed`}`)
  process.exit(failures ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
