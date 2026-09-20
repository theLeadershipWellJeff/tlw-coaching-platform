import { NextRequest, NextResponse } from 'next/server'
import { aiCreate, isAiConfigured, textOf } from '@/lib/ai/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { CLIENT_VOICE_STANDARDS } from '@/lib/writing-standards'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach, coachDisplayName } from '@/lib/coach'

export const runtime = 'nodejs'
export const maxDuration = 60

// Model: purpose `note_client_email` in lib/ai/models.ts.

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
  if (!isAiConfigured()) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const clientName = (body.clientName || '').trim()
  const noteText = toText(body.content || '')
  if (!noteText) return NextResponse.json({ error: 'The note is empty — nothing to send.' }, { status: 400 })

  const firstName = clientName.split(' ')[0] || 'there'
  // Voice the recap as the signed-in coach — the name they set on Account →
  // Profile (falls back to the Google session name if the row can't be read).
  let coachName: string = (session as any).user?.name || 'the coach'
  let coachId: string | null = null
  let orgId: string | null = null
  try {
    const coach = await getSessionCoach(getSupabaseAdmin())
    if (coach) {
      coachName = coachDisplayName(coach)
      coachId = coach.id
      orgId = coach.org_id
    }
  } catch {
    /* keep the session name */
  }

  const prompt = `You are ${coachName}, executive coach at theLeadershipWell. Turn the raw session note below into a terse, client-facing recap email to ${clientName}.

Guidelines:
- Be brief and scannable. Prefer bullet lists (- item) over prose wherever there are multiple related points — themes explored, what surfaced, key decisions, shifts in thinking.
- One short opening sentence greeting ${firstName}. One short closing sentence. No filler or padding.
- Keep the coach's warm, direct voice, but scannable structure beats wordiness.
- Do NOT list the "ACTION:" or "INSIGHT:" items — those are appended separately as an interactive checklist and Insights list; repeating them would duplicate.
- Do NOT invent anything not in the note. If the note is thin, keep the email very short.
- Sign off with the coach's first name ("${coachName.split(' ')[0]}"). No subject line inside the body. No AI mention.

${CLIENT_VOICE_STANDARDS}

Return ONLY valid JSON — no markdown fences, no preamble:
{"subject": "Short, specific subject line", "body": "The email as plain text. Use bullet lists (- item) wherever there are multiple related points."}

RAW SESSION NOTE${body.noteTitle ? ` (“${String(body.noteTitle).trim()}”)` : ''}:
${noteText}`

  try {
    const message = await aiCreate(
      { purpose: 'note_client_email', principal: 'coach', orgId, coachId },
      { max_tokens: 1500, messages: [{ role: 'user', content: prompt }], timeoutMs: 50_000 }
    )
    const raw = textOf(message)
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
