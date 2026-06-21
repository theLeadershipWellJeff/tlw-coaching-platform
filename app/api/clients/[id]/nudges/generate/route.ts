import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { generateNudgesForClient } from '@/lib/nudges/generate'

export const runtime = 'nodejs'
// Drafting calls Claude (extract + draft); give it room before the function limit.
export const maxDuration = 120

// Manually draft nudges for a client from their current context — the same engine
// that runs after scoring, exposed for the workspace card's "Draft nudges" button
// and for verifying the pipeline on a real client. Always produces DRAFTS only;
// nothing sends. Uses the client's most recent transcript as the source, if any.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)

    const { data: latest } = await supabase
      .from('transcripts')
      .select('id')
      .eq('client_id', params.id)
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const result = await generateNudgesForClient(supabase, {
      clientId: params.id,
      coachId: coach.id,
      sourceSessionId: latest?.id ?? null,
    })

    return NextResponse.json({ created: result.created, nudges: result.nudges })
  } catch (e) {
    return toErrorResponse(e)
  }
}
