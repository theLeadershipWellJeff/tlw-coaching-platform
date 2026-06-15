/**
 * Generate a single, practice-ready coaching move to raise one ICF competency,
 * grounded in what actually happened in the scored session. Used by the report
 * view's expandable competency rows. Deliberately narrow: one focused
 * recommendation, not a menu — and always tied to this session's evidence.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { CompetencyScore, SessionReportJson } from './types'

const MODEL = process.env.SUGGEST_MODEL || process.env.SCORING_MODEL || 'claude-sonnet-4-6'

export interface SuggestInput {
  competency: CompetencyScore
  report: SessionReportJson
  transcriptBody: string
}

const SYSTEM = `You are theLeadershipWell's coaching development advisor. Given one ICF competency and what happened in a single scored session, you give the coach ONE concrete, practice-ready move to raise that competency next session. Rules: be specific to THIS session's evidence — never generic coaching platitudes; one focused recommendation, not a menu of options; 2-4 sentences, second person ("Next time…", "Try…"); when useful, include one short phrase the coach could actually say, in quotes. No preamble, no headings, no markdown.`

export async function suggestCompetencyMove(input: SuggestInput): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured.')
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const { competency: c, report, transcriptBody } = input
  // Ground the suggestion in the transcript without paying for the whole thing.
  const excerpt = transcriptBody.slice(0, 6000)

  const prompt = `COMPETENCY TO IMPROVE
  ${c.id}. ${c.name} (domain: ${c.domain})
  current score: ${c.score}/5 (${c.band})
  evidence from this session: ${c.evidence || '—'}
  sub-competency refs: ${c.subcompetency_refs.join(', ') || '—'}

SESSION CONTEXT
  client (initials only): ${report.session.client_initials}
  what went well: ${report.win.went_well || '—'}
  the one thing to improve: ${report.win.improve || '—'}
  overall: ${report.overall_score}/5 (${report.band})

TRANSCRIPT EXCERPT (for grounding; may be truncated)
${excerpt || '(no transcript text available)'}

Give one specific move to raise competency ${c.id} (${c.name}) in the next session, grounded in what actually happened above.`

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const block = message.content.find((b) => b.type === 'text')
  const text = block && 'text' in block ? block.text.trim() : ''
  if (!text) throw new Error('No suggestion was generated.')
  return text
}
