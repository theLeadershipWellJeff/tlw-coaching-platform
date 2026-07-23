import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { extractCaptures } from '@/lib/notes/extract'
import type { CoachingGoal } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const MODEL = process.env.PLAN_SESSION_MODEL || 'claude-sonnet-4-6'

// Strip rich-text HTML to plain text (block tags → newlines) so captures parse.
function toText(html: string): string {
  return (html || '')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function dedupePreserveOrder(items: string[], max: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const t = raw.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
    if (out.length >= max) break
  }
  return out
}

/**
 * Plan Next Session — pulls this client's goals, open actions, recent insights,
 * and any "NEXT TIME / NEXT SESSION" flags left in prior notes, and asks Claude
 * to synthesize a quick prep summary plus three opening questions. Deterministic
 * context (the lists) always returns, so the card is useful even if the AI call
 * fails — only `summary`/`questions` depend on the model. Ephemeral: nothing is
 * persisted.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { data: client, error: cErr } = await supabase
      .from('clients')
      .select('id, name, coaching_goals')
      .eq('id', params.id)
      .single()
    if (cErr || !client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    // Recent notes (newest first) — the source of insights + next-session flags.
    const { data: notes } = await supabase
      .from('notes')
      .select('session_date, title, content, created_at')
      .eq('client_id', params.id)
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10)

    // Open action items.
    const { data: actions } = await supabase
      .from('actions')
      .select('description, status, created_at')
      .eq('client_id', params.id)
      .neq('status', 'done')
      .neq('status', 'dropped')
      .order('created_at', { ascending: false })
      .limit(10)

    // Walk notes newest-first, collecting next-session flags and insights.
    const nextTimeRaw: string[] = []
    const insightsRaw: string[] = []
    for (const n of notes || []) {
      const caps = extractCaptures(toText(n.content))
      for (const item of caps.nextSession) nextTimeRaw.push(item.text)
      for (const item of caps.insights) insightsRaw.push(item.text)
    }

    const nextTime = dedupePreserveOrder(nextTimeRaw, 6)
    const recentInsights = dedupePreserveOrder(insightsRaw, 5)
    const openActions = dedupePreserveOrder((actions || []).map((a) => a.description || ''), 8)
    const goals = ((client.coaching_goals ?? []) as CoachingGoal[])
      .filter((g) => g && g.title)
      .map((g) => ({ title: g.title.trim(), description: (g.description || '').trim() }))

    const hasContext =
      nextTime.length > 0 || openActions.length > 0 || recentInsights.length > 0 || goals.length > 0

    const base = {
      clientName: client.name,
      nextTime,
      goals,
      openActions,
      recentInsights,
      generatedAt: new Date().toISOString(),
    }

    if (!hasContext) {
      return NextResponse.json({
        ...base,
        summary: '',
        questions: [],
        empty: true,
      })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ ...base, summary: '', questions: [], aiError: 'ANTHROPIC_API_KEY is not configured.' })
    }

    const fmt = (label: string, items: string[]) =>
      items.length ? `${label}:\n${items.map((i) => `- ${i}`).join('\n')}` : `${label}: (none)`

    const goalsText = goals.length
      ? `Coaching goals:\n${goals.map((g) => `- ${g.title}${g.description ? ` — ${g.description}` : ''}`).join('\n')}`
      : 'Coaching goals: (none set)'

    const prompt = `You are helping Jeff Holmes, executive coach at theLeadershipWell, prepare to open his next session with ${client.name}. Below is what's on file. Synthesize it into a tight prep brief the coach can read in ten seconds right before the call.

${fmt('Flagged for next time (from prior notes — the coach explicitly wanted to return to these)', nextTime)}

${goalsText}

${fmt('Open action items (commitments still outstanding)', openActions)}

${fmt('Recent insights captured', recentInsights)}

Return ONLY valid JSON — no markdown fences, no preamble:
{
  "summary": "2-4 sentences weaving the above into where this client is and what likely matters most to open with. Ground it in the specifics above; do not invent facts. If items were flagged for next time, lead with them.",
  "questions": ["Q1", "Q2", "Q3"]
}

The three questions are the ones Jeff could actually open the session with — warm, specific to this client's situation, and forward-moving (not generic check-ins). Prioritize anything flagged for next time and any outstanding commitments.`

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    try {
      const message = await anthropic.messages.create(
        {
          model: MODEL,
          max_tokens: 1200,
          messages: [{ role: 'user', content: prompt }],
        },
        { timeout: 50_000, maxRetries: 1 }
      )
      const block = message.content.find((b) => b.type === 'text')
      const raw = block && 'text' in block ? block.text : ''
      const clean = raw.replace(/```json\n?|```/g, '').trim()
      const match = clean.match(/\{[\s\S]*\}/)
      const parsed = JSON.parse(match ? match[0] : clean)
      const summary = String(parsed?.summary || '').trim()
      const questions = (Array.isArray(parsed?.questions) ? parsed.questions : [])
        .map((q: unknown) => String(q || '').trim())
        .filter(Boolean)
        .slice(0, 3)
      return NextResponse.json({ ...base, summary, questions })
    } catch {
      // The lists still make a useful card — degrade gracefully.
      return NextResponse.json({
        ...base,
        summary: '',
        questions: [],
        aiError: 'Could not generate the summary and questions. The context below is still current.',
      })
    }
  } catch (e) {
    return toErrorResponse(e)
  }
}
