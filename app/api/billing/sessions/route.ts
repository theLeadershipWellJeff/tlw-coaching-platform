/**
 * GET /api/billing/sessions?engagementId=&periodStart=&periodEnd=
 *
 * Derives and returns billable sessions for an arrears engagement over a period.
 * Called by the billing run assembler (Phase 3) and useful for preview/testing.
 *
 * The CA-owned guard is enforced: returns 400 if the engagement is CA-owned.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { deriveBillableSessions } from '@/lib/billing/sessions'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const engagementId = sp.get('engagementId')
  const periodStart = sp.get('periodStart')
  const periodEnd = sp.get('periodEnd')

  if (!engagementId || !periodStart || !periodEnd)
    return NextResponse.json({ error: 'engagementId, periodStart, and periodEnd are required' }, { status: 400 })

  const { data: rawEngagement, error: engErr } = await supabase
    .from('engagements')
    .select('*, coachees ( client_id )')
    .eq('id', engagementId)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (engErr) return NextResponse.json({ error: engErr.message }, { status: 500 })
  if (!rawEngagement) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const engagement = rawEngagement as any
  if (engagement.billing_owner === 'CA')
    return NextResponse.json({ error: 'CA-owned engagements are not billable through this system' }, { status: 400 })
  if (engagement.billing_mode !== 'arrears')
    return NextResponse.json({ error: 'Only arrears engagements have derived sessions' }, { status: 400 })

  const clientId = (engagement.coachees as any)?.client_id
  if (!clientId) return NextResponse.json({ error: 'Engagement coachee has no linked client' }, { status: 400 })

  try {
    const sessions = await deriveBillableSessions(
      supabase,
      engagement,
      clientId,
      periodStart,
      periodEnd,
    )
    return NextResponse.json({ sessions })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
