import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { runAndStoreReport } from '@/lib/scoring/store'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Resolve a needs-review transcript by confirming its client, then score it.
 * Also used to re-score (pass rescore: true without changing the client).
 * Body: { clientId?: string, rescore?: boolean }
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const { data: transcript, error: readErr } = await supabase
    .from('transcripts')
    .select('*')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!transcript) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Confirm the client assignment if one was provided.
  if (body.clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', body.clientId)
      .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Unknown client' }, { status: 400 })

    const { data: updated, error: updErr } = await supabase
      .from('transcripts')
      .update({ client_id: client.id, match_status: 'matched', match_confidence: 1 })
      .eq('id', transcript.id)
      .select('*')
      .single()
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
    transcript.client_id = updated.client_id
    transcript.match_status = updated.match_status
  }

  if (!transcript.client_id) {
    return NextResponse.json(
      { error: 'Assign a client before scoring (clientId required).' },
      { status: 400 }
    )
  }

  try {
    const report = await runAndStoreReport(supabase, transcript, coach.name)
    return NextResponse.json({ reportId: report.id, matchStatus: transcript.match_status })
  } catch (e: any) {
    return NextResponse.json({ error: `Scoring failed: ${e.message}` }, { status: 500 })
  }
}
