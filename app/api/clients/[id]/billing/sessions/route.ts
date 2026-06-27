import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { coachCanAccessClient } from '@/lib/client-access'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canAccess = await coachCanAccessClient(supabase, coach.id, params.id)
  if (!canAccess) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Find the coachee row for this client + coach
  const { data: coachee } = await supabase
    .from('coachees')
    .select('id')
    .eq('client_id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (!coachee) return NextResponse.json({ sessions: [] })

  // Find active engagements with session_count set
  const { data: engagements } = await supabase
    .from('engagements')
    .select('id, session_count, billing_mode')
    .eq('coachee_id', coachee.id)
    .eq('coach_id', coach.id)
    .eq('status', 'active')
    .not('session_count', 'is', null)

  if (!engagements || engagements.length === 0) return NextResponse.json({ sessions: [] })

  // Count notes for this client as sessions used
  const { count: sessionsUsed } = await supabase
    .from('notes')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', params.id)

  const used = sessionsUsed ?? 0

  const sessions = engagements.map((eng: any) => ({
    engagementId: eng.id,
    sessionCount: eng.session_count as number,
    sessionsUsed: used,
    billingMode: eng.billing_mode as string,
  }))

  return NextResponse.json({ sessions })
}
