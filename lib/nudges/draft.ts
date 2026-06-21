/**
 * Nudge drafting (Phase A + B). Turns a single (already deduped, already capped)
 * candidate into a short client-facing message in the coach's voice (§7).
 *
 * Voice: warm, first-name, brief; reference the last session lightly; name the
 * upcoming context when known; frame actions as experiments; end encouraging.
 * Never write a signature — it's appended server-side at send time.
 *
 * Framework nudges (Phase B) additionally receive the leaf's LIVE content + summary
 * + surfaceable neighbours; the draft re-voices the coach's own framework into a
 * short reminder — it must not dump the note.
 */
import { complete, parseJsonFrom } from './llm'
import type { NudgeCandidate, NudgeDraft } from './types'
import type { FrameworkDraftContext } from './garden'

const SYSTEM = `You write a single short, warm, between-session email from an executive coach to their client. It must sound like the coach, not like software.

Voice rules:
- Warm, first-name, brief — short enough to read on a phone in ~15 seconds.
- Reference the last session lightly. Name the upcoming context only if it's given to you.
- For an action follow-up: frame it as a curious, low-pressure experiment ("Did you try ... How did it go?"), never a compliance check.
- For an insight: gently re-surface the one insight so it stays alive between sessions.
- For a framework: re-surface it as a living idea to carry into the week. If FRAMEWORK WAS NAMED is "no", draw the BRIDGE explicitly — open from the specific thing the client raised, note you didn't bring it up in the moment, then introduce the framework as a fit (e.g. "When you mentioned your struggles leading meetings, something kept tugging at me that I didn't raise — there's a framework, BART, that's built for organizations but works beautifully for meetings too…"). If it was named, just keep it alive with a light reminder. Put it in plain language, anchor it to the session, and optionally nod to one RELATED IDEA if given. Draw on FRAMEWORK CONTENT for accuracy but DO NOT paste or summarize the whole note; a sentence or two of the essence is plenty.
- End encouraging.
- Plain, natural language. No corporate stiffness. No bullet lists unless it truly helps.
- Do NOT include a signature, sign-off block, or "[Your name]" — a signature is added automatically. A short closing line like "Talk soon!" is fine.

Return ONLY JSON: { "subject": string, "body": string }. The body is plain text (use blank lines between paragraphs).`

function typeLabel(candidate: NudgeCandidate): string {
  if (candidate.type === 'action_checkin') return 'action follow-up (experiment check-in)'
  if (candidate.type === 'framework') return 'framework re-surfacing'
  return 'insight re-surfacing'
}

export async function draftNudge(opts: {
  clientFirstName: string
  candidate: NudgeCandidate
  // Light, optional context the message may reference.
  upcomingContext?: string | null
  // Present only for framework nudges (Phase B).
  frameworkContext?: FrameworkDraftContext | null
}): Promise<NudgeDraft | null> {
  const { clientFirstName, candidate, upcomingContext, frameworkContext } = opts

  const lines: string[] = [
    `CLIENT FIRST NAME: ${clientFirstName}`,
    `NUDGE TYPE: ${typeLabel(candidate)}`,
    `WHAT IT'S ABOUT: ${candidate.trigger_excerpt}`,
  ]
  if (candidate.action_description) lines.push(`THE COMMITMENT THEY MADE: ${candidate.action_description}`)
  if (frameworkContext) {
    lines.push(`FRAMEWORK NAME: ${frameworkContext.title}`)
    // 'mentioned' = the coach named it in session; anything else = a bridge they
    // didn't make out loud (drives the "I didn't raise this, but…" framing).
    lines.push(`FRAMEWORK WAS NAMED: ${candidate.origin === 'mentioned' ? 'yes' : 'no'}`)
    if (frameworkContext.summary) lines.push(`FRAMEWORK SUMMARY: ${frameworkContext.summary}`)
    if (frameworkContext.content) {
      lines.push(`FRAMEWORK CONTENT (for accuracy — do not paste):\n${frameworkContext.content.slice(0, 3000)}`)
    }
    if (frameworkContext.related.length) {
      lines.push(
        'RELATED IDEAS (optional, may nod to one):\n' +
          frameworkContext.related
            .map((r) => `- ${r.title}${r.summary ? `: ${r.summary}` : ''}`)
            .join('\n')
      )
    }
  }
  if (upcomingContext) lines.push(`UPCOMING CONTEXT (may reference): ${upcomingContext}`)

  const raw = await complete({ system: SYSTEM, user: lines.join('\n'), maxTokens: 700 })
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
