import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireSession, readJson, toErrorResponse } from '@/lib/api-handler'
import type { CoachingGoal } from '@/lib/supabase/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const GenerateSchema = z.object({
  clientName: z.string().trim().min(1, 'clientName required'),
  clientId: z.string().optional(),
  notes: z
    .array(z.object({ date: z.union([z.string(), z.number()]).optional(), content: z.string() }))
    .default([]),
  actions: z.array(z.any()).optional(),
  zoomSummaries: z.array(z.any()).optional(),
})

// Emojis for the prep email's coaching-plan rows, assigned by position.
const PLAN_EMOJIS = ['🧭', '🌱', '🕊️', '🌿', '⚓', '🔥', '💡', '🎯']

/**
 * Look up the client's stored coaching goals — the sacred source of the plan.
 * Goals are built with the client in their workspace; session prep renders them
 * rather than inventing a plan each time. Matches by id when given, else by name.
 */
async function loadGoals(clientId?: string, clientName?: string): Promise<CoachingGoal[]> {
  try {
    const supabase = getSupabaseAdmin()
    const query = supabase.from('clients').select('coaching_goals')
    const { data } = clientId
      ? await query.eq('id', clientId).maybeSingle()
      : await query.ilike('name', clientName || '').limit(1).maybeSingle()
    const goals = (data?.coaching_goals || []) as CoachingGoal[]
    return goals.filter((g) => g?.title)
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSession()
    const { clientName, clientId, notes, actions, zoomSummaries } = await readJson(req, GenerateSchema)

  const notesText = notes
    .map((n: any) => `[${new Date(n.date).toLocaleDateString()}]\n${n.content}`)
    .join('\n\n---\n\n')

  const actionsText = actions?.length
    ? actions.map((a: any) => `• ${a.description}${a.dueDate ? ` (due ${a.dueDate})` : ''}`).join('\n')
    : 'None recorded'

  let zoomSection = ''
  if (zoomSummaries?.length) {
    const zoomText = zoomSummaries.map((s: any) => {
      const date = new Date(s.meeting_start_time).toLocaleDateString()
      const sections = (s.summary_details || [])
        .map((d: any) => `  ${d.label}: ${d.summary}`)
        .join('\n')
      const nextSteps = (s.next_steps || [])
        .map((n: string) => `  • ${n}`)
        .join('\n')
      return `[${date}] ${s.summary_title || 'Zoom Session'}\nOverview: ${s.summary_overview || 'N/A'}\n${sections ? `Themes:\n${sections}` : ''}${nextSteps ? `\nNext Steps:\n${nextSteps}` : ''}`
    }).join('\n\n---\n\n')

    zoomSection = `

ZOOM AI MEETING SUMMARIES (recent sessions — focus on ${clientName}'s themes, not Jeff's action items):
${zoomText}`
  }

  // The stored goals drive the coaching plan when present; the rest of the email
  // is still drawn from the session context.
  const goals = await loadGoals(clientId, clientName)
  const lockedPlan =
    goals.length > 0
      ? goals.map((g, i) => ({
          emoji: PLAN_EMOJIS[i % PLAN_EMOJIS.length],
          title: g.title,
          description: g.description,
        }))
      : null

  const planInstruction = lockedPlan
    ? `The coaching plan is FIXED — these are ${clientName}'s agreed engagement goals. Do NOT include a "coachingPlan" field; build the rest of the email around these goals, and make each "questions" item reference one goal by its EXACT title:
${lockedPlan.map((p, i) => `${i + 1}. ${p.title} — ${p.description}`).join('\n')}`
    : `Generate a "coachingPlan" array of 3 items: {"emoji": "🧭", "title": "Track Name (3-5 words)", "description": "1-2 sentences specific to this client's actual coaching work"}. Each "questions" item must reference a coachingPlan title via its "theme".`

  const jsonShape = lockedPlan
    ? `{
  "exploring": [
    {"title": "Topic Title", "description": "2-3 sentences on what we have specifically been working on — reference real details from the notes"}
  ],
  "insights": ["A powerful, pithy breakthrough insight — declarative, memorable, 15-25 words, first person from client perspective", "..."],
  "actions": ["Specific action item from their notes — start with a verb, include concrete detail, 10-20 words", "..."],
  "questions": [
    {"theme": "EXACT goal title", "question": "Open-ended reflection question deeply tied to that goal and their specific situation — 30-50 words"}
  ],
  "closingLine": "1-2 warm, specific, personal sentences from Jeff — acknowledge the real work this client is doing. No AI mention. No generic coaching language. Sound like Jeff.",
  "quote": {"text": "An inspiring quote relevant to this client's specific journey — not overused or cliché", "author": "Author Name"}
}`
    : `{
  "coachingPlan": [
    {"emoji": "🧭", "title": "Track Name (3-5 words)", "description": "1-2 sentences specific to this client's actual coaching work"},
    {"emoji": "🌱", "title": "Track Name", "description": "1-2 sentences"},
    {"emoji": "🕊️", "title": "Track Name", "description": "1-2 sentences"}
  ],
  "exploring": [
    {"title": "Topic Title", "description": "2-3 sentences on what we have specifically been working on — reference real details from the notes"},
    {"title": "Topic Title", "description": "2-3 sentences"},
    {"title": "Topic Title", "description": "2-3 sentences"}
  ],
  "insights": [
    "A powerful, pithy breakthrough insight from their actual coaching — declarative, memorable, 15-25 words, first person from client perspective",
    "Powerful insight 2",
    "Powerful insight 3"
  ],
  "actions": [
    "Specific action item from their notes — start with a verb, include concrete detail, 10-20 words",
    "Action item 2",
    "Action item 3"
  ],
  "questions": [
    {"theme": "EXACT title from coachingPlan item 1", "question": "Open-ended reflection question deeply tied to their specific situation — thoughtful and specific, 30-50 words"},
    {"theme": "EXACT title from coachingPlan item 2", "question": "Reflection question"},
    {"theme": "EXACT title from coachingPlan item 3", "question": "Reflection question"}
  ],
  "closingLine": "1-2 warm, specific, personal sentences from Jeff — acknowledge the real work this client is doing. No AI mention. No generic coaching language. Sound like Jeff, not a template.",
  "quote": {"text": "An inspiring quote relevant to this client's specific journey — not overused or cliché", "author": "Author Name"}
}`

  const prompt = `You are helping Jeff Holmes, executive coach at theLeadershipWell, generate a personalized session preparation email for ${clientName}.

Return ONLY a valid JSON object — no markdown fences, no preamble, no explanation.

${planInstruction}

SESSION NOTES (most recent first):
${notesText}

OPEN ACTION ITEMS FROM COACH ACCOUNTABLE:
${actionsText}${zoomSection}

Generate this exact JSON structure:
${jsonShape}`

  const message = await client.messages.create(
    {
      model: process.env.GENERATE_MODEL || 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    },
    { timeout: 50_000, maxRetries: 1 }
  )

  const raw = message.content.find(b => b.type === 'text')?.text || ''
  const clean = raw.replace(/```json\n?|```/g, '').trim()
  const match = clean.match(/\{[\s\S]*\}/)

    try {
      const content = JSON.parse(match ? match[0] : clean)
      // The stored goals are authoritative — overlay them onto the plan.
      if (lockedPlan) content.coachingPlan = lockedPlan
      return NextResponse.json({ content })
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response', raw }, { status: 500 })
    }
  } catch (e) {
    return toErrorResponse(e)
  }
}
