import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { htmlToPlainText } from '@/lib/communications'

export const runtime = 'nodejs'

/** Sentinel delimiters emitted by `ts_headline` (migration 052). The client
 *  splits on these and renders the highlight itself — no markup crosses over. */
const HL_OPEN = '[[hl]]'
const HL_CLOSE = '[[/hl]]'

export type PortalSearchResult = {
  kind: 'session' | 'note'
  id: string
  title: string
  occurred_on: string | null
  /** Snippet with matches wrapped in the sentinel delimiters. */
  snippet: string
}

/**
 * Search the two things a client is allowed to see: their OWN session
 * transcripts, and the session notes their coach SENT them. Coach-private notes
 * are never searched.
 *
 * Ranked Postgres full-text search via the `portal_search` function. If that
 * function isn't there yet (migration 052 not applied), this degrades to the
 * previous ILIKE scan over transcripts rather than failing the page.
 */
export async function GET(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (new URL(req.url).searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ results: [], query: q })

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.rpc('portal_search', {
    p_client_id: clientId,
    p_query: q,
    p_limit: 20,
  })

  if (!error) {
    const results: PortalSearchResult[] = (data ?? []).map((r) => ({
      kind: r.kind === 'note' ? ('note' as const) : ('session' as const),
      id: r.id,
      title: r.title,
      occurred_on: r.occurred_on,
      snippet: r.snippet || '',
    }))
    return NextResponse.json({ results, query: q })
  }

  console.error('portal_search unavailable, falling back to scan:', error.message)
  return NextResponse.json({ results: await fallbackSearch(clientId, q), query: q })
}

/**
 * Pre-migration-052 path: substring scan over transcripts only. Kept so a deploy
 * that lands before the migration still returns something useful.
 */
async function fallbackSearch(clientId: string, q: string): Promise<PortalSearchResult[]> {
  const supabase = getSupabaseAdmin()
  // Escape LIKE wildcards (Postgres default escape char is backslash).
  const pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%'

  const { data } = await supabase
    .from('transcripts')
    .select('id, title, session_date, raw_md')
    .eq('client_id', clientId)
    .ilike('raw_md', pattern)
    .order('session_date', { ascending: false, nullsFirst: false })
    .limit(20)

  return (data || []).map((t) => ({
    kind: 'session' as const,
    id: t.id,
    title: t.title || 'Session',
    occurred_on: t.session_date,
    snippet: makeSnippet(t.raw_md || '', q),
  }))
}

/** Snippet around the first hit, marked with the same sentinels the SQL emits. */
function makeSnippet(text: string, q: string): string {
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return htmlToPlainText(text.slice(0, 160))
  const start = Math.max(0, idx - 70)
  const end = Math.min(text.length, idx + q.length + 90)
  const before = text.slice(start, idx)
  const hit = text.slice(idx, idx + q.length)
  const after = text.slice(idx + q.length, end)
  return (
    (start > 0 ? '… ' : '') +
    `${before}${HL_OPEN}${hit}${HL_CLOSE}${after}`.trim() +
    (end < text.length ? ' …' : '')
  )
}
