import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { accessibleClientIds } from '@/lib/client-access'

export const runtime = 'nodejs'
// Authenticated, per-coach endpoint — never statically prerendered (it resolves
// the session and the admin Supabase client at request time).
export const dynamic = 'force-dynamic'

export interface SearchResult {
  type: 'client' | 'note'
  id: string
  title: string
  subtitle: string | null
  href: string
}

// Postgres ILIKE wildcard escape so a query of "50%" doesn't act as a pattern.
function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`)
}

/**
 * Top-bar global search. Matches clients (name / email / company) and notes
 * (title), returning a small, grouped set for the dropdown. Notes resolve their
 * client name so the result is legible.
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (new URL(req.url).searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })

  // Tenant boundary: only ever search across the clients this coach is linked to
  // (and the notes hanging off them). No links → nothing to search.
  const accessibleIds = await accessibleClientIds(supabase, coach.id)
  if (accessibleIds.length === 0) return NextResponse.json({ results: [] })

  const like = `%${likeEscape(q)}%`

  const [clientsRes, notesRes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, email, company')
      .in('id', accessibleIds)
      .or(`name.ilike.${like},email.ilike.${like},company.ilike.${like}`)
      .order('name', { ascending: true })
      .limit(6),
    supabase
      .from('notes')
      .select('id, client_id, title, session_date')
      .in('client_id', accessibleIds)
      .ilike('title', like)
      .order('session_date', { ascending: false })
      .limit(6),
  ])

  const results: SearchResult[] = []

  for (const c of clientsRes.data || []) {
    results.push({
      type: 'client',
      id: c.id,
      title: c.name,
      subtitle: c.company || c.email || null,
      href: `/clients/${c.id}`,
    })
  }

  const notes = notesRes.data || []
  // Resolve client names for the matched notes in one lookup.
  const clientIds = Array.from(new Set(notes.map((n) => n.client_id).filter(Boolean)))
  const names = new Map<string, string>()
  if (clientIds.length > 0) {
    const { data } = await supabase.from('clients').select('id, name').in('id', clientIds)
    for (const c of data || []) names.set(c.id, c.name)
  }
  for (const n of notes) {
    results.push({
      type: 'note',
      id: n.id,
      title: n.title?.trim() || 'Untitled note',
      subtitle: names.get(n.client_id) || null,
      href: `/clients/${n.client_id}/notes`,
    })
  }

  return NextResponse.json({ results })
}
