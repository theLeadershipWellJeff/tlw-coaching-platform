import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireSupervisor, toErrorResponse } from '@/lib/api-handler'
import { cancelCoachAccount } from '@/lib/admin/coach-cancel'

export const runtime = 'nodejs'

/**
 * POST /api/coaches/[id]/billing/cancel — cancel a coach's account on their
 * behalf (the "please cancel my account" email). Supervisor-only.
 *
 * Body: { when?: 'now' | 'period_end', email?: boolean, reason?: string }
 *   when   — 'period_end' (default) keeps their access until the paid period
 *            runs out; 'now' ends it today. A coach with no live subscription
 *            is walled immediately either way.
 *   email  — send the coach a confirmation from the acting supervisor's Gmail
 *            (default true).
 *
 * Stripe is cancelled FIRST; if that fails nothing changes and the error is
 * returned, so a walled coach can never be left with a charging subscription.
 * The row, and every piece of the coach's work, is kept — this is the wall
 * (lib/access.ts), not deletion. Use DELETE /api/coaches/[id] to remove.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin()
  let actor
  try {
    actor = await requireSupervisor(supabase)
  } catch (e) {
    return toErrorResponse(e)
  }

  if (params.id === actor.id) {
    return NextResponse.json({ error: 'You cannot cancel your own account from here.' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const when = body?.when === 'now' ? 'now' : 'period_end'
  const email = body?.email !== false
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) || null : null

  try {
    const result = await cancelCoachAccount(supabase, { coachId: params.id, when, actor, email, reason })
    return NextResponse.json(result)
  } catch (e: any) {
    const msg: string = e?.message ?? 'Cancel failed'
    const status = msg === 'Coach not found' ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
