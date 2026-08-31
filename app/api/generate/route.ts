import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { ApiError, requireCoach, readJson, toErrorResponse } from '@/lib/api-handler'
import { coachCanAccessClient } from '@/lib/client-access'
import { findClientByEmailOrName } from '@/lib/client-lookup'
import type { CoachingGoal } from '@/lib/supabase/types'
import { CLIENT_VOICE_STANDARDS } from '@/lib/writing-standards'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const GenerateSchema = z.object({
  clientName: z.string().trim().min(1, 'clientName required'),
  clientEmail: z.string().optional(),
  clientId: z.string().optional(),
  notes: z
    .array(z.object({ date: z.union([z.string(), z.number()]).optional(), content: z.string() }))
    .default([]),
  actions: z.array(z.any()).optional(),
  zoomSummaries: z.array(z.any()).optional(),
})

// Strip rich-text HTML to plain text, keeping line structure (block tags →
// newlines) so ACTION:/INSIGHT: capture lines stay on their own lines for the
// model. Same approach as the plan-session route.
function noteToText(html: string): string {
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

// Emojis for the prep email's coaching-plan rows, assigned by position.
const PLAN_EMOJIS = ['🧭', '🌱', '🕊️', '🌿', '⚓', '🔥', '💡', '🎯']

/**
 * Look up the client's stored coaching goals — the sacred source of the plan.
 * Goals are built with the client in their workspace; session prep renders them
 * rather than inventing a plan each time. The caller resolves + tenant-gates
 * the client id before calling.
 */
async function loadGoals(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  clientId: string
): Promise<CoachingGoal[]> {
  try {
    const { data } = await supabase
      .from('clients')
      .select('coaching_goals')
      .eq('id', clientId)
      .maybeSingle()
    const goals = ((data?.coaching_goals as CoachingGoal[] | undefined) || [])
    return goals.filter((g) => g?.title)
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    // Voice the prep email as the signed-in coach, not a fixed name.
    const coachName = coach.name || 'the coach'
    const { clientName, clientEmail, clientId, notes, actions, zoomSummaries } = await readJson(req, GenerateSchema)

    // Tenant gate: goals may only be loaded for a client linked to the signed-in
    // coach — 404, not 403, so a foreign id is never confirmed to exist.
    if (clientId && !(await coachCanAccessClient(supabase, coach.id, clientId))) {
      throw new ApiError(404, 'Client not found')
    }

  // Resolve the roster client. Explicit id wins (already gated above); else
  // match email-first, then exact name, and only accept a client this coach is
  // linked to — a foreign match is treated as no-match.
  let resolvedClientId: string | null = clientId || null
  if (!resolvedClientId) {
    try {
      const row = await findClientByEmailOrName(supabase, { email: clientEmail, name: clientName })
      if (row?.id && (await coachCanAccessClient(supabase, coach.id, row.id))) {
        resolvedClientId = row.id
      }
    } catch {
      // Resolution is best-effort — an unmatched client still gets a prep email,
      // just without history.
    }
  }

  // The session history behind the email. Callers used to pass notes/actions in
  // the request (the old Coach Accountable flow); nothing does anymore, so load
  // the client's in-app notes + open actions here. Posted values still win for
  // backward compatibility.
  let sourceNotes: { date?: string | number; content: string }[] = notes
  let sourceActions: { description: string; dueDate?: string | null }[] = actions || []
  if (resolvedClientId) {
    if (sourceNotes.length === 0) {
      const { data: noteRows } = await supabase
        .from('notes')
        .select('session_date, title, content, created_at')
        .eq('client_id', resolvedClientId)
        .order('session_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10)
      sourceNotes = (noteRows || []).map((n) => ({
        date: n.session_date || n.created_at,
        content: [n.title, noteToText(n.content)].filter(Boolean).join('\n'),
      }))
    }
    if (sourceActions.length === 0) {
      const { data: actionRows } = await supabase
        .from('actions')
        .select('description, due_date')
        .eq('client_id', resolvedClientId)
        .neq('status', 'done')
        .neq('status', 'dropped')
        .order('created_at', { ascending: false })
        .limit(10)
      sourceActions = (actionRows || []).map((a) => ({ description: a.description, dueDate: a.due_date }))
    }
  }

  const notesText = sourceNotes.length
    ? sourceNotes
        .map((n) => {
          const d = n.date ? new Date(n.date) : null
          const label = d && !isNaN(d.getTime()) ? `[${d.toLocaleDateString()}]\n` : ''
          return `${label}${n.content}`
        })
        .join('\n\n---\n\n')
    : '(no session notes on file)'

  const actionsText = sourceActions.length
    ? sourceActions.map((a) => `• ${a.description}${a.dueDate ? ` (due ${a.dueDate})` : ''}`).join('\n')
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

ZOOM AI MEETING SUMMARIES (recent sessions — focus on ${clientName}'s themes, not the coach's action items):
${zoomText}`
  }

  // The stored goals drive the coaching plan when present; the rest of the email
  // is still drawn from the session context.
  const goals = resolvedClientId ? await loadGoals(supabase, resolvedClientId) : []
  const lockedPlan =
    goals.length > 0
      ? goals.map((g, i) => ({
          emoji: PLAN_EMOJIS[i % PLAN_EMOJIS.length],
          title: g.title,
          description: g.description,
        }))
      : null

  // The Engagement section ("coachingPlan") is the durable contract — the stable
  // goals of the engagement, not recent activity. Workspace goals win and are
  // rendered verbatim; absent them, derive intake-first.
  const planInstruction = lockedPlan
    ? `ENGAGEMENT GOALS — the durable contract (what we're working on this engagement; stable, changes slowly):
These are ${clientName}'s agreed engagement goals from the workspace. The coaching plan is FIXED. Do NOT include a "coachingPlan" field — these goals are rendered VERBATIM, exactly as written below, with NO rewording, summarizing, or re-titling. Make each "questions" item reference one goal by its EXACT title:
${lockedPlan.map((p, i) => `${i + 1}. ${p.title} — ${p.description}`).join('\n')}`
    : `ENGAGEMENT GOALS — the durable contract (what we're working on this engagement; stable, changes slowly):
There are no workspace goals on file, so derive the "coachingPlan". This is the STABLE engagement plan, NOT recent activity. Source the goals from the FIRST session's notes — intake / first-session goals ARE the engagement goals and persist as primary unless later notes explicitly establish new goals that supersede them. If the first session's notes establish no goals, derive them from the most recent 3 sessions. Produce a "coachingPlan" array of 3 items: {"emoji": "🧭", "title": "Track Name (3-5 words)", "description": "1-2 sentences specific to your actual coaching work"}. Each "questions" item must reference a coachingPlan title via its "theme".`

  const jsonShape = lockedPlan
    ? `{
  "exploring": [
    {"title": "Topic Title", "description": "ONE tight sentence on the specific recent thing we moved on — reference a real detail from the latest notes"}
  ],
  "insights": ["A powerful, pithy breakthrough insight — declarative, memorable, 15-25 words, first person from client perspective", "..."],
  "actions": ["Specific action item from your notes — start with a verb, include concrete detail, 10-20 words", "..."],
  "questions": [
    {"theme": "EXACT goal title", "question": "Open-ended reflection question deeply tied to that goal and your specific situation, addressed to you — 30-50 words"}
  ],
  "closingLine": "1-2 warm, specific, personal sentences from ${coachName} — acknowledge the real work this client is doing. No AI mention. No generic coaching language. Sound like ${coachName}.",
  "quote": {"text": "An inspiring quote relevant to this client's specific journey — not overused or cliché", "author": "Author Name"}
}`
    : `{
  "coachingPlan": [
    {"emoji": "🧭", "title": "Track Name (3-5 words)", "description": "1-2 sentences specific to this client's actual coaching work"},
    {"emoji": "🌱", "title": "Track Name", "description": "1-2 sentences"},
    {"emoji": "🕊️", "title": "Track Name", "description": "1-2 sentences"}
  ],
  "exploring": [
    {"title": "Topic Title", "description": "ONE tight sentence on the specific recent thing we moved on — reference a real detail from the latest notes"},
    {"title": "Topic Title", "description": "ONE tight sentence"},
    {"title": "Topic Title", "description": "ONE tight sentence"}
  ],
  "insights": [
    "A powerful, pithy breakthrough insight from your actual coaching — declarative, memorable, 15-25 words, first person from your perspective",
    "Powerful insight 2",
    "Powerful insight 3"
  ],
  "actions": [
    "Specific action item from your notes — start with a verb, include concrete detail, 10-20 words",
    "Action item 2",
    "Action item 3"
  ],
  "questions": [
    {"theme": "EXACT title from coachingPlan item 1", "question": "Open-ended reflection question deeply tied to your specific situation, addressed to you — thoughtful and specific, 30-50 words"},
    {"theme": "EXACT title from coachingPlan item 2", "question": "Reflection question"},
    {"theme": "EXACT title from coachingPlan item 3", "question": "Reflection question"}
  ],
  "closingLine": "1-2 warm, specific, personal sentences from ${coachName} — acknowledge the real work this client is doing. No AI mention. No generic coaching language. Sound like ${coachName}, not a template.",
  "quote": {"text": "An inspiring quote relevant to this client's specific journey — not overused or cliché", "author": "Author Name"}
}`

  const prompt = `You are helping ${coachName}, executive coach at theLeadershipWell, generate a personalized session preparation email for ${clientName}.

Return ONLY a valid JSON object — no markdown fences, no preamble, no explanation.

SOURCE PRECEDENCE:
- The coach's SESSION NOTES are the PRIMARY substance for every section — build the content from them first.
- The ZOOM AI MEETING SUMMARIES are corroborating/supporting ONLY: use them to fill gaps, surface ${clientName}'s own language, and confirm. They never override or contradict the notes.
- On any conflict, the NOTES WIN. If a summary implies something the notes don't support, defer to the notes.
- NEVER invent history. If the notes and summaries contain no real material for "exploring", "insights", or "actions", return an EMPTY array for that section rather than fabricating plausible-sounding content.

VOICE:
- Address ${clientName} DIRECTLY in the second person — "you," "your." NEVER refer to ${clientName} in the third person ("the client," "she/he," "${clientName} has been…").
- Second person applies to ${clientName} ONLY. Other people named (direct reports, colleagues, spouse, etc.) are referred to normally in the third person — do NOT second-person them.
- Warm, direct, affirming, plain. Mirror the coach's actual phrasing from the notes — preserve their words where they carry the meaning rather than paraphrasing into generic coaching-speak. Sound like ${coachName}.

${CLIENT_VOICE_STANDARDS}

${planInstruction}

RECENT EXPLORATION ("exploring") — the recent motion, NOT the standing plan:
- Capture what we've actually been moving on lately: recency-weighted activity, ONE tight sentence per item.
- Source it from the latest session's notes (and that session's summary), then the prior two sessions — a 3-session lookback weighted to the most recent. Do NOT look back further than 3 sessions for this section.
- Do NOT restate the engagement goals. If an item is just a goal rephrased as activity, cut it or sharpen it to the specific recent thing that happened. Engagement = the goal; Recent Exploration = the movement on it.

SESSION NOTES (most recent first — the PRIMARY source):
${notesText}

OPEN ACTION ITEMS (commitments still outstanding):
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
      // The preview + email template map over these unconditionally — make sure
      // an omitted section comes back as an empty array, not undefined.
      for (const key of ['coachingPlan', 'exploring', 'insights', 'actions', 'questions'] as const) {
        if (!Array.isArray(content[key])) content[key] = []
      }
      if (!content.quote?.text) content.quote = { text: '', author: '' }
      if (typeof content.closingLine !== 'string') content.closingLine = ''
      return NextResponse.json({ content })
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response', raw }, { status: 500 })
    }
  } catch (e) {
    return toErrorResponse(e)
  }
}
