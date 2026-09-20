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
 * the retired-model guard in lib/ai/models.ts.
 */
import { aiCreate, isAiConfigured, textOf } from '@/lib/ai/client'

// Titling is a trivial extraction task — the small fast model is plenty
// (purpose `transcript_title` in lib/ai/models.ts).

const OPENING_CHARS = 6000
const MAX_TITLE = 80

export async function proposeTranscriptTitle(
  body: string,
  opts: { coachName?: string | null; coachId?: string | null; orgId?: string | null } = {}
): Promise<string | null> {
  if (!isAiConfigured()) return null
  const opening = body.trim().slice(0, OPENING_CHARS)
  if (!opening) return null

  try {
    const message = await aiCreate(
      { purpose: 'transcript_title', principal: 'system', orgId: opts.orgId ?? null, coachId: opts.coachId ?? null },
      {
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
        timeoutMs: 25_000,
      }
    )
    const raw = textOf(message)
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
