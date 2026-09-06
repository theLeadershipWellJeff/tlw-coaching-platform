import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { inviteCohortBatch } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Send portal invitations to a cohort — batched (≤25 per call) and throttled,
 * never one burst. Body: { onlyUninvited?: boolean } (default true). The UI
 * keeps calling while `remaining > 0`. A manual action by design: warm-up
 * pacing is a human decision (build prompt §7).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const body = await req.json().catch(() => ({}))
    const result = await inviteCohortBatch(supabase, params.id, { onlyUninvited: body.onlyUninvited !== false })
    await logAdminAction(supabase, {
      actorCoachId: actor.id,
      action: 'cohort_invite_batch',
      detail: { cohort_id: params.id, sent: result.sent.length, failed: result.failed.length, skipped: result.skipped, remaining: result.remaining },
    })
    return NextResponse.json(result)
  } catch (e) {
    return adminErrorResponse(e)
  }
}
