import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { LedgerUnavailableError, buildOrgCostReport } from '@/lib/ai/costs'
import { monthKey, parseMonth } from '@/lib/ai/costs-math'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The AI cost cockpit (supervisor-only): one month of the org's ledger rolled
 * up by feature, model, coach, and client, with % of every cap and the
 * invoiced-revenue join. `?month=YYYY-MM` (default: this UTC month). Counts
 * and money only — never a prompt, a message, or a document.
 */
export async function GET(req: NextRequest) {
  try {
    const { supabase, actor } = await adminContext()
    const month = parseMonth(req.nextUrl.searchParams.get('month')) ?? monthKey()
    try {
      const report = await buildOrgCostReport(supabase, { orgId: actor.org_id, month })
      return NextResponse.json({ report })
    } catch (e) {
      if (e instanceof LedgerUnavailableError) return NextResponse.json({ report: null, unavailable: true, month })
      throw e
    }
  } catch (e) {
    return adminErrorResponse(e)
  }
}
