import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import type { Database } from '@/lib/supabase/types'

// One full report, scoped to the signed-in coach.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('session_reports')
    .select('*')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // The report header shows the client's full name in-app (initials stay the
  // stored privacy label). Resolve it from the matched client when present.
  let clientName: string | null = null
  if (data.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('name')
      .eq('id', data.client_id)
      .maybeSingle()
    clientName = client?.name ?? null
  }

  return NextResponse.json({ report: data, clientName })
}

/**
 * Delete a session report (and its associated transcript) for the signed-in
 * coach. Used when a non-coaching call was accidentally scored.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch the report first to get the transcript_id and verify ownership.
  const { data: report, error: fetchErr } = await supabase
    .from('session_reports')
    .select('id, transcript_id')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error: delReportErr } = await supabase
    .from('session_reports')
    .delete()
    .eq('id', params.id)
    .eq('coach_id', coach.id)
  if (delReportErr) return NextResponse.json({ error: delReportErr.message }, { status: 500 })

  // Delete the associated transcript so it doesn't reappear in the review queue.
  if (report.transcript_id) {
    await supabase
      .from('transcripts')
      .delete()
      .eq('id', report.transcript_id)
      .eq('coach_id', coach.id)
  }

  return NextResponse.json({ ok: true })
}

/**
 * Save the coach's own parallel assessment (spec §13). These never touch the
 * machine score — they sit alongside it so the two can be reconciled and, for a
 * supervisor, compared.
 * Body: { coachSelfScores?: { "<id>": 1..5 }, coachNotes?: string }
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const update: Database['public']['Tables']['session_reports']['Update'] = { status: 'reviewed' }

  if (body.coachSelfScores && typeof body.coachSelfScores === 'object') {
    const clean: Record<string, number> = {}
    for (const [k, v] of Object.entries(body.coachSelfScores)) {
      const n = Number(v)
      if (Number.isFinite(n) && n >= 1 && n <= 5) clean[k] = Math.round(n)
    }
    update.coach_self_scores = clean
    const vals = Object.values(clean)
    update.coach_overall =
      vals.length > 0 ? Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 10) / 10 : null
  }

  if (typeof body.coachNotes === 'string') {
    update.coach_notes = body.coachNotes
  }

  const { data, error } = await supabase
    .from('session_reports')
    .update(update)
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .select('*')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ report: data })
}
