import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'
import { sendReportReadyEmail } from '@/lib/portal/report-ready'

export const runtime = 'nodejs'

/** Email an invited portal user that their (newest) 360 report is ready. Once per report. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const r = await sendReportReadyEmail(supabase, params.id)
    await logAdminAction(supabase, {
      actorCoachId: actor.id,
      action: 'portal_report_ready_sent',
      targetClientId: params.id,
      detail: { document_id: r.documentId, via: r.via, ok: r.ok, warning: r.warning ?? null, error: r.error ?? null },
    })
    if (!r.ok) throw new AdminError(502, `Could not send. ${r.error || ''}`.trim())
    return NextResponse.json({ ok: true, sentTo: r.sentTo, via: r.via, warning: r.warning })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
