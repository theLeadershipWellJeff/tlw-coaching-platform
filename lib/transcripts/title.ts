/**
 * AI-proposed transcript title — the safety net for recordings that arrive with
 * no usable name signal at all. Plaud via Zapier often posts bare markdown (no
 * filename, no summary field, no front matter), which left the review queue
 * showing "Untitled recording" and forced the coach to open each transcript to
 * figure out whose session it was. This reads the opening of the transcript and
 * proposes a short human title, leading with the participant's name when one
 * can be heard in the conversation.
 *
 * Best-effort by design: any failure (no API key, timeout, unparseable output)
 * returns null and the deterministic title chain in parse.ts stands. Mirrors
 * the retired-model guard used by the scoring engine and nudge pipeline.
 */
import Anthropic from '@anthropic-ai/sdk'

// Titling is a trivial extraction task — the small fast model is plenty.
const SAFE_DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const RETIRED_MODELS = new Set([
  'claude-sonnet-4-20250514',
  'claude-3-5-sonnet-20240620',
  'claude-3-5-sonnet-20241022',
  'claude-3-opus-20240229',
  'claude-3-haiku-20240307',
])

function resolveTitleModel(): string {
  const configured = process.env.TITLE_MODEL?.trim()
  if (configured && RETIRED_MODELS.has(configured)) {
    console.warn(`TITLE_MODEL "${configured}" is retired; falling back to ${SAFE_DEFAULT_MODEL}.`)
    return SAFE_DEFAULT_MODEL
  }
  return configured || SAFE_DEFAULT_MODEL
}

const OPENING_CHARS = 6000
const MAX_TITLE = 80

export async function proposeTranscriptTitle(
  body: string,
  opts: { coachName?: string | null } = {}
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const opening = body.trim().slice(0, OPENING_CHARS)
  if (!opening) return null

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create(
      {
        model: resolveTitleModel(),
        max_tokens: 200,
        system: [
          'You title coaching-session recordings from the opening of a transcript.',
          'Return ONLY a JSON object: {"participants": string[], "topic": string}.',
          '- participants: given names of the people in the conversation who are NOT the coach,',
          '  as actually heard (introductions, greetings, being addressed by name). Empty array if none are audible.',
          opts.coachName ? `- The coach is ${opts.coachName} — never list the coach as a participant.` : '',
          '- topic: a 3–8 word noun phrase for what the conversation is about',
          '  (e.g. "new-client orientation and goal setting"). No quotes, no trailing period.',
          'Never invent names. If unsure of a name, leave it out.',
        ]
          .filter(Boolean)
          .join('\n'),
        messages: [{ role: 'user', content: `Transcript opening:\n\n${opening}` }],
      },
      { timeout: 25_000, maxRetries: 1 }
    )
    const block = message.content.find((b) => b.type === 'text')
    const raw = block && 'text' in block ? block.text : ''
    const match = raw.replace(/```json\n?|```/g, '').match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0]) as { participants?: unknown; topic?: unknown }

    const names = Array.isArray(parsed.participants)
      ? parsed.participants.filter((p): p is string => typeof p === 'string' && !!p.trim()).map((p) => p.trim())
      : []
    const topic = typeof parsed.topic === 'string' ? parsed.topic.trim() : ''
    const title = names.length > 0 ? `${names.join(' & ')} — ${topic || 'coaching session'}` : topic
    if (!title) return null
    return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1).trimEnd()}…` : title
  } catch (e: any) {
    console.error('Transcript title proposal failed:', e?.message || e)
    return null
  }
}
