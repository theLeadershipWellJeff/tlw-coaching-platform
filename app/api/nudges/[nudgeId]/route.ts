import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { ApiError, requireCoach, readJson, toErrorResponse } from '@/lib/api-handler'
import { sendNudge } from '@/lib/nudges/send'
import type { Database } from '@/lib/supabase/types'

type NudgeUpdate = Database['public']['Tables']['nudges']['Update']

export const runtime = 'nodejs'

const PatchSchema = z.object({
  // Edits to the draft (any subset).
  draft_subject: z.string().max(300).optional(),
  draft_body: z.string().max(8000).optional(),
  coach_note: z.string().max(2000).nullable().optional(),
  scheduled_for: z.string().datetime().nullable().optional(),
  // A queue action to take after applying any edits.
  action: z.enum(['schedule', 'send', 'skip', 'snooze']).optional(),
})

const SNOOZE_DAYS = 3

// Coach reviews a nudge: edit the draft / send time, then schedule, send now,
// skip, or snooze. Coach-scoped — a coach can only act on their own nudges.
export async function PATCH(req: NextRequest, { params }: { params: { nudgeId: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const body = await readJson(req, PatchSchema)

    const { data: nudge } = await supabase
      .from('nudges')
      .select('*')
      .eq('id', params.nudgeId)
      .eq('coach_id', coach.id)
      .maybeSingle()
    if (!nudge) throw new ApiError(404, 'Nudge not found')

    // Apply edits first so an action operates on the latest text/time.
    const edits: NudgeUpdate = {}
    if (body.draft_subject !== undefined) edits.draft_subject = body.draft_subject
    if (body.draft_body !== undefined) edits.draft_body = body.draft_body
    if (body.coach_note !== undefined) edits.coach_note = body.coach_note
    if (body.scheduled_for !== undefined) edits.scheduled_for = body.scheduled_for
    if (Object.keys(edits).length) {
      edits.updated_at = new Date().toISOString()
      await supabase.from('nudges').update(edits).eq('id', nudge.id)
      Object.assign(nudge, edits)
    }

    // Send now: refused if outside the spacing window (sendNudge enforces §3.4).
    if (body.action === 'send') {
      const result = await sendNudge(supabase, coach, nudge)
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 })
      const { data: sent } = await supabase.from('nudges').select('*').eq('id', nudge.id).maybeSingle()
      return NextResponse.json({ nudge: sent, sent: true })
    }

    let statusUpdate: NudgeUpdate | null = null
    if (body.action === 'schedule') {
      const when = (body.scheduled_for ?? nudge.scheduled_for) as string | null
      if (!when) throw new ApiError(400, 'Set a send time before scheduling this nudge.')
      statusUpdate = { status: 'scheduled', scheduled_for: when }
    } else if (body.action === 'skip') {
      statusUpdate = { status: 'skipped' }
    } else if (body.action === 'snooze') {
      const base = nudge.scheduled_for ? new Date(nudge.scheduled_for) : new Date()
      const next = new Date(base.getTime() + SNOOZE_DAYS * 24 * 60 * 60 * 1000)
      statusUpdate = { status: 'snoozed', scheduled_for: next.toISOString() }
    }

    if (statusUpdate) {
      statusUpdate.updated_at = new Date().toISOString()
      await supabase.from('nudges').update(statusUpdate).eq('id', nudge.id)
      Object.assign(nudge, statusUpdate)
    }

    return NextResponse.json({ nudge })
  } catch (e) {
    return toErrorResponse(e)
  }
}
