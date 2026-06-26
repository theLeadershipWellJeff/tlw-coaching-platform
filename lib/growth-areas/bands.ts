/**
 * AI band-scale generation for coach growth areas. Takes the coach's own
 * anchor phrases and returns a 1–5 band scale:
 *   band 1 = the coach's "least proficient" wording (their floor)
 *   band 5 = the coach's "most proficient" wording (their ceiling)
 *   bands 2–4 = AI-interpolated concrete, observable in-session behaviors
 *
 * The caller decides which bands to accept — bands the coach has already
 * hand-edited (coach_edited = true) must never be overwritten.
 *
 * Mirrors the shape of lib/scoring/suggest.ts.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { GrowthAreaBand } from '@/lib/supabase/types'

const MODEL = process.env.SUGGEST_MODEL || process.env.SCORING_MODEL || 'claude-sonnet-4-6'

const SYSTEM = `You are a coaching development advisor helping a coach articulate their personal growth trajectory. Given a growth area and two anchor phrases the coach wrote in their own words, generate a 1–5 proficiency scale. Rules:
- Band 1 MUST be grounded in the coach's "least proficient" phrasing — use their words, expressed as observable in-session behavior.
- Band 5 MUST be grounded in the coach's "most proficient" phrasing — use their words, expressed as observable in-session behavior.
- Bands 2, 3, and 4 are concrete, observable in-session behaviors that step evenly between band 1 and band 5.
- Each description is 1–2 sentences, second person, present tense ("You…"), grounded in what an observer in the session would actually see or hear.
- Never use abstract language or coaching jargon as a substitute for concrete behavior.
- Return ONLY a JSON array of exactly 5 objects: [{band: 1, description: "…"}, …, {band: 5, description: "…"}]. No prose, no markdown fences.`

export async function generateBandScale(
  title: string,
  description: string,
  leastProficientWhen: string,
  mostProficientWhen: string
): Promise<GrowthAreaBand[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured.')
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `GROWTH AREA
Title: ${title}
Description: ${description || '(none)'}

COACH'S ANCHOR PHRASES
"I am least proficient when…": ${leastProficientWhen}
"I am most proficient when…": ${mostProficientWhen}

Generate the 1–5 band scale. Return JSON only.`

  const message = await client.messages.create(
    {
      model: MODEL,
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    },
    { timeout: 50_000, maxRetries: 1 }
  )

  const block = message.content.find((b) => b.type === 'text')
  const raw = block && 'text' in block ? block.text.trim() : ''
  if (!raw) throw new Error('No band scale was generated.')

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Band scale response was not valid JSON.')
  }

  if (!Array.isArray(parsed) || parsed.length !== 5) {
    throw new Error('Band scale must be an array of exactly 5 items.')
  }

  return (parsed as Array<{ band: number; description: string }>).map((item) => ({
    band: item.band as 1 | 2 | 3 | 4 | 5,
    description: String(item.description || '').trim(),
    coach_edited: false,
  }))
}
