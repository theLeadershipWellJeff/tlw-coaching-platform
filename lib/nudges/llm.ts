/**
 * Shared Claude plumbing for the nudge pipeline (extraction + drafting). Every
 * call goes through the AI gateway (lib/ai/client.ts): the model comes from the
 * purpose (`nudge_extract` / `nudge_draft` in lib/ai/models.ts) and each call is
 * metered on the usage ledger against the coach + client it was made for.
 */
import { aiCreate, isAiConfigured, textOf, type AiCallMeta } from '@/lib/ai/client'

export type NudgeLlmMeta = Pick<AiCallMeta, 'purpose' | 'feature' | 'principal' | 'orgId' | 'coachId' | 'clientId'>

/** Run a single-turn completion and return the raw text. Throws if not configured. */
export async function complete(opts: {
  system: string
  user: string
  maxTokens?: number
  meta: NudgeLlmMeta
}): Promise<string> {
  if (!isAiConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is not configured.')
  }
  const message = await aiCreate(opts.meta, {
    max_tokens: opts.maxTokens ?? 1500,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
    timeoutMs: 60_000,
  })
  return textOf(message)
}

/** Extract the first JSON value (object or array) from a model response. */
export function parseJsonFrom<T>(raw: string): T {
  const clean = raw.replace(/```json\n?|```/g, '').trim()
  const match = clean.match(/[[{][\s\S]*[\]}]/)
  if (!match) throw new Error('Model returned no JSON.')
  return JSON.parse(match[0]) as T
}
