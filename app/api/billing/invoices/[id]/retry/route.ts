/**
 * POST /api/billing/invoices/[id]/retry
 *
 * "Retry in 3 days" on a failed charge (Phase 4). Sets charge_retry_at = now + 3
 * days; the billing-retries cron fires it (capped at 2 automatic retries). Only
 * a failed-charge invoice under the retry cap can be scheduled.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getBillingActor } from '@/lib/billing/access'

export const runtime = 'nodejs'

const MAX_TOTAL_ATTEMPTS = 3
const RETRY_DELAY_MS = 3 * 24 * 60 * 60 * 1000

type Params = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const actor = await getBillingActor(supabase)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.canWrite) return NextResponse.json({ error: 'Read-only role' }, { status: 403 })

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, charge_status, charge_attempt_count, status')
    .eq('id', params.id)
    .eq('coach_id', actor.coach.id)
    .maybeSingle()
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const inv = invoice as any
  if (inv.charge_status !== 'failed') {
    return NextResponse.json({ error: 'Only a failed charge can be retried.' }, { status: 409 })
  }
  if ((inv.charge_attempt_count ?? 0) >= MAX_TOTAL_ATTEMPTS) {
    return NextResponse.json({ error: 'Automatic retry limit reached — send an invoice instead.' }, { status: 409 })
  }

  const retryAt = new Date(Date.now() + RETRY_DELAY_MS).toISOString()
  await supabase
    .from('invoices')
    .update({ charge_retry_at: retryAt, updated_at: new Date().toISOString() } as any)
    .eq('id', params.id)

  return NextResponse.json({ ok: true, retryAt })
}
