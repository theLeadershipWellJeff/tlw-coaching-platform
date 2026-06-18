import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import type { CoachingGoal, Database } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const MODEL = process.env.GOALS_MODEL || 'claude-sonnet-4-6'

// Strip HTML tags from rich-text note content for the prompt.
function toText(html: string): string {
  return (html || '')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/**
 * Draft the client's current coaching goals from their recent notes, using the
 * same lens as the session-prep coaching plan, and save them to the client. The
 * coach can then edit/save on the goals card. Returns { goals }.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 500 })
    }

    const { data: client, error: cErr } = await supabase
    .from('clients')
    .select('id, name, coaching_goals')
    .eq('id', params.id)
    .single()
  if (cErr || !client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const { data: notes } = await supabase
    .from('notes')
    .select('session_date, title, content')
    .eq('client_id', params.id)
    .order('session_date', { ascending: false })
    .limit(12)

  if (!notes || notes.length === 0) {
    return NextResponse.json(
      { error: 'No notes yet for this client — add a session note first, then generate goals.' },
      { status: 400 }
    )
  }

  const notesText = notes
    .map((n) => `[${n.session_date}] ${n.title || ''}\n${toText(n.content)}`)
    .join('\n\n---\n\n')

  const prompt = `You are helping Jeff Holmes, executive coach at theLeadershipWell, articulate the CURRENT coaching goals for ${client.name}, drawn from their recent session notes.

Return ONLY a valid JSON array — no markdown fences, no preamble. 3 to 4 goals, most important first:
[
  {"title": "Goal name (3-6 words)", "description": "1-2 sentences naming the specific developmental work, grounded in real details from the notes — not generic coaching language"}
]

SESSION NOTES (most recent first):
${notesText}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let goals: CoachingGoal[]
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
    const match = clean.match(/\[[\s\S]*\]/)
    const parsed = JSON.parse(match ? match[0] : clean)
    goals = (Array.isArray(parsed) ? parsed : [])
      .map((g: any) => ({
        title: String(g?.title || '').trim(),
        description: String(g?.description || '').trim(),
        source: 'generated' as const,
      }))
      .filter((g: CoachingGoal) => g.title)
  } catch {
    return NextResponse.json({ error: 'Could not generate goals from the notes.' }, { status: 502 })
  }

  // Never overwrite the coach's own work. Keep every goal that isn't an
  // untouched AI draft (manual, or pre-dating the source field) and only replace
  // previously-generated suggestions with the fresh ones.
  const existing = (client.coaching_goals ?? []) as CoachingGoal[]
  const protectedGoals = existing.filter((g) => g.source !== 'generated')
  const merged = [...protectedGoals, ...goals]

  const update: Database['public']['Tables']['clients']['Update'] = { coaching_goals: merged }
  const { error: upErr } = await supabase.from('clients').update(update).eq('id', params.id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    return NextResponse.json({ goals: merged, protectedCount: protectedGoals.length })
  } catch (e) {
    return toErrorResponse(e)
  }
}
