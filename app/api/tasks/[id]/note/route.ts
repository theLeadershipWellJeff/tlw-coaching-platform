import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import { noteForTask } from '@/lib/coach-tasks/queue'

export const runtime = 'nodejs'

/**
 * "Write note" on a task: find the session's note or create one stamped with
 * the appointment's calendar event id, and return where the editor should open.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const result = await noteForTask(supabase, coach, params.id)
    return NextResponse.json({ ...result, href: `/clients/${result.clientId}/notes?note=${result.noteId}` })
  } catch (e) {
    return toErrorResponse(e)
  }
}
