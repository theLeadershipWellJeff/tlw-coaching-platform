import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import { LedgerUnavailableError, buildCoachCostReport } from '@/lib/ai/costs'
import { monthKey, parseMonth } from '@/lib/ai/costs-math'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A coach's own clients' portal-assistant usage and cap state for one month
 * (the dashboard "Assistant usage" card). Scoped by the coach_clients link —
 * the request never names a client. `?month=YYYY-MM` (default: this month).
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const month = parseMonth(req.nextUrl.searchParams.get('month')) ?? monthKey()
    try {
      const report = await buildCoachCostReport(supabase, { coachId: coach.id, orgId: coach.org_id, month })
      return NextResponse.json({ report })
    } catch (e) {
      if (e instanceof LedgerUnavailableError) return NextResponse.json({ report: null, unavailable: true, month })
      throw e
    }
  } catch (e) {
    return toErrorResponse(e)
  }
}
