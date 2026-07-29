/**
 * POST /api/billing/invoices/[id]/charge
 *
 * Charge the account's stored card for this invoice (Phase 2). Idempotent —
 * claim-before-charge + Stripe idempotency keys mean a double-click charges once.
 * All money movement runs through lib/billing/charge.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getBillingActor } from '@/lib/billing/access'
import { chargeInvoice } from '@/lib/billing/charge'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const actor = await getBillingActor(supabase)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.canWrite) return NextResponse.json({ error: 'Read-only role' }, { status: 403 })

  const result = await chargeInvoice(supabase, actor.coach.id, params.id, actor.coach as any)

  if (result.ok) {
    return NextResponse.json({ ok: true, status: result.status, alreadyCharged: (result as any).alreadyCharged ?? false })
  }
  // 402 for money-related outcomes so the UI can surface them inline.
  const status = result.status === 'error' ? 500 : 402
  return NextResponse.json(result, { status })
}
