/**
 * Growth pass — the separate AI scoring run for coach growth areas.
 *
 * One Claude call assesses ALL of the coach's active growth areas against a
 * single transcript. This is deliberately kept separate from the ICF pass
 * (different model call, stored in a different table, never changes ICF scores).
 *
 * Input: transcript body + coach's active growth areas with their band scales.
 * Output: one assessment object per area, matching the growth_area_assessments
 * schema. The Observed Gate is mandatory: if the session offered no genuine
 * opportunity to demonstrate an area, observed = false and no band is assigned.
 * "Not observed" is neutral and expected — never a low score by default.
 *
 * Key info hard wall: this function receives only transcript text and coach notes.
 * client.key_info is never passed in; callers must not include it.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { CoachGrowthArea, GrowthAreaAssessment } from '@/lib/supabase/types'

const MODEL = process.env.SUGGEST_MODEL || process.env.SCORING_MODEL || 'claude-sonnet-4-6'

export interface GrowthPassInput {
  transcriptBody: string
  coachNotes?: string
  areas: CoachGrowthArea[]
}

export type GrowthPassResult = Omit<GrowthAreaAssessment, 'id' | 'session_id' | 'coach_id' | 'created_at'>[]

const SYSTEM = `You are theLeadershipWell's coaching development advisor. You assess a coaching transcript against a set of coach-defined growth areas — personal development focuses the coach has chosen for their own craft.

For each growth area you must:
1. DECIDE THE OBSERVED GATE FIRST. Ask: did this session offer a genuine, clear opportunity for the coach to demonstrate this growth area? If the session gave no natural opening — the topic never came up, or the session arc simply didn't touch this skill — mark observed = false and provide a brief one-sentence reason. "Not observed" is a valid, neutral, expected outcome. NEVER assign a low band as a substitute for "not observed." Bias toward "not observed" over a forced low score when the opportunity is ambiguous.
2. IF OBSERVED: assign a band (1–5) strictly from the coach's stored band scale. Quote the band description that best matches what you saw. Cite 1–3 specific moments from the transcript as evidence (exact quotes or close paraphrases with timestamps when available). Write a short forward-looking developmental note (2–3 sentences, second person, coaching-of-the-coach tone — "Next session…", "One thing to try…"). The note must be grounded in THIS session's evidence.

Rules:
- Never fabricate evidence. If you can't find clear evidence in the transcript, that is a signal to mark observed = false.
- The developmental note is forward-looking, never a criticism. Keep the tone warm and growth-oriented.
- Never reference client key info — you will not receive it.
- Return ONLY the JSON array described below. No prose, no markdown fences.`

export async function runGrowthPass(input: GrowthPassInput): Promise<GrowthPassResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured.')
  }
  if (input.areas.length === 0) return []

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Build a compact representation of each area for the prompt.
  const areasBlock = input.areas
    .map((a, i) => {
      const bandLines =
        a.band_scale.length === 5
          ? a.band_scale.map((b) => `  Band ${b.band}: ${b.description}`).join('\n')
          : '  (no band scale defined — use your judgment for 1–5)'
      return `GROWTH AREA ${i + 1}
id: ${a.id}
title: ${a.title}
description: ${a.description || '(none)'}
I am least proficient when: ${a.least_proficient_when || '(not specified)'}
I am most proficient when: ${a.most_proficient_when || '(not specified)'}
Band scale:
${bandLines}`
    })
    .join('\n\n')

  const transcript = input.transcriptBody.slice(0, 24000)
  const notes = input.coachNotes ? `\nCOACH SESSION NOTES\n${input.coachNotes.slice(0, 2000)}` : ''

  const prompt = `${areasBlock}

TRANSCRIPT (may be truncated)
${transcript}${notes}

Return a JSON array with exactly ${input.areas.length} object(s), one per growth area, in the same order:
[
  {
    "growth_area_id": "<the id from above>",
    "observed": true or false,
    "not_observed_reason": "<one sentence, only when observed = false, else null>",
    "band": <1–5 integer, null when observed = false>,
    "evidence": [
      {"quote_or_paraphrase": "…", "timestamp": "mm:ss or null"}
    ],
    "developmental_note": "<2–3 sentences, forward-looking, second person; empty string when observed = false>"
  }
]`

  const message = await client.messages.create(
    {
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    },
    { timeout: 90_000, maxRetries: 1 }
  )

  const block = message.content.find((b) => b.type === 'text')
  const raw = block && 'text' in block ? block.text.trim() : ''
  if (!raw) throw new Error('Growth pass returned no output.')

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Growth pass response was not valid JSON.')
  }

  if (!Array.isArray(parsed)) throw new Error('Growth pass response must be a JSON array.')

  return (parsed as Array<Record<string, unknown>>).map((item) => ({
    growth_area_id: String(item.growth_area_id ?? ''),
    observed: Boolean(item.observed),
    band: item.band != null ? Number(item.band) : null,
    evidence: Array.isArray(item.evidence) ? (item.evidence as GrowthAreaAssessment['evidence']) : [],
    developmental_note: String(item.developmental_note ?? ''),
    definition_version_snapshot: 0, // caller fills this in from the area record
  }))
}
