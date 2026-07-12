import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { extractCaptures } from '@/lib/notes/extract'
import { loadSurfaceableLeaves } from '@/lib/nudges/garden'

// Strip note HTML to plain text (block tags → newlines), matching the capture
// pipeline so INSIGHT: lines read the same as in the editor.
function htmlToText(html: string): string {
  return (html || '')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

// Picker options for the manual "Create Nudge" modal: the client's still-open
// actions (to anchor an action check-in), recent captured insights (to
// re-surface), and the coach's surfaceable garden frameworks (to re-surface).
// Coach-scoped; key-info is never touched.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)

    const [{ data: actions }, { data: notes }, leaves, { data: client }] = await Promise.all([
      supabase
        .from('actions')
        .select('description')
        .eq('client_id', params.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('notes')
        .select('content')
        .eq('client_id', params.id)
        .order('session_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5),
      loadSurfaceableLeaves(supabase, coach.id),
      supabase.from('clients').select('coaching_goals').eq('id', params.id).maybeSingle(),
    ])

    const openActions = Array.from(
      new Set((actions || []).map((a) => a.description).filter(Boolean))
    )
    const recentInsights = Array.from(
      new Set(
        (notes || [])
          .flatMap((n) => extractCaptures(htmlToText(n.content)).insights.map((i) => i.text))
          .filter(Boolean)
      )
    ).slice(0, 12)

    const frameworks = leaves.map((l) => ({ id: l.id, title: l.title, summary: l.summary }))

    // The client's engagement goals — the anchor options for a goals nudge.
    const goals = ((client?.coaching_goals ?? []) as { title?: string; description?: string }[])
      .filter((g) => g?.title)
      .map((g) => ({ title: g.title as string, description: g.description || '' }))

    return NextResponse.json({ openActions, recentInsights, frameworks, goals })
  } catch (e) {
    return toErrorResponse(e)
  }
}
