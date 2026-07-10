import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse, requireCoach } from '@/lib/api-handler'
import { loadAppointmentContext, loadPdfNames } from '@/lib/nudges/enrich'

export const dynamic = 'force-dynamic'

const NUDGE_COLUMNS =
  'id, client_id, type, origin, status, trigger_excerpt, rationale, draft_subject, draft_body, coach_note, pdf_resource_id, scheduled_for, sent_at, created_at'

// The coach's cross-client Nudge Queue — every pending nudge (draft / scheduled /
// snoozed) they need to review, newest first, plus the recently sent ones for the
// Sent panel. Each row is enriched with the client name, the client's last/next
// appointment (the session rhythm the nudge lands inside), and the attached-PDF
// name. Coach-scoped: only this coach's nudges.
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)

    const [{ data: pending, error: pendErr }, { data: sent, error: sentErr }] = await Promise.all([
      supabase
        .from('nudges')
        .select(NUDGE_COLUMNS)
        .eq('coach_id', coach.id)
        .in('status', ['draft', 'scheduled', 'snoozed'])
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('nudges')
        .select(NUDGE_COLUMNS)
        .eq('coach_id', coach.id)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(50),
    ])
    if (pendErr) return NextResponse.json({ error: pendErr.message }, { status: 500 })
    if (sentErr) return NextResponse.json({ error: sentErr.message }, { status: 500 })

    const all = [...(pending || []), ...(sent || [])]

    // Relationship types aren't generated, so resolve client names in a second
    // query (same pattern as the reminder cron / lib/clientNames).
    const clientIds = Array.from(new Set(all.map((n) => n.client_id)))
    const nameMap = new Map<string, string>()
    if (clientIds.length) {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name')
        .in('id', clientIds)
      for (const c of clients || []) nameMap.set(c.id, c.name)
    }

    const [apptCtx, pdfNames] = await Promise.all([
      loadAppointmentContext(supabase, clientIds),
      loadPdfNames(supabase, all.map((n) => n.pdf_resource_id)),
    ])

    const enrich = (n: (typeof all)[number]) => ({
      ...n,
      client_name: nameMap.get(n.client_id) || 'Unknown client',
      last_appointment_at: apptCtx.get(n.client_id)?.last_appointment_at ?? null,
      next_appointment_at: apptCtx.get(n.client_id)?.next_appointment_at ?? null,
      pdf_name: n.pdf_resource_id ? pdfNames.get(n.pdf_resource_id) || null : null,
    })

    return NextResponse.json({
      nudges: (pending || []).map(enrich),
      sent: (sent || []).map(enrich),
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}
