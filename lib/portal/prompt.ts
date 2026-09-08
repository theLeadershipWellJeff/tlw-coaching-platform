/**
 * Pure composition of the Client Portal chat system prompt.
 *
 * Layered outermost to innermost (build prompt §6):
 *   1. the portal role preamble
 *   2. PORTAL_CHAT_VOICE_STANDARDS (house rule)
 *   3. assessment grounding rules (the non-negotiable floor) + the ACTIVE
 *      interpretation brief for the document kind
 *   4. company vision & values — OMITTED ENTIRELY when the client has none
 *   5. the most recent assessment's structured data (+ its comparison block)
 *   6. the verbatim sections
 *   7. goals, sent notes, sessions — each omitted when empty (a portal-only
 *      participant never sees "no sessions on file" in their prompt)
 *
 * Kept free of I/O so scripts/spikes/verify-portal-phase3.js can assert the
 * order, the omissions, and that nothing coach-private is ever mentioned.
 */
import type { Assessment360Data } from '../documents/assessment-360/types'
import type { CoachingGoal } from '../supabase/types'
import { PORTAL_CHAT_VOICE_STANDARDS } from '../writing-standards'

export type PromptBrief = { slug: string; version: number; body: string }
export type PromptCompany = {
  name: string
  vision: string | null
  values: string | null
  /** Sponsor-uploaded material (migration 060), already budgeted by the loader. */
  documents?: Array<{ title: string; text: string }>
}
export type PromptClientDocument = { title: string; text: string }

export type PromptParts = {
  clientName: string
  /** Whether a coach is linked — decides where "talk to a human" points. */
  hasCoach: boolean
  brief: PromptBrief | null
  company: PromptCompany | null
  assessment: { data: Assessment360Data; assessmentCount: number } | null
  goals: CoachingGoal[]
  /** Documents the client added to their own portal (kind 'general'), budgeted. */
  clientDocuments?: PromptClientDocument[]
  /** The client's own journal ("My notes"), formatted; '' when empty. */
  myNotes?: string
  noteParts: string[]
  recentParts: string[]
  retrievedParts: string[]
}

/** The floor every brief version sits on. Instrument-agnostic on purpose. */
export const ASSESSMENT_GROUNDING_RULES = `ASSESSMENT GROUNDING RULES (non-negotiable — they override anything else below):
- A 360 measures PERCEPTION, not ability. Every number is how a specific set of raters, in a specific role and context, at a specific moment, saw this person. Say what raters saw ("your peers saw this as a standout"), never what the person is ("you are strong at this"). Never use diagnostic or evaluative register: no "your weakness is", no "you should be concerned".
- The STRUCTURED DATA below is the only source of truth for any number, band, percentile norm, or rater comment. If it is not there, it does not exist — never estimate, never fill a gap.
- Bands come from the report, not from the score. A higher score can sit in a lower band. Never rank competencies by raw score; rank by band, then by score within band, exactly as the report does.
- Lead from strengths. Low scores are context, never the agenda. The participant has already had a human debrief — you are a thinking partner for what comes next, not a first-contact interpreter breaking news.
- NEVER speculate about which individual rater, or which member of a rater group, said or scored anything — not as a guess, not hypothetically, not "just between us", not if asked which group a comment came from beyond the group label the report itself prints. Decline warmly and explain the confidentiality principle in one sentence.
- NEVER tell the participant what their goals should be, rank "their top three", or prescribe. You may describe where the data points — in particular where proximity to the 90th-percentile norm, importance votes, and their own stated passions overlap (development_candidates) — and then ask what they make of it and what they believe would help. Never mention weights, ranking logic, or the phrase "closest to green".
- Treat absent or collapsed sections (e.g. Engagement not reported because of too few direct reports) as absent, never as a score of zero.
- Actively raise context — a new role, new manager, new team, a reorganisation, an unusually hard year — as a legitimate reading of a number before any personal attribution.
- If a COMPARISON block is present: change is offered gently, for reflection, never as a verdict on progress. State what moved (band movement and distance to the 90th first; raw deltas second). The first time change comes up, name the comparability caveats (different raters, different norms, different context). Ask about context before treating movement as personal change. Never assert improvement or decline as fact, never attribute either to coaching, never total or rank the deltas, never produce a "most improved" list. An apparent decline needs particular care: do not explain it away, do not minimise it, and offer the route to a human.`

