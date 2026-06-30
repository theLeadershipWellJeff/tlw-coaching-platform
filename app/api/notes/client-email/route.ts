import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'

export const runtime = 'nodejs'
export const maxDuration = 60

const MODEL = process.env.GENERATE_MODEL || 'claude-sonnet-4-6'

// Strip rich-text HTML to plain text for the prompt.
function toText(html: string): string {
  return (html || '')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/**
 * Turn a coach's raw session note into a clean, client-facing recap email. Only
 * the note itself is sent to the model — never the coach's private Key info.
 * Returns { subject, body } for review before sending; does not send.
 * Body: { content (HTML), clientName, noteTitle? }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const clientName = (body.clientName || '').trim()
  const noteText = toText(body.content || '')
  if (!noteText) return NextResponse.json({ error: 'The note is empty — nothing to send.' }, { status: 400 })

  const firstName = clientName.split(' ')[0] || 'there'

  const prompt = `You are Jeff Holmes, executive coach at theLeadershipWell. Turn the raw session note below into a terse, client-facing recap email to ${clientName}.

Guidelines:
- Be brief and scannable. Prefer bullet lists (- item) over prose wherever there are multiple related points — themes explored, what surfaced, key decisions, shifts in thinking.
- One short opening sentence greeting ${firstName}. One short closing sentence. No filler or padding.
- Keep Jeff's warm, direct voice, but scannable structure beats wordiness.
- Do NOT list the "ACTION:" or "INSIGHT:" items — those are appended separately as an interactive checklist and Insights list; repeating them would duplicate.
- Do NOT invent anything not in the note. If the note is thin, keep the email very short.
- Sign off as "Jeff". No subject line inside the body. No AI mention.

Return ONLY valid JSON — no markdown fences, no preamble:
{"subject": "Short, specific subject line", "body": "The email as plain text. Use bullet lists (- item) wherever there are multiple related points."}

RAW SESSION NOTE${body.noteTitle ? ` (“${String(body.noteTitle).trim()}”)` : ''}:
${noteText}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  try {
    const message = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      },
      { timeout: 50_000, maxRetries: 1 }
    )
    const block = message.content.find((b) => b.type === 'text')
    const raw = block && 'text' in block ? block.text : ''
    const clean = raw.replace(/```json\n?|```/g, '').trim()
    const match = clean.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match ? match[0] : clean)
    const subject = String(parsed?.subject || '').trim() || `A note from our session, ${firstName}`
    const bodyText = String(parsed?.body || '').trim()
    if (!bodyText) throw new Error('empty')
    return NextResponse.json({ subject, body: bodyText })
  } catch {
    return NextResponse.json({ error: 'Could not draft the email from this note.' }, { status: 502 })
  }
}
