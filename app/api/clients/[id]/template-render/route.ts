import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { extractCaptures } from '@/lib/notes/extract'

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Strip rich-text HTML to plain text (block tags → newlines) for INSIGHT capture.
function toText(html: string): string {
  return (html || '')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()
}

function list(items: string[], empty: string): string {
  if (items.length === 0) return `<p><em>${empty}</em></p>`
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
}

/**
 * Resolve a note template's merge fields against this client's live data, so
 * inserting the template into a note fills in e.g. recent unfinished actions or
 * the last three insights. Body: { content } (HTML). Returns { content }.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const body = await req.json().catch(() => ({}))
    let content: string = typeof body.content === 'string' ? body.content : ''
    if (!content) return NextResponse.json({ content: '' })

    const need = (token: string) => content.includes(token)

  // Client (name + goals) — only fetched if a field needs it.
  if (need('{{client_name}}') || need('{{coaching_goals}}')) {
    const { data: client } = await supabase
      .from('clients')
      .select('name, coaching_goals')
      .eq('id', params.id)
      .maybeSingle()
    content = content.split('{{client_name}}').join(esc(client?.name || ''))
    if (need('{{coaching_goals}}')) {
      const goals = (client?.coaching_goals || []).map((g) => g.title).filter(Boolean)
      content = content.split('{{coaching_goals}}').join(list(goals, 'No coaching goals yet.'))
    }
  }

  if (need('{{today}}')) {
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    content = content.split('{{today}}').join(esc(today))
  }

  if (need('{{unfinished_actions}}')) {
    const { data: actions } = await supabase
      .from('actions')
      .select('description, status, created_at')
      .eq('client_id', params.id)
      .neq('status', 'done')
      .neq('status', 'dropped')
      .order('created_at', { ascending: false })
      .limit(8)
    const items = (actions || []).map((a) => a.description).filter(Boolean)
    content = content.split('{{unfinished_actions}}').join(list(items, 'No open action items.'))
  }

  if (need('{{recent_insights}}')) {
    const { data: notes } = await supabase
      .from('notes')
      .select('content, session_date, created_at')
      .eq('client_id', params.id)
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(12)
    const insights: string[] = []
    for (const n of notes || []) {
      for (const ins of extractCaptures(toText(n.content)).insights) {
        insights.push(ins.text)
        if (insights.length >= 3) break
      }
      if (insights.length >= 3) break
    }
    content = content.split('{{recent_insights}}').join(list(insights, 'No insights captured yet.'))
    }

    return NextResponse.json({ content })
  } catch (e) {
    return toErrorResponse(e)
  }
}
