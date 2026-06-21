import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'

// A client's nudges for the workspace card — pending (draft/scheduled/snoozed) and
// recently sent, newest first. Skipped nudges are omitted.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { data, error } = await supabase
      .from('nudges')
      .select(
        'id, type, origin, status, trigger_excerpt, rationale, draft_subject, draft_body, scheduled_for, sent_at, created_at'
      )
      .eq('client_id', params.id)
      .in('status', ['draft', 'scheduled', 'snoozed', 'sent'])
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ nudges: data || [] })
  } catch (e) {
    return toErrorResponse(e)
  }
}
