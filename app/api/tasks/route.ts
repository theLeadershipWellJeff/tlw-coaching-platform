import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import { listPendingTasks } from '@/lib/coach-tasks/queue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The signed-in coach's pending attention-queue tasks (migration 067), enriched
 * with client, session, and note for the "Needs your attention" card. Scoped to
 * the coach in `listPendingTasks` — never a cross-coach read.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const tasks = await listPendingTasks(supabase, coach)
    return NextResponse.json({ tasks, timeZone: coach.timezone })
  } catch (e: any) {
    // Pre-067 the table is missing: say so instead of a bare 500.
    if (typeof e?.message === 'string' && /coach_tasks/.test(e.message) && /does not exist|schema cache/.test(e.message)) {
      return NextResponse.json({ tasks: [], unavailable: true, error: 'Apply migration 067 (coach_tasks).' })
    }
    return toErrorResponse(e)
  }
}
