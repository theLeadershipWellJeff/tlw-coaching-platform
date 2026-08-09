/**
 * Tenant context for a request. The isolation chain is org_id → coach_id →
 * client_id; this derives the org/coach claims from the resolved session coach,
 * which then drive a request-scoped, RLS-honoring Supabase client
 * (`getSupabaseForClaims`) as the strangler RLS rollout (Phase 1 §5.3) switches
 * each table-group off the service-role key.
 *
 * Dormant until §5.3 — no route consumes this yet.
 */
import type { Coach } from './supabase/types'
import type { TenantClaims } from './supabase/jwt'

export type { TenantClaims }

/** Build the tenant claims for a resolved coach. */
export function tenantClaimsFromCoach(coach: Coach): TenantClaims {
  if (!coach.org_id) {
    throw new Error(
      `Coach ${coach.id} has no org_id — migration 042 (organizations + org_id) ` +
        'must be applied before request-scoped tenant clients can be minted.'
    )
  }
  return { orgId: coach.org_id, coachId: coach.id, coachRole: coach.role }
}
