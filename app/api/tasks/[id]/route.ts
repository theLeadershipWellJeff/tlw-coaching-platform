import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { readJson, requireCoach, toErrorResponse } from '@/lib/api-handler'
import { resolveTask } from '@/lib/coach-tasks/queue'

export const runtime = 'nodejs'

const Schema = z.object({
  // file = a note exists and stays internal; dismiss = no note needed. No snooze.
  action: z.enum(['file', 'dismiss']),
})

/** Resolve one of the coach's own pending tasks. Conditional on pending → 409 if already resolved. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const { action } = await readJson(req, Schema)
    const result = await resolveTask(supabase, coach, params.id, action)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return toErrorResponse(e)
  }
}
