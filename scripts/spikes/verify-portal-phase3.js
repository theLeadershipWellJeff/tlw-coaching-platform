// Phase 3 acceptance checks that need no API key:
//   (a) goal authorship rules (coach save never clobbers a client goal),
//   (b) chat prompt layering (order, omissions, confidentiality),
//   (c) cross-company context isolation against a real Postgres.
//
//   node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json && \
//   PDF=fixtures/private/reference-360.pdf PG=env PGHOST=/tmp/pgs PGPORT=5499 PGDATABASE=tlw PGUSERNAME=postgres \
//   node scripts/spikes/verify-portal-phase3.js
//
// PG=env reads the standard PG* variables (a unix-socket PGHOST works); any
// other value is used as a connection URL. (c) is skipped when PG is unset.
const fs = require('fs')
const path = require('path')

const build = path.resolve(__dirname, '../../.spike-build/lib')
const { mergeCoachGoalSave, cleanClientGoal, isClientEditable } = require(path.join(build, 'portal/goals.js'))
const { composeChatSystem, ASSESSMENT_GROUNDING_RULES } = require(path.join(build, 'portal/prompt.js'))
const { extractAssessment360 } = require(path.join(build, 'documents/assessment-360/index.js'))

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
}

;(async () => {
  // ---------------------------------------------------------------- (a) goals
  console.log('\n[a] goal authorship')
  const existing = [
    { title: 'Delegate the weekly review', description: '', metrics: ['Team runs it twice without me'], source: 'manual' },
    { title: 'Say the strategy out loud', description: 'from my 360', metrics: ['Named in 3 team meetings'], source: 'manual', author: 'client' },
    { title: 'Draft goal', description: '', source: 'generated' },
  ]
  // Coach editor loaded before the client added theirs: incoming lacks it.
  const coachSave = [
    { title: 'Delegate the weekly review', description: 'edited by coach', metrics: ['Team runs it twice without me'], source: 'manual' },
    { title: 'New coach goal', description: '', metrics: [], source: 'manual' },
  ]
  const merged = mergeCoachGoalSave(existing, coachSave)
  check('client-authored goal survives a coach save that omitted it', merged.some((g) => g.title === 'Say the strategy out loud' && g.author === 'client'), JSON.stringify(merged.map((g) => `${g.title}:${g.author}`)))
  check('coach goals gain author coach', merged.find((g) => g.title === 'New coach goal')?.author === 'coach')
  check('coach edit of a client goal keeps author client', mergeCoachGoalSave(existing, [{ title: 'say the strategy out loud', description: 'coach touched it', metrics: ['x'], source: 'manual' }]).find((g) => /strategy/i.test(g.title))?.author === 'client')
  check('generated draft the coach dropped is not resurrected', !merged.some((g) => g.title === 'Draft goal'))
  check('client goal requires a metric', cleanClientGoal({ title: 'x', metrics: [] }).ok === false && cleanClientGoal({ title: 'x', metrics: ['', ' y '] }).ok === true)
  check('client goal is stamped author client + source manual', (() => { const r = cleanClientGoal({ title: ' t ', description: 'd', metrics: ['m'] }); return r.ok && r.goal.author === 'client' && r.goal.source === 'manual' && r.goal.title === 't' })())
  check('only client goals are client-editable', isClientEditable(existing[1]) && !isClientEditable(existing[0]) && !isClientEditable(undefined))

  // --------------------------------------------------------------- (b) prompt
  console.log('\n[b] chat prompt layering')
  const pdf = process.env.PDF || 'fixtures/private/reference-360.pdf'
  const out = await extractAssessment360(new Uint8Array(fs.readFileSync(pdf)))
  if (out.status !== 'complete') {
    console.log('extraction failed; cannot test prompt', out)
    process.exit(1)
  }
  const data = out.data
  const brief = { slug: 'assessment_360', version: 7, body: 'BRIEF BODY MARKER — lead from strengths.' }
  const company = { name: 'Acme', vision: 'VISION MARKER', values: 'VALUES MARKER' }

  const full = composeChatSystem({
    clientName: 'Jeff Holmes', hasCoach: false, brief, company,
    assessment: { data, assessmentCount: 1 }, goals: [], noteParts: [], recentParts: [], retrievedParts: [],
  })
  const idx = (s) => full.indexOf(s)
  check('order: preamble < voice < grounding < brief < company < structured < verbatims', (() => {
    const seq = [idx('You are a warm'), idx('WRITING STANDARDS'), idx('ASSESSMENT GROUNDING RULES'), idx('BRIEF BODY MARKER'), idx('COMPANY CONTEXT'), idx('ASSESSMENT — STRUCTURED DATA'), idx('VERBATIM RATER COMMENTS')]
    return seq.every((v, i) => v >= 0 && (i === 0 || v > seq[i - 1]))
  })(), JSON.stringify([idx('You are a warm'), idx('WRITING STANDARDS'), idx('ASSESSMENT GROUNDING RULES'), idx('BRIEF BODY MARKER'), idx('COMPANY CONTEXT'), idx('ASSESSMENT — STRUCTURED DATA'), idx('VERBATIM RATER COMMENTS')]))
  check('brief version is named', /assessment_360 v7/.test(full))
  check('empty goals/notes/sessions sections are omitted (no "no sessions on file")', !/COACHING GOALS:/.test(full) && !/SESSION NOTES/.test(full) && !/MOST RECENT SESSIONS/.test(full) && !/no sessions on file/.test(full) && !/no goals recorded/.test(full))
  check('coach-less human route points to Talk to a coach / support', /Talk to a coach/.test(full) && !/contact their coach/.test(full))
  check('structured data carries bands and norms', /"band":"Profound Strength"/.test(full) && /"norm_90th":4\.39/.test(full))
  check('comparison absent when no prior report', !/"comparison"/.test(full))
  check('rater names never in the prompt', out.raterNames.every((n) => !full.toLowerCase().includes(n.toLowerCase())))
  check('grounding rules forbid attribution and prescription', /NEVER speculate about which individual rater/.test(ASSESSMENT_GROUNDING_RULES) && /NEVER tell the participant what their goals should be/.test(ASSESSMENT_GROUNDING_RULES) && /closest to green/.test(ASSESSMENT_GROUNDING_RULES))
  check('verbatims are grouped by rater group only', /Peers:\n- /.test(full) && !/Rater Name/.test(full))
  console.log(`  prompt size with a 360: ${full.length} chars (~${Math.round(full.length / 4)} tokens)`)

  const noCompany = composeChatSystem({ clientName: 'Jeff Holmes', hasCoach: true, brief, company: null, assessment: { data, assessmentCount: 1 }, goals: [], noteParts: [], recentParts: [], retrievedParts: [] })
  check('no company → no company section, no placeholder', !/COMPANY CONTEXT/.test(noCompany) && !/no company/i.test(noCompany))
  check('with a coach the human route is the coach', /contact their coach/.test(noCompany))

  const plain = composeChatSystem({ clientName: 'Pat', hasCoach: true, brief: null, company: null, assessment: null, goals: [{ title: 'G1', description: 'd', metrics: ['m1'] }], noteParts: ['## Notes — 2026-01-01\nhello'], recentParts: ['## Session — 2026-01-02\nhi'], retrievedParts: [] })
  check('flag-off client: no grounding rules, no brief, no structured data', !/ASSESSMENT GROUNDING/.test(plain) && !/INTERPRETATION BRIEF/.test(plain) && !/STRUCTURED DATA/.test(plain))
  check('flag-off client: goals, notes, sessions present', /COACHING GOALS:\n- G1: d[^\n]*\n  measures: m1/.test(plain) && /SESSION NOTES PAT/.test(plain) && /MOST RECENT SESSIONS/.test(plain))
  check('prompt never mentions key_info', !/key_info/i.test(full) && !/key_info/i.test(plain))
  // 2026-09-08: a 360 on file but not surfaced → the status line is present and the
  // assistant is told how documents reach it; with a surfaced report the line is absent.
  const status = composeChatSystem({ clientName: 'Pat', hasCoach: true, brief: null, company: null, assessment: null, assessmentStatus: 'A 360 report was added on September 8, 2026 but could not be attached to this account because the name on the report did not match.', goals: [], noteParts: [], recentParts: [], retrievedParts: [] })
  check('360 on file but not surfaced: status line present, no grounding rules', /THEIR 360 REPORT — STATUS: A 360 report was added/.test(status) && !/ASSESSMENT GROUNDING/.test(status))
  check('surfaced report: no status line', !/360 REPORT — STATUS/.test(full))
  check('preamble says how documents reach the assistant', /"Your documents" on their portal home page/.test(plain) && /cannot receive files yourself/.test(plain))

  const withCmp = composeChatSystem({ clientName: 'Jeff Holmes', hasCoach: false, brief, company: null, assessment: { data: { ...data, comparison: { prior_document_id: 'x', prior_assessment_date: '2023-01-01', months_elapsed: 19, comparability: { rater_sets_differ: true, prior_rater_counts: null, current_rater_counts: null, norm_vintage_differs: false, confidence: 'moderate' }, by_competency: [] } }, assessmentCount: 2 }, goals: [], noteParts: [], recentParts: [], retrievedParts: [] })
  check('two reports: comparison block present and explained', /"comparison"/.test(withCmp) && /2 assessments on file/.test(withCmp))

  // ------------------------------------------------------------ (c) isolation
  console.log('\n[c] cross-company context isolation')
  if (!process.env.PG) {
    console.log('  SKIP (set PG=postgres://… to run against a database with migration 059 applied)')
  } else {
    const postgres = require('postgres')
    const sql = process.env.PG === 'env' ? postgres({ max: 1 }) : postgres(process.env.PG, { max: 1 })
    try {
      await sql.begin(async (tx) => {
        const [a] = await tx`insert into companies (name, vision, "values") values ('Company A', 'VISION-A', 'VALUES-A') returning id`
        const [b] = await tx`insert into companies (name, vision, "values") values ('Company B', 'VISION-B', 'VALUES-B') returning id`
        const [ca] = await tx`insert into clients (name, email, client_type, company_id) values ('Client A', 'a@example.com', 'portal', ${a.id}) returning id`
        const [cb] = await tx`insert into clients (name, email, client_type, company_id) values ('Client B', 'b@example.com', 'portal', ${b.id}) returning id`
        const [cn] = await tx`insert into clients (name, email, client_type) values ('Client None', 'n@example.com', 'portal') returning id`
        // The exact two-step lookup lib/portal/company.ts performs.
        const lookup = async (clientId) => {
          const [c] = await tx`select company_id from clients where id = ${clientId}`
          if (!c?.company_id) return null
          const [co] = await tx`select id, name, vision, "values" from companies where id = ${c.company_id}`
          return co || null
        }
        const ra = await lookup(ca.id), rb = await lookup(cb.id), rn = await lookup(cn.id)
        check('client A receives Company A only', ra?.vision === 'VISION-A' && ra?.values === 'VALUES-A')
        check('client B receives Company B only', rb?.vision === 'VISION-B')
        check('client A never sees Company B', ra?.vision !== 'VISION-B' && JSON.stringify(ra).indexOf('B') < 0)
        check('client with no company receives nothing', rn === null)
        // Prompt composed from A's context must not contain B's markers.
        const pa = composeChatSystem({ clientName: 'Client A', hasCoach: false, brief: null, company: ra, assessment: { data, assessmentCount: 1 }, goals: [], noteParts: [], recentParts: [], retrievedParts: [] })
        check('prompt for A carries VISION-A and no B marker', /VISION-A/.test(pa) && !/VISION-B|VALUES-B/.test(pa))
        throw new Error('rollback')
      }).catch((e) => { if (e.message !== 'rollback') throw e })
    } finally {
      await sql.end()
    }
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
