import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse, requireCoach } from '@/lib/api-handler'
import { syncFrameworks } from '@/lib/vault/sync'

export const runtime = 'nodejs'
export const maxDuration = 120

// Manual "Sync vault" — re-index the signed-in coach's frameworks from their vault
// folder. Returns counts (indexed / ignored-untagged / removed) + any per-file
// errors so the coach gets feedback that their tagging worked.
export async function POST() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const result = await syncFrameworks(supabase, coach.id)
    return NextResponse.json(result)
  } catch (e) {
    return toErrorResponse(e)
  }
}
