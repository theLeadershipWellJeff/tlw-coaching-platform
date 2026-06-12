import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

// Transcripts for the signed-in coach. Defaults to those needing manual client
// confirmation (fail-loud queue, spec §19); pass ?status=all for everything.
export async function GET(req: NextRequest) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = req.nextUrl.searchParams.get('status') || 'needs_review'

  let query = supabase
    .from('transcripts')
    .select('id, client_id, client_initials, filename, session_date, match_status, match_confidence, created_at')
    .eq('coach_id', coach.id)
    .order('created_at', { ascending: false })
  if (status !== 'all') query = query.eq('match_status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ transcripts: data || [] })
}
