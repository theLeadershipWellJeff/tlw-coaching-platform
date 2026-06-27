/**
 * POST /api/billing/run/assemble
 * Body: { periodStart: "YYYY-MM-DD", periodEnd: "YYYY-MM-DD" }
 *
 * Runs the billing run assembler for the signed-in coach over the given period.
 * Creates draft invoices for all active TLW-owned engagements. Idempotent:
 * accounts already invoiced for the period are skipped.
 *
 * Nothing sends or charges — approval is a separate step.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { assembleRun } from '@/lib/billing/run'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { periodStart, periodEnd } = body as { periodStart?: string; periodEnd?: string }

  if (!periodStart || !periodEnd)
    return NextResponse.json({ error: 'periodStart and periodEnd are required' }, { status: 400 })

  // Basic date format guard.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd))
    return NextResponse.json({ error: 'dates must be YYYY-MM-DD' }, { status: 400 })

  if (periodStart > periodEnd)
    return NextResponse.json({ error: 'periodStart must be before periodEnd' }, { status: 400 })

  try {
    const result = await assembleRun(supabase, coach.id, periodStart, periodEnd)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
