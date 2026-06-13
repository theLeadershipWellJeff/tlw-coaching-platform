import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'

// List a client's transcripts (most recent first), each tagged with its scored
// report id (if any) so the UI can link straight to the scorecard.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  const { data: transcripts, error } = await supabase
    .from('transcripts')
    .select('id, session_date, filename, source, match_status, created_at')
    .eq('client_id', params.id)
    .order('session_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Map transcript -> report id in one extra query (relationship types aren't
  // generated, so we join in code rather than via an embedded select).
  const { data: reports } = await supabase
    .from('session_reports')
    .select('id, transcript_id')
    .eq('client_id', params.id)
  const reportByTranscript = new Map((reports || []).map((r) => [r.transcript_id, r.id]))

  const rows = (transcripts || []).map((t) => ({
    ...t,
    reportId: reportByTranscript.get(t.id) || null,
  }))

  return NextResponse.json({ transcripts: rows })
}
