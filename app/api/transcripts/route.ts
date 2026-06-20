import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { withClientNames } from '@/lib/clientNames'

// Transcripts for the signed-in coach. Defaults to those needing manual client
// confirmation (the fail-loud queue, spec §19): both needs_review (an uncertain
// guess) and unmatched (no name to guess from — e.g. Plaud's timestamp-named
// files when the calendar lookup also misses). Pass a comma-separated status
// list to filter, or ?status=all for everything.
export async function GET(req: NextRequest) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = req.nextUrl.searchParams.get('status') || 'needs_review,unmatched'

  let query = supabase
    .from('transcripts')
    .select('id, client_id, client_initials, filename, raw_md, session_date, match_status, match_confidence, created_at')
    .eq('coach_id', coach.id)
    .order('created_at', { ascending: false })
  if (status !== 'all') {
    const statuses = status.split(',').map((s) => s.trim()).filter(Boolean)
    query = statuses.length > 1 ? query.in('match_status', statuses) : query.eq('match_status', statuses[0])
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // A short opening-line preview so the coach can identify a timestamp-named,
  // unmatched transcript at a glance (without opening it). Strip front matter
  // and don't ship the full body to the list.
  const rows = (data || []).map(({ raw_md, ...rest }) => ({
    ...rest,
    preview: previewOf(raw_md),
  }))

  const transcripts = await withClientNames(supabase, rows)
  return NextResponse.json({ transcripts })
}

function previewOf(md: string | null): string {
  if (!md) return ''
  const body = md.replace(/^﻿?\s*---\s*\n[\s\S]*?\n---\s*\n?/, '') // drop front matter
  const text = body
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 180 ? `${text.slice(0, 180)}…` : text
}
