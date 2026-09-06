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
export type PromptCompany = { name: string; vision: string | null; values: string | null }

export type PromptParts = {
  clientName: string
  /** Whether a coach is linked — decides where "talk to a human" points. */
  hasCoach: boolean
  brief: PromptBrief | null
  company: PromptCompany | null
  assessment: { data: Assessment360Data; assessmentCount: number } | null
  goals: CoachingGoal[]
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
  if (p.company && (p.company.vision || p.company.values)) {
    const lines = [`COMPANY CONTEXT (${p.company.name}) — use only to connect the work to the organisation; never to judge the person against it:`]
    if (p.company.vision) lines.push(`Vision: ${p.company.vision.trim()}`)
    if (p.company.values) lines.push(`Values: ${p.company.values.trim()}`)
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
        return `- ${g.title}${g.description ? `: ${g.description}` : ''}${who}${metrics.length ? `\n  measures: ${metrics.join('; ')}` : ''}`
      })
      .join('\n')
    sections.push(`${clientName.toUpperCase()}'S COACHING GOALS:\n${goalsText}`)
  }
  if (p.noteParts.length) sections.push(`SESSION NOTES ${clientName.toUpperCase()} RECEIVED FROM THEIR COACH:\n${p.noteParts.join('\n\n')}`)
  if (p.recentParts.length) sections.push(`MOST RECENT SESSIONS:\n${p.recentParts.join('\n\n')}`)
  if (p.retrievedParts.length) sections.push(`EARLIER SESSIONS AND NOTES RELEVANT TO THIS QUESTION:\n${p.retrievedParts.join('\n\n')}`)

  return sections.join('\n\n')
}
