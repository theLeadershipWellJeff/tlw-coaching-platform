/**
 * POST /api/billing/invoices/[id]/adjust
 *
 * Create a refund / credit_to_balance / void (Phase 5). Reason is REQUIRED and
 * enforced here as well as in the lib. All money movement runs through
 * lib/billing/adjustments.ts (idempotent, over-amount guarded server-side).
 *
 * Body: { type: 'refund'|'credit_to_balance'|'void', amountCents?: number, reason: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getBillingActor } from '@/lib/billing/access'
import { createAdjustment } from '@/lib/billing/adjustments'
import type { AdjustmentType } from '@/lib/billing/types'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const actor = await getBillingActor(supabase)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.canWrite) return NextResponse.json({ error: 'Read-only role' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { type?: string; amountCents?: number; reason?: string }
  const type = body.type as AdjustmentType
  if (!['refund', 'credit_to_balance', 'void'].includes(type)) {
    return NextResponse.json({ error: 'type must be refund, credit_to_balance, or void' }, { status: 400 })
  }
  if (!body.reason || !body.reason.trim()) {
    return NextResponse.json({ error: 'A reason is required.' }, { status: 400 })
  }

  const result = await createAdjustment(supabase, actor.coach.id, params.id, actor.coach.email, {
    type,
    amountCents: Math.round(body.amountCents ?? 0),
    reason: body.reason,
  })

  if (result.ok) return NextResponse.json(result)
  const status = result.code === 'over_amount' || result.code === 'not_allowed' || result.code === 'reason_required' ? 422 : result.code === 'duplicate' ? 409 : 402
  return NextResponse.json(result, { status })
}
