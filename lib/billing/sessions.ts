/**
 * Billable session derivation — maps existing notes records to billable_sessions
 * rows for arrears engagements.
 *
 * The billing run (Phase 3) calls this for each TLW-owned arrears engagement
 * when assembling a draft invoice. Subscription and per_engagement engagements
 * don't use this path (their lines are drawn directly).
 *
 * Key invariants enforced here:
 *  - Only notes with session_date in [periodStart, periodEnd] are included.
 *  - A note already linked to a billed_invoice_id is skipped (re-bill guard).
 *  - Upserts by note_id so re-running is safe (idempotent within a period).
 *  - Only TLW-owned engagements should be passed in; the caller enforces this.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { billedHours } from '@/lib/billing'
import type { BillableSession, Engagement, Coachee } from './types'

type MinEngagement = Pick<
  Engagement,
  'id' | 'coach_id' | 'coachee_id' | 'billing_mode' | 'billing_owner' | 'rate_hourly'
>

/**
 * Derive and upsert billable_session rows for one arrears engagement over a period.
 * Returns the full set of unbilled rows for the period (newly created + any that
 * were already there and remain unbilled).
 */
export async function deriveBillableSessions(
  supabase: SupabaseClient,
  engagement: MinEngagement,
  clientId: string,
  periodStart: string,
  periodEnd: string,
): Promise<BillableSession[]> {
  if (engagement.billing_mode !== 'arrears') return []
  if (engagement.billing_owner !== 'TLW') return []
  if (!engagement.rate_hourly || engagement.rate_hourly <= 0) return []

  // Fetch notes in the period for this client that have a non-zero duration.
  const { data: notes, error: notesErr } = await supabase
    .from('notes')
    .select('id, session_date, duration_minutes')
    .eq('client_id', clientId)
    .gte('session_date', periodStart)
    .lte('session_date', periodEnd)
    .gt('duration_minutes', 0)

  if (notesErr) throw new Error(`deriveBillableSessions: notes query failed — ${notesErr.message}`)
  if (!notes || notes.length === 0) return []

  const rate = engagement.rate_hourly

  // Build upsert rows. We upsert by (engagement_id, note_id) — the unique key
  // the DB enforces via the index. A note already on an invoice has
  // billed_invoice_id set; we skip those here and let the DB constraint hold.
  const rows = notes.map((n) => {
    const hours = billedHours(n.duration_minutes ?? 60)
    const amount = Math.round(rate * hours * 100) / 100
    return {
      coach_id: engagement.coach_id,
      engagement_id: engagement.id,
      coachee_id: engagement.coachee_id,
      note_id: n.id,
      occurred_on: n.session_date,
      duration_hours: hours,
      amount,
    }
  })

  const { error: upsertErr } = await supabase
    .from('billable_sessions')
    .upsert(rows, { onConflict: 'engagement_id,note_id', ignoreDuplicates: false })

  if (upsertErr) throw new Error(`deriveBillableSessions: upsert failed — ${upsertErr.message}`)

  // Return the unbilled rows for this engagement + period.
  const { data: result, error: fetchErr } = await supabase
    .from('billable_sessions')
    .select('*')
    .eq('engagement_id', engagement.id)
    .gte('occurred_on', periodStart)
    .lte('occurred_on', periodEnd)
    .is('billed_invoice_id', null)
    .order('occurred_on', { ascending: true })

  if (fetchErr) throw new Error(`deriveBillableSessions: result fetch failed — ${fetchErr.message}`)
  return (result ?? []) as BillableSession[]
}
