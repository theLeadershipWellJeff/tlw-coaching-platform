import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLUMNS =
  'id, client_id, appointment_id, status, subject, body_html, scheduled_send_at, approved_at, sent_at, skipped_at, skip_reason, error_detail, generated_at, generation_model, created_at'

/**
 * The pipeline prep sheets for this client (workspace card) — the upcoming
 * session's sheet + recent history. Tenant-gated via requireClientCoach.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { data: rows, error } = await supabase
      .from('prep_sheet_pipeline')
      .select(COLUMNS)
      .eq('client_id', params.id)
      .order('scheduled_send_at', { ascending: true, nullsFirst: false })
      .limit(20)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const list = rows || []
    const apptIds = Array.from(new Set(list.map((r) => r.appointment_id)))
    const { data: appts } = apptIds.length
      ? await supabase.from('appointments').select('id, scheduled_at').in('id', apptIds)
      : { data: [] as { id: string; scheduled_at: string }[] }
    const apptMap = new Map((appts || []).map((a) => [a.id, a.scheduled_at]))

    const { data: client } = await supabase.from('clients').select('name').eq('id', params.id).maybeSingle()

    const prepSheets = list.map((r) => ({
      ...r,
      client_name: client?.name || 'Client',
      session_at: apptMap.get(r.appointment_id) || null,
    }))

    return NextResponse.json({ prepSheets })
  } catch (e) {
    return toErrorResponse(e)
  }
}
