/**
 * Admin audit trail (migration 057). Every supervisor action taken from the
 * Command Center — plan changes, on-behalf portal invite resends, portal
 * unlocks, billing links — writes one append-only row here, so "who did what
 * to whose account" is always answerable.
 *
 * Best-effort by design: an audit-table hiccup (or the migration not applied
 * yet) must never block the admin action itself, so failures log and return.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

export type AdminAction =
  | 'plan_change'
  | 'portal_invite_resend'
  | 'portal_unlock'
  | 'billing_checkout_link'
  | 'coach_added'
  | 'coach_removed'

export async function logAdminAction(
  supabase: SupabaseClient<Database>,
  entry: {
    actorCoachId: string
    action: AdminAction
    targetCoachId?: string | null
    targetClientId?: string | null
    detail?: Record<string, unknown>
  }
): Promise<void> {
  try {
    const { error } = await supabase.from('admin_audit_log').insert({
      actor_coach_id: entry.actorCoachId,
      action: entry.action,
      target_coach_id: entry.targetCoachId ?? null,
      target_client_id: entry.targetClientId ?? null,
      detail: entry.detail ?? null,
    } as any)
    if (error) console.error('[admin audit] insert failed:', error.message)
  } catch (e) {
    console.error('[admin audit] insert threw:', e)
  }
}
