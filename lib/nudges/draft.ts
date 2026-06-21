/**
 * Nudge drafting (Phase A). Turns a single (already deduped, already capped)
 * candidate into a short client-facing message in the coach's voice (§7).
 *
 * Voice: warm, first-name, brief; reference the last session lightly; name the
 * upcoming context when known; frame actions as experiments; end encouraging.
 * Never write a signature — it's appended server-side at send time.
 */
import { complete, parseJsonFrom } from './llm'
import type { NudgeCandidate, NudgeDraft } from './types'

const SYSTEM = `You write a single short, warm, between-session email from an executive coach to their client. It must sound like the coach, not like software.

Voice rules:
- Warm, first-name, brief — short enough to read on a phone in ~15 seconds.
- Reference the last session lightly. Name the upcoming context only if it's given to you.
- For an action follow-up: frame it as a curious, low-pressure experiment ("Did you try ... How did it go?"), never a compliance check.
- For an insight: gently re-surface the one insight so it stays alive between sessions.
- End encouraging.
- Plain, natural language. No corporate stiffness. No bullet lists unless it truly helps.
- Do NOT include a signature, sign-off block, or "[Your name]" — a signature is added automatically. A short closing line like "Talk soon!" is fine.

Return ONLY JSON: { "subject": string, "body": string }. The body is plain text (use blank lines between paragraphs).`

export async function draftNudge(opts: {
  clientFirstName: string
  candidate: NudgeCandidate
  // Light, optional context the message may reference.
  upcomingContext?: string | null
}): Promise<NudgeDraft | null> {
  const { clientFirstName, candidate, upcomingContext } = opts

  const lines: string[] = [
    `CLIENT FIRST NAME: ${clientFirstName}`,
    `NUDGE TYPE: ${candidate.type === 'action_checkin' ? 'action follow-up (experiment check-in)' : 'insight re-surfacing'}`,
    `WHAT IT'S ABOUT: ${candidate.trigger_excerpt}`,
  ]
  if (candidate.action_description) lines.push(`THE COMMITMENT THEY MADE: ${candidate.action_description}`)
  if (upcomingContext) lines.push(`UPCOMING CONTEXT (may reference): ${upcomingContext}`)

  const raw = await complete({ system: SYSTEM, user: lines.join('\n'), maxTokens: 600 })
  let parsed: { subject?: unknown; body?: unknown }
  try {
    parsed = parseJsonFrom<{ subject?: unknown; body?: unknown }>(raw)
  } catch {
    return null
  }
  const subject = typeof parsed.subject === 'string' ? parsed.subject.trim() : ''
  const body = typeof parsed.body === 'string' ? parsed.body.trim() : ''
  if (!body) return null
  return { subject: subject || 'A quick note', body }
}
