/**
 * Engagement progress — the one source of the "type label + sessions bar"
 * shown on the roster client cards, the workspace name card, and the Billing
 * block. Semantics by billing mode:
 *
 * - subscription: label "Monthly Subscription"; the bar tracks sessions
 *   received THIS CALENDAR YEAR against `session_count`, which for a
 *   subscription means sessions-per-year (the gap = sessions remaining in
 *   the year).
 * - per_engagement / arrears: label "<N>-Month Engagement" when
 *   `length_months` is set (migration 036), else "Fixed Engagement" /
 *   "Hourly Engagement"; the bar tracks all-time sessions against
 *   `session_count` (total sessions in the engagement).
 *
 * `total` is null when no session count is set — callers show the label and
 * the sessions-to-date count without a bar. Engagements are read with
 * select('*') so a not-yet-applied 036 just leaves `length_months` undefined
 * (label falls back) instead of breaking the query.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { Engagement } from '@/lib/billing/types'

export type EngagementProgressEntry = {
  engagementId: string
  mode: string // arrears | subscription | per_engagement
  label: string
  used: number
  total: number | null
}

function labelFor(mode: string, lengthMonths: number | null | undefined): string {
  if (mode === 'subscription') return 'Monthly Subscription'
  if (lengthMonths && lengthMonths > 0) return `${lengthMonths}-Month Engagement`
  if (mode === 'per_engagement') return 'Fixed Engagement'
  return 'Hourly Engagement'
}

export async function getEngagementProgress(
  supabase: SupabaseClient<Database>,
  coachId: string,
  clientIds: string[]
): Promise<Record<string, EngagementProgressEntry>> {
  const result: Record<string, EngagementProgressEntry> = {}
  if (clientIds.length === 0) return result

  const { data: coachees } = await supabase
    .from('coachees')
    .select('id, client_id')
    .eq('coach_id', coachId)
    .in('client_id', clientIds)
  const coacheeToClient = new Map((coachees || []).map((c) => [c.id, c.client_id]))
  if (coacheeToClient.size === 0) return result

  const { data: engagements } = await supabase
    .from('engagements')
    .select('*')
    .eq('coach_id', coachId)
    .eq('status', 'active')
    .in('coachee_id', Array.from(coacheeToClient.keys()))
    .order('created_at', { ascending: true })

  // First active engagement per client wins (multiple actives are rare).
  const byClient = new Map<string, Engagement>()
  for (const e of engagements || []) {
    const clientId = coacheeToClient.get(e.coachee_id)
    if (clientId && !byClient.has(clientId)) byClient.set(clientId, e)
  }
  if (byClient.size === 0) return result

  // Sessions to date: all-time and this-calendar-year counts per client, from
  // logged notes (same basis as the original bar and the revenue cards).
  const yearStart = `${new Date().getFullYear()}-01-01`
  const { data: noteRows } = await supabase
    .from('notes')
    .select('client_id, session_date')
    .in('client_id', Array.from(byClient.keys()))
  const allTime = new Map<string, number>()
  const thisYear = new Map<string, number>()
  for (const n of noteRows || []) {
    allTime.set(n.client_id, (allTime.get(n.client_id) || 0) + 1)
    if (n.session_date && n.session_date >= yearStart) {
      thisYear.set(n.client_id, (thisYear.get(n.client_id) || 0) + 1)
    }
  }

  byClient.forEach((e, clientId) => {
    const subscription = e.billing_mode === 'subscription'
    result[clientId] = {
      engagementId: e.id,
      mode: e.billing_mode,
      label: labelFor(e.billing_mode, (e as { length_months?: number | null }).length_months),
      used: (subscription ? thisYear.get(clientId) : allTime.get(clientId)) || 0,
      total: e.session_count ?? null,
    }
  })
  return result
}