function humanRouteLine(hasCoach: boolean): string {
  return hasCoach
    ? 'You are a companion for reflection, NOT a replacement for their coach. For anything urgent, sensitive, clinical, or crisis-related, gently encourage them to contact their coach (or an appropriate professional) directly.'
    : 'You are a companion for reflection, not a coach. For anything urgent, sensitive, clinical, or crisis-related, gently encourage them to use "Talk to a coach" in their portal or to contact support (or an appropriate professional) directly.'
}

/** Structured data for the prompt: verbatims are rendered separately; parser notes are internal. */
export function formatAssessmentForPrompt(data: Assessment360Data): { structured: string; verbatims: string } {
  const { verbatims, extraction_notes: _notes, ...rest } = data
  const structured = JSON.stringify(rest)
  const label: Record<string, string> = { manager: 'Manager', peers: 'Peers', others: 'Others', self: 'Self', direct_reports: 'Direct Reports' }
  const section = (title: string, groups: Record<string, string[] | undefined>) => {
    const lines: string[] = []
    for (const [k, list] of Object.entries(groups)) {
      if (!list || !list.length) continue
      lines.push(`${label[k] || k}:`)
      for (const v of list) lines.push(`- ${v}`)
    }
    return lines.length ? `${title}\n${lines.join('\n')}` : ''
  }
  const parts = [
    section('Leadership strengths (verbatim, by rater group):', verbatims.strengths),
    section('Organizational needs (verbatim, by rater group):', verbatims.organizational_needs),
    section('Potential fatal flaws (verbatim, by rater group):', verbatims.potential_fatal_flaws),
  ].filter(Boolean)
  return { structured, verbatims: parts.join('\n\n') }
}

