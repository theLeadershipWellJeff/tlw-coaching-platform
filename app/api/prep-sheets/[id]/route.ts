import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { ApiError, requireCoach, readJson, toErrorResponse } from '@/lib/api-handler'
import { dispatchPrepSheetNow } from '@/lib/prep-sheets/dispatch'
import { regeneratePrepSheet } from '@/lib/prep-sheets/generate'
import type { Database } from '@/lib/supabase/types'

type PrepUpdate = Database['public']['Tables']['prep_sheet_pipeline']['Update']

export const runtime = 'nodejs'
export const maxDuration = 60

const PatchSchema = z.object({
  // Edits to the draft (any subset).
  subject: z.string().max(300).optional(),
  body_html: z.string().max(200_000).optional(),
  // Required when action === 'skip' (stored so a skip is never silent).
  skip_reason_note: z.string().max(1000).optional(),
  action: z.enum(['approve', 'skip', 'send', 'regenerate']).optional(),
})

/**
 * Coach reviews a prep sheet: edit subject/body, then approve, skip (with a
 * reason), send now, or regenerate. Coach-scoped — a coach only acts on their own
 * sheets. Every reachable transition preserves the review-before-send doctrine:
 * nothing goes to the client without an explicit approve or send-now here.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const body = await readJson(req, PatchSchema)

    const { data: sheet } = await supabase
      .from('prep_sheet_pipeline')
      .select('*')
      .eq('id', params.id)
      .eq('coach_id', coach.id)
      .maybeSingle()
    if (!sheet) throw new ApiError(404, 'Prep sheet not found')

    // Regenerate — re-runs the generator in place, resets to draft.
    if (body.action === 'regenerate') {
      const result = await regeneratePrepSheet(supabase, coach, sheet)
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 })
      const { data: fresh } = await supabase.from('prep_sheet_pipeline').select('*').eq('id', sheet.id).maybeSingle()
      return NextResponse.json({ prepSheet: fresh })
    }

    // Send now — atomic claim + send (from draft or approved).
    if (body.action === 'send') {
      const result = await dispatchPrepSheetNow(supabase, coach, sheet.id)
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 })
      const { data: sent } = await supabase.from('prep_sheet_pipeline').select('*').eq('id', sheet.id).maybeSingle()
      return NextResponse.json({ prepSheet: sent, sent: true })
    }

    const now = new Date().toISOString()

    // Apply content edits first so an action operates on the latest text. An edit
    // to an already-approved sheet drops it back to draft — it must be re-approved.
    const edits: PrepUpdate = {}
    if (body.subject !== undefined) edits.subject = body.subject
    if (body.body_html !== undefined) edits.body_html = body.body_html
    const editedContent = body.subject !== undefined || body.body_html !== undefined
    if (editedContent && sheet.status === 'approved') {
      edits.status = 'draft'
      edits.approved_at = null
    }
    if (Object.keys(edits).length) {
      edits.updated_at = now
      await supabase.from('prep_sheet_pipeline').update(edits).eq('id', sheet.id)
      Object.assign(sheet, edits)
    }

    // Status action.
    let statusUpdate: PrepUpdate | null = null
    if (body.action === 'approve') {
      if (sheet.status === 'sent' || sheet.status === 'skipped') {
        throw new ApiError(409, 'This prep sheet has already been sent or skipped.')
      }
      // Confirm the delivery moment as it stands; the cron dispatches at it.
      statusUpdate = { status: 'approved', approved_at: now }
    } else if (body.action === 'skip') {
      const note = (body.skip_reason_note || '').trim()
      if (!note) throw new ApiError(400, 'Add a reason before skipping this prep sheet.')
      // skip_reason is the machine category; the coach's words go in error_detail
      // (the human "why this didn't reach the client" note, shared with failures).
      statusUpdate = { status: 'skipped', skip_reason: 'coach_choice', skipped_at: now, error_detail: note.slice(0, 500) }
    }

    if (statusUpdate) {
      statusUpdate.updated_at = now
      await supabase.from('prep_sheet_pipeline').update(statusUpdate).eq('id', sheet.id)
      Object.assign(sheet, statusUpdate)
    }

    return NextResponse.json({ prepSheet: sheet })
  } catch (e) {
    return toErrorResponse(e)
  }
}
