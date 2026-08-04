import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse, requireCoach } from '@/lib/api-handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLUMNS =
  'id, client_id, appointment_id, status, subject, body_html, scheduled_send_at, approved_at, sent_at, skipped_at, skip_reason, error_detail, generated_at, generation_model, created_at'

/**
 * The coach's cross-client prep-sheet queue — every pipeline row they might act
 * on, enriched with the client name and the session time. Coach-scoped: only this
 * coach's sheets. The UI groups by status (needs review / scheduled / history).
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)

    const { data: rows, error } = await supabase
      .from('prep_sheet_pipeline')
      .select(COLUMNS)
      .eq('coach_id', coach.id)
      .order('scheduled_send_at', { ascending: true, nullsFirst: false })
      .limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const list = rows || []
    const clientIds = Array.from(new Set(list.map((r) => r.client_id)))
    const apptIds = Array.from(new Set(list.map((r) => r.appointment_id)))

    const [{ data: clients }, { data: appts }] = await Promise.all([
      clientIds.length
        ? supabase.from('clients').select('id, name').in('id', clientIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      apptIds.length
        ? supabase.from('appointments').select('id, scheduled_at').in('id', apptIds)
        : Promise.resolve({ data: [] as { id: string; scheduled_at: string }[] }),
    ])
    const nameMap = new Map((clients || []).map((c) => [c.id, c.name]))
    const apptMap = new Map((appts || []).map((a) => [a.id, a.scheduled_at]))

    const prepSheets = list.map((r) => ({
      ...r,
      client_name: nameMap.get(r.client_id) || 'Unknown client',
      session_at: apptMap.get(r.appointment_id) || null,
    }))

    return NextResponse.json({ prepSheets })
  } catch (e) {
    return toErrorResponse(e)
  }
}
