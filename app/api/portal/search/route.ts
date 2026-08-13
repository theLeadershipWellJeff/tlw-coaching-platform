import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/** Full-text-ish search over the authenticated client's OWN session transcripts.
 *  Returns each matching session with a snippet around the first hit. */
export async function GET(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (new URL(req.url).searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ results: [], query: q })

  // Escape LIKE wildcards (Postgres default escape char is backslash).
  const pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%'

  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('transcripts')
    .select('id, title, session_date, raw_md')
    .eq('client_id', clientId)
    .ilike('raw_md', pattern)
    .order('session_date', { ascending: false, nullsFirst: false })
    .limit(20)

  const results = (data || []).map((t) => ({
    id: t.id,
    title: t.title,
    session_date: t.session_date,
    snippet: makeSnippet(t.raw_md || '', q),
  }))
  return NextResponse.json({ results, query: q })
}

function makeSnippet(text: string, q: string): string {
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return text.slice(0, 160).trim()
  const start = Math.max(0, idx - 70)
  const end = Math.min(text.length, idx + q.length + 90)
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '')
}
