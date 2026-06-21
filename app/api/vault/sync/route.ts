import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse, requireCoach } from '@/lib/api-handler'
import { syncGarden } from '@/lib/vault/sync'

export const runtime = 'nodejs'
export const maxDuration = 120

// Manual "Sync vault" — re-index the signed-in coach's garden from their vault
// folder. Returns counts (indexed leaves / surfaceable / edges / non-leaf ignored
// / removed) + any per-file errors so the coach gets feedback that it worked.
export async function POST() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const result = await syncGarden(supabase, coach.id)
    return NextResponse.json(result)
  } catch (e) {
    return toErrorResponse(e)
  }
}
