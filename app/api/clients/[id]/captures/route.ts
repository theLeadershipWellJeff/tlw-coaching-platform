import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { extractCaptures } from '@/lib/notes/extract'

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
 * A client's recent captures — action items (with status) and INSIGHT: lines
 * from prior notes, newest first. A lightweight read the compose-email modal
 * uses as an at-a-glance reference while writing; nothing here is sent.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const [{ data: actions }, { data: notes }] = await Promise.all([
      supabase
        .from('actions')
        .select('id, description, status, created_at')
        .eq('client_id', params.id)
        .neq('status', 'dropped')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('notes')
        .select('content, session_date, created_at')
        .eq('client_id', params.id)
        .order('session_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    // Walk notes newest-first so the insight list leads with the latest session.
    const insightsRaw: string[] = []
    for (const n of notes || []) {
      for (const item of extractCaptures(toText(n.content || '')).insights) {
        insightsRaw.push(item.text)
      }
    }

    return NextResponse.json({
      actions: actions || [],
      insights: dedupePreserveOrder(insightsRaw, 8),
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}
