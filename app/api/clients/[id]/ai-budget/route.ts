import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { ApiError, readJson, toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { budgetStatus } from '@/lib/ai/budget'
import { logAdminAction } from '@/lib/admin/audit'
import { AiGatewayError } from '@/lib/ai/errors'

export const runtime = 'nodejs'

/** USD micros per dollar. */
const USD = 1_000_000
/** The most a coach can set a client's monthly allowance to from the workspace. */
const MAX_EXTEND_USD = 100

/**
 * This client's portal-assistant budget this month (coach-scoped). Read by the
 * workspace "Assistant usage" card. `unavailable` pre-070.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)
    try {
      const status = await budgetStatus(supabase, { orgId: coach.org_id, clientId: params.id, principal: 'client', purpose: 'portal_chat' })
      return NextResponse.json({ status })
    } catch (e) {
      if (e instanceof AiGatewayError && e.code === 'ledger_unavailable') return NextResponse.json({ status: null, unavailable: true })
      throw e
    }
  } catch (e) {
    return toErrorResponse(e)
  }
}

const ExtendSchema = z.object({
  /** New monthly cap for THIS month, in whole dollars. */
  capUsd: z.number().int().min(1).max(MAX_EXTEND_USD),
})

/**
 * "Extend" (brief §Phase 2): raise this client's cap for the current month by
 * writing a dated `ai_budgets` row (scope client), which outranks the standing
 * default in ai_resolve_cap. Logged to admin_audit_log as the acting coach.
 * Never lowers below what is already spent.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)
    const { capUsd } = await readJson(req, ExtendSchema)
    const current = await budgetStatus(supabase, { orgId: coach.org_id, clientId: params.id, principal: 'client', purpose: 'portal_chat' })
    const capMicros = capUsd * USD
    if ((current.client?.spent ?? 0) > capMicros) {
      throw new ApiError(400, `This client has already used more than $${capUsd} this month — set a higher amount.`)
    }
    const row = {
      org_id: coach.org_id,
      scope: 'client' as const,
      scope_id: params.id,
      period_month: current.period_month,
      cap_usd_micros: capMicros,
      soft_pct: current.client?.soft_pct ?? 80,
      enabled: true,
      note: `Extended by coach ${coach.email} on ${new Date().toISOString().slice(0, 10)}`,
      updated_at: new Date().toISOString(),
    }
    // The dedupe index is an expression index (COALESCE on period_month), which
    // PostgREST upsert cannot target — this month's row always has a real date,
    // so an explicit update-or-insert is exact.
    const { data: existing } = await supabase
      .from('ai_budgets')
      .select('id')
      .eq('org_id', coach.org_id)
      .eq('scope', 'client')
      .eq('scope_id', params.id)
      .eq('period_month', current.period_month)
      .maybeSingle()
    const res = existing
      ? await supabase.from('ai_budgets').update(row).eq('id', existing.id)
      : await supabase.from('ai_budgets').insert(row)
    if (res.error) throw new ApiError(500, res.error.message)
    await logAdminAction(supabase, {
      actorCoachId: coach.id,
      action: 'ai_budget_extended',
      targetClientId: params.id,
      detail: { period_month: current.period_month, previous_cap_micros: current.client?.cap ?? null, new_cap_micros: capMicros, spent_micros: current.client?.spent ?? 0 },
    })
    const status = await budgetStatus(supabase, { orgId: coach.org_id, clientId: params.id, principal: 'client', purpose: 'portal_chat' })
    return NextResponse.json({ status })
  } catch (e) {
    return toErrorResponse(e)
  }
}
