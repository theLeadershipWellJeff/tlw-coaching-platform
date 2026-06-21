/**
 * Nudge extraction (Phase A + B). Given a client's coaching context and their
 * latest session material, propose candidate action check-ins, insight reminders,
 * and — when the coach has surfaceable garden frameworks — framework re-surfacings.
 *
 * Hard rule (§3.1 — the key-info wall): this step NEVER receives the private
 * key-info field. The caller (generate.ts) is responsible for never loading it.
 *
 * Output is a structured candidate list (lib/nudges/types.ts#NudgeCandidate).
 * Dedup + the restraint cap are applied by the caller BEFORE drafting (§7).
 */
import { complete, parseJsonFrom } from './llm'
import type { NudgeCandidate } from './types'
import type { SurfaceableLeaf } from './garden'

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
  // The coach's client-surfaceable frameworks (garden leaves). Empty = no framework
  // candidates are possible this run.
  frameworks?: SurfaceableLeaf[]
}

const SYSTEM = `You are an assistant to an executive coach. After a coaching session you propose short, warm, between-session "nudges" the coach might send the client. You propose at most three kinds:

- "action_checkin": a gentle, experiment-framed follow-up on a SPECIFIC commitment the client made and that is still open. Frame it as curiosity about how an experiment went, never as a compliance check.
- "insight": re-surfaces ONE meaningful insight from the session that is worth holding onto.
- "framework": re-surfaces ONE of the coach's frameworks (provided in AVAILABLE FRAMEWORKS) that is relevant to this session. Relevance can be (a) the coach NAMED/taught it, (b) the session's themes clearly match it, or (c) a CONNECTION: something the client raised (a struggle, a situation) connects to the framework — including through the framework's "connects to" neighbourhood — even though the coach didn't bring it up. Only ever choose from the provided list.

Rules:
- Propose only what is genuinely grounded in the material. If nothing warrants a nudge, return an empty array. Silence is a valid, good answer.
- An action_checkin MUST correspond to one of the provided still-open actions; copy that action's text into "action_description" verbatim.
- A framework MUST be one of the AVAILABLE FRAMEWORKS; put its exact "id" into "framework_slug". Set "framework_basis" to "named" (the coach named/taught it), "theme" (themes match), or "connection" (it connects to something the client raised but wasn't mentioned). For a connection, make "trigger_excerpt" the exact thing the client raised that it connects to (e.g. "struggles leading meetings"), and "rationale" the one-line bridge ("BART is an org framework that works well for meetings"). Do not propose a framework if none is genuinely relevant.
- Never invent commitments, insights, or frameworks that aren't in the material/list.
- Keep "trigger_excerpt" to a short quote/paraphrase from the source. Keep "rationale" to one plain sentence.
- Do NOT write the message itself here — only the structured candidate. Drafting happens in a later step.

Return ONLY a JSON array (no prose) of objects:
[{ "type": "action_checkin" | "insight" | "framework", "trigger_excerpt": string, "rationale": string, "action_description"?: string, "framework_slug"?: string, "framework_basis"?: "named" | "theme" }]`

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
  if (input.frameworks && input.frameworks.length) {
    parts.push(
      'AVAILABLE FRAMEWORKS (a framework nudge may only use one of these; use the id):\n' +
        input.frameworks
          .map((f) => {
            const themes = f.themes.length ? ` · themes: ${f.themes.join(', ')}` : ''
            const aka = f.aliases.length ? ` · aka: ${f.aliases.join(', ')}` : ''
            const rel = f.related.length ? ` · connects to: ${f.related.join(', ')}` : ''
            const sum = f.summary ? ` — ${f.summary}` : ''
            return `- id: ${f.id} · ${f.title}${themes}${aka}${rel}${sum}`
          })
          .join('\n')
    )
  }
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

  const raw = await complete({ system: SYSTEM, user: buildUser(input), maxTokens: 1400 })
  let parsed: any[]
  try {
    parsed = parseJsonFrom<any[]>(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const frameworkIds = new Set((input.frameworks || []).map((f) => f.id))

  return parsed
    .filter((c) => c && (c.type === 'action_checkin' || c.type === 'insight' || c.type === 'framework'))
    .map((c): NudgeCandidate => ({
      type: c.type,
      // named → 'mentioned' (the coach raised it); theme/connection → 'suggested'
      // (the bridge the coach didn't make in session).
      origin:
        c.type === 'framework' ? (c.framework_basis === 'named' ? 'mentioned' : 'suggested') : 'auto',
      trigger_excerpt: String(c.trigger_excerpt || '').slice(0, 600),
      rationale: String(c.rationale || '').slice(0, 300),
      action_description:
        c.type === 'action_checkin' && c.action_description
          ? String(c.action_description)
          : undefined,
      framework_slug:
        c.type === 'framework' && typeof c.framework_slug === 'string'
          ? c.framework_slug.trim().toLowerCase()
          : undefined,
    }))
    // An action_checkin must match a real still-open action — drop hallucinations.
    .filter(
      (c) =>
        c.type !== 'action_checkin' ||
        (c.action_description && input.openActions.includes(c.action_description))
    )
    // A framework must reference a real surfaceable leaf — drop anything else.
    .filter((c) => c.type !== 'framework' || (c.framework_slug && frameworkIds.has(c.framework_slug)))
}
