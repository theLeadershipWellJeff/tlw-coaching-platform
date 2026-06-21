/**
 * Nudge extraction (Phase A). Given a client's coaching context and their latest
 * session material, propose candidate action check-ins and insight reminders.
 *
 * Hard rule (§3.1 — the key-info wall): this step NEVER receives the private
 * key-info field. The caller (generate.ts) is responsible for never loading it;
 * this signature simply has no place to put it.
 *
 * Output is a structured candidate list (lib/nudges/types.ts#NudgeCandidate).
 * Dedup + the restraint cap are applied by the caller BEFORE drafting (§7).
 */
import { complete, parseJsonFrom } from './llm'
import type { NudgeCandidate } from './types'

export type ExtractionInput = {
  clientName: string
  // Goal titles + descriptions only (clients.coaching_goals).
  goals: { title: string; description: string }[]
  // Still-open action descriptions (the only actions a check-in may follow up on).
  openActions: string[]
  // Recent session notes as plain text, newest first (key-info excluded).
  recentNotes: string[]
  // The matched transcript body, if this run was triggered by a scored session.
  transcript?: string | null
}

const SYSTEM = `You are an assistant to an executive coach. After a coaching session you propose short, warm, between-session "nudges" the coach might send the client. You ONLY propose two kinds:

- "action_checkin": a gentle, experiment-framed follow-up on a SPECIFIC commitment the client made and that is still open. Frame it as curiosity about how an experiment went, never as a compliance check.
- "insight": re-surfaces ONE meaningful insight from the session that is worth holding onto.

Rules:
- Propose only what is genuinely grounded in the material. If nothing warrants a nudge, return an empty array. Silence is a valid, good answer.
- An action_checkin MUST correspond to one of the provided still-open actions; copy that action's text into "action_description" verbatim.
- Never invent commitments or insights that aren't in the material.
- Keep "trigger_excerpt" to a short quote/paraphrase from the source. Keep "rationale" to one plain sentence.
- Do NOT write the message itself here — only the structured candidate. Drafting happens in a later step.

Return ONLY a JSON array (no prose) of objects:
[{ "type": "action_checkin" | "insight", "trigger_excerpt": string, "rationale": string, "action_description"?: string }]`

function buildUser(input: ExtractionInput): string {
  const parts: string[] = []
  parts.push(`CLIENT: ${input.clientName}`)
  if (input.goals.length) {
    parts.push(
      'COACHING GOALS:\n' +
        input.goals.map((g) => `- ${g.title}: ${g.description}`).join('\n')
    )
  }
  parts.push(
    'STILL-OPEN ACTIONS (an action_checkin may only follow up on one of these):\n' +
      (input.openActions.length ? input.openActions.map((a) => `- ${a}`).join('\n') : '(none)')
  )
  if (input.recentNotes.length) {
    parts.push('RECENT SESSION NOTES (newest first):\n' + input.recentNotes.join('\n\n---\n\n'))
  }
  if (input.transcript) {
    // Cap the transcript so a very long session doesn't blow the context.
    parts.push('LATEST SESSION TRANSCRIPT:\n' + input.transcript.slice(0, 24000))
  }
  return parts.join('\n\n')
}

export async function extractNudgeCandidates(input: ExtractionInput): Promise<NudgeCandidate[]> {
  // Nothing to work from → nothing to propose.
  if (!input.openActions.length && !input.recentNotes.length && !input.transcript) return []

  const raw = await complete({ system: SYSTEM, user: buildUser(input), maxTokens: 1200 })
  let parsed: any[]
  try {
    parsed = parseJsonFrom<any[]>(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed
    .filter((c) => c && (c.type === 'action_checkin' || c.type === 'insight'))
    .map((c) => ({
      type: c.type,
      origin: 'auto' as const,
      trigger_excerpt: String(c.trigger_excerpt || '').slice(0, 600),
      rationale: String(c.rationale || '').slice(0, 300),
      action_description:
        c.type === 'action_checkin' && c.action_description
          ? String(c.action_description)
          : undefined,
    }))
    // An action_checkin must match a real still-open action — drop hallucinations.
    .filter(
      (c) =>
        c.type !== 'action_checkin' ||
        (c.action_description && input.openActions.includes(c.action_description))
    )
}