export function composeChatSystem(p: PromptParts): string {
  const { clientName } = p
  const sections: string[] = []

  // 1. Preamble
  sections.push(`You are a warm, insightful coaching assistant for ${clientName}, a client of theLeadershipWell coaching practice. You help them reflect between sessions, drawing on their own material below.

Guidelines:
- Be supportive, concise, and reflective. Ask thoughtful questions that help ${clientName} think for themselves rather than just giving answers.
- Ground responses in their material when relevant; refer to specifics from it.
- When you draw on a specific session, set of notes, or report section, say which one (by date or title) so they can go read it themselves.
- ${humanRouteLine(p.hasCoach)}
- Never invent facts. If something isn't in the material below, say you don't have it. The material below is a relevant selection, not their complete history — if they ask about something you can't see, say so.
- Keep a natural, encouraging tone. No clinical or diagnostic language.`)

  // 2. Voice standards
  sections.push(PORTAL_CHAT_VOICE_STANDARDS)

  // 3. Grounding rules + brief (only when an assessment is in play)
  if (p.assessment) {
    sections.push(ASSESSMENT_GROUNDING_RULES)
    if (p.brief) sections.push(`INTERPRETATION BRIEF (${p.brief.slug} v${p.brief.version}):\n${p.brief.body.trim()}`)
  }

  // 4. Company context — omitted entirely when absent
  const companyDocs = p.company?.documents?.filter((d) => d.text.trim()) || []
  if (p.company && (p.company.vision || p.company.values || companyDocs.length)) {
    const lines = [`COMPANY CONTEXT (${p.company.name}) — use only to connect the work to the organisation; never to judge the person against it:`]
    if (p.company.vision) lines.push(`Vision: ${p.company.vision.trim()}`)
    if (p.company.values) lines.push(`Values: ${p.company.values.trim()}`)
    for (const d of companyDocs) lines.push(`\n## Company document: ${d.title}\n${d.text.trim()}`)
    sections.push(lines.join('\n'))
  }

  // 5 + 6. Structured data, then verbatims
  if (p.assessment) {
    const { structured, verbatims } = formatAssessmentForPrompt(p.assessment.data)
    const count = p.assessment.assessmentCount
    sections.push(
      `${clientName.toUpperCase()}'S MOST RECENT ASSESSMENT — STRUCTURED DATA (${p.assessment.data.instrument}, ${p.assessment.data.report_date}${count > 1 ? `; ${count} assessments on file, the most recent is given in full and its "comparison" block covers the change from the prior one` : ''}). The sole source of truth for every number:\n${structured}`
    )
    if (verbatims) sections.push(`${clientName.toUpperCase()}'S ASSESSMENT — VERBATIM RATER COMMENTS (grouped by rater group only; individual raters are anonymous):\n${verbatims}`)
  }

  // 7. Goals, notes, sessions — omitted when empty
  if (p.goals.length) {
    const goalsText = p.goals
      .map((g) => {
        const metrics = (g.metrics || []).filter(Boolean)
        const who = g.author === 'client' ? ' (set by them)' : ''
        const prog = g.progress !== undefined ? ` — progress ${g.progress}%${g.completed_at ? ', completed' : ''}${g.progress_updated_at ? ` (updated ${g.progress_updated_at.slice(0, 10)})` : ''}` : ' — no progress reported yet'
        return `- ${g.title}${g.description ? `: ${g.description}` : ''}${who}${prog}${metrics.length ? `\n  measures: ${metrics.join('; ')}` : ''}`
      })
      .join('\n')
    sections.push(`${clientName.toUpperCase()}'S COACHING GOALS:\n${goalsText}`)
  }
  const clientDocs = (p.clientDocuments || []).filter((d) => d.text.trim())
  if (clientDocs.length) {
    sections.push(
      `DOCUMENTS ${clientName.toUpperCase()} ADDED TO THEIR PORTAL (their own material; refer to it by title when you draw on it):\n${clientDocs
        .map((d) => `## ${d.title}\n${d.text.trim()}`)
        .join('\n\n')}`
    )
  }
  if (p.myNotes) sections.push(`NOTES ${clientName.toUpperCase()} WROTE FOR THEMSELVES IN THEIR PORTAL (their private journal — treat as their own current thinking; refer to a note by its title when you draw on it):\n${p.myNotes}`)
  if (p.noteParts.length) sections.push(`SESSION NOTES ${clientName.toUpperCase()} RECEIVED FROM THEIR COACH:\n${p.noteParts.join('\n\n')}`)
  if (p.recentParts.length) sections.push(`MOST RECENT SESSIONS:\n${p.recentParts.join('\n\n')}`)
  if (p.retrievedParts.length) sections.push(`EARLIER SESSIONS AND NOTES RELEVANT TO THIS QUESTION:\n${p.retrievedParts.join('\n\n')}`)

  return sections.join('\n\n')
}

// ── Plan your week ──────────────────────────────────────────────────────────

export type WeeklyPlanPromptParts = {
  clientName: string
  /** How they asked to be addressed — used only when the brief permits naming. */
  preferredName: string | null
  hasCoach: boolean
  /** The active weekly_plan brief (Jeff's goal-setting master prompt); null = a built-in floor. */
  brief: PromptBrief | null
  goals: CoachingGoal[]
  /** Compact 360 development picture, when a report is on file. */
  assessmentSummary: string | null
  clientDocuments?: PromptClientDocument[]
  /** The client's own journal ("My notes"), formatted; '' when empty. */
  myNotes?: string
  /** Recent weekly plans + what got checked off, formatted. */
  recentPlans: string
  noteParts: string[]
  /** Today (YYYY-MM-DD) + the Monday of this week, in the client's zone. */
  today: string
  weekStart: string
}

const WEEKLY_PLAN_FLOOR = `You are a coach helping the person plan their week. Ask what a successful week would look like, draw on their goals and material below to suggest the most impactful actions, and work toward an agreed Top 5 for the week. One question per turn. Peer, not expert.`

/**
 * The Plan-your-week system prompt. Deliberately NOT the general reflection
 * preamble: the brief IS the persona here. Layer: brief → voice standards →
 * portal mechanics (how the plan gets saved) → the client's goals / 360
 * development picture / documents / recent plans / notes, each omitted when
 * empty. The 360's structured data is summarised, not dumped — a weekly plan
 * needs the development areas, not every item score.
 */
export function composeWeeklyPlanSystem(p: WeeklyPlanPromptParts): string {
  const sections: string[] = []
  const name = p.clientName.toUpperCase()
  sections.push(p.brief ? `${p.brief.body.trim()}` : WEEKLY_PLAN_FLOOR)
  sections.push(PORTAL_CHAT_VOICE_STANDARDS)
  sections.push(
    `PORTAL MECHANICS:
- Today is ${p.today}; this week began Monday ${p.weekStart}. "This week" means that week.
- The person is in theLeadershipWell client portal. When the Top 5 is agreed, restate it once as a plain numbered list (1–5, one line each, imperative) and tell them they can press "Save this week's plan" to put it on their home page as a checklist. You cannot save it yourself.
- ${p.hasCoach ? 'They have a human coach; anything that needs a person goes to their coach.' : 'They have no assigned coach in this portal; for anything that needs a person, suggest "Talk to a coach" on their home page.'}
- Never invent facts about their work. Everything you know about them is in the material below; if something is not there, ask.${p.preferredName ? `
- If a name is ever needed for clarity, they go by "${p.preferredName}".` : ''}`
  )
  if (p.goals.length) {
    const goalsText = p.goals
      .map((g) => {
        const metrics = (g.metrics || []).filter(Boolean)
        const prog = g.progress !== undefined ? ` — progress ${g.progress}%${g.completed_at ? ', completed' : ''}` : ''
        return `- ${g.title}${g.description ? `: ${g.description}` : ''}${prog}${metrics.length ? `\n  measures: ${metrics.join('; ')}` : ''}`
      })
      .join('\n')
    sections.push(`${name}'S COACHING GOALS (treat these as their Objectives; the measures as Key Results; progress is their own report):\n${goalsText}`)
  }
  if (p.assessmentSummary) sections.push(`${name}'S 360 DEVELOPMENT PICTURE (perception data from their most recent report — use it to suggest where a week's effort compounds; never quote it as ability, never attribute to individual raters):\n${p.assessmentSummary}`)
  const docs = (p.clientDocuments || []).filter((d) => d.text.trim())
  if (docs.length) sections.push(`DOCUMENTS ${name} ADDED TO THEIR PORTAL (their projects, plans, role material — refer to them by title):\n${docs.map((d) => `## ${d.title}\n${d.text.trim()}`).join('\n\n')}`)
  if (p.myNotes) sections.push(`NOTES ${name} WROTE FOR THEMSELVES IN THEIR PORTAL (their private journal; often where projects and intentions live):\n${p.myNotes}`)
  if (p.recentPlans) sections.push(`${name}'S RECENT WEEKLY PLANS (what they committed to and what got done — carry unfinished items forward only if they still matter; ask):\n${p.recentPlans}`)
  if (p.noteParts.length) sections.push(`SESSION NOTES ${name} RECEIVED FROM THEIR COACH:\n${p.noteParts.join('\n\n')}`)
  return sections.join('\n\n')
}

/** A short development summary from a 360 for the weekly-plan prompt. */
export function summariseAssessmentForPlanning(data: Assessment360Data): string {
  const lines: string[] = []
  const strengths = [...data.competency_rankings].sort((a, b) => a.rank - b.rank).slice(0, 3)
  if (strengths.length) lines.push(`Standout competencies (by band): ${strengths.map((c) => `${c.competency} (${c.band})`).join('; ')}`)
  const dev = data.development_candidates.slice(0, 3)
  if (dev.length) lines.push(`Development candidates the report points toward: ${dev.map((c) => `${c.competency}${c.is_passion ? ' (a stated passion)' : ''}`).join('; ')}`)
  const gaps = [...data.gap_analysis].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 3)
  if (gaps.length) lines.push(`Largest self-vs-others gaps: ${gaps.map((g) => `${g.competency} (${g.gap > 0 ? 'others see more than they do' : 'they rate themselves higher than others do'})`).join('; ')}`)
  return lines.join('\n')
}
