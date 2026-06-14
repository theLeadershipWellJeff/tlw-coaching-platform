import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { clientName, notes, actions, zoomSummaries } = await req.json()

  if (!clientName) {
    return NextResponse.json({ error: 'clientName required' }, { status: 400 })
  }

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

  const prompt = `You are helping Jeff Holmes, executive coach at theLeadershipWell, generate a personalized session preparation email for ${clientName}.

Return ONLY a valid JSON object — no markdown fences, no preamble, no explanation.

SESSION NOTES (most recent first):
${notesText}

OPEN ACTION ITEMS FROM COACH ACCOUNTABLE:
${actionsText}${zoomSection}

Generate this exact JSON structure:
{
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

  const message = await client.messages.create({
    model: process.env.GENERATE_MODEL || 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content.find(b => b.type === 'text')?.text || ''
  const clean = raw.replace(/```json\n?|```/g, '').trim()
  const match = clean.match(/\{[\s\S]*\}/)

  try {
    const content = JSON.parse(match ? match[0] : clean)
    return NextResponse.json({ content })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to parse AI response', raw }, { status: 500 })
  }
}
