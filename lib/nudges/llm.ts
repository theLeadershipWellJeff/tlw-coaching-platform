/**
 * Shared Claude plumbing for the nudge pipeline (extraction + drafting). Mirrors
 * the model-resolution guard in lib/scoring/engine.ts so a stale env var can't
 * silently point at a retired model.
 */
import Anthropic from '@anthropic-ai/sdk'

const SAFE_DEFAULT_MODEL = 'claude-sonnet-4-6'
const RETIRED_MODELS = new Set([
  'claude-sonnet-4-20250514',
  'claude-3-5-sonnet-20240620',
  'claude-3-5-sonnet-20241022',
  'claude-3-opus-20240229',
])

export function resolveNudgeModel(): string {
  const configured = process.env.NUDGE_MODEL?.trim()
  if (configured && RETIRED_MODELS.has(configured)) {
    console.warn(`NUDGE_MODEL "${configured}" is retired; falling back to ${SAFE_DEFAULT_MODEL}.`)
    return SAFE_DEFAULT_MODEL
  }
  return configured || SAFE_DEFAULT_MODEL
}

/** Run a single-turn completion and return the raw text. Throws if not configured. */
export async function complete(opts: {
  system: string
  user: string
  maxTokens?: number
}): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured.')
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const message = await client.messages.create(
    {
      model: resolveNudgeModel(),
      max_tokens: opts.maxTokens ?? 1500,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
    },
    { timeout: 60_000, maxRetries: 1 }
  )
  const block = message.content.find((b) => b.type === 'text')
  return block && 'text' in block ? block.text : ''
}

/** Extract the first JSON value (object or array) from a model response. */
export function parseJsonFrom<T>(raw: string): T {
  const clean = raw.replace(/```json\n?|```/g, '').trim()
  const match = clean.match(/[[{][\s\S]*[\]}]/)
  if (!match) throw new Error('Model returned no JSON.')
  return JSON.parse(match[0]) as T
}
