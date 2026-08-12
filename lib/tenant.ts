/**
 * Tenant context for a request. The isolation chain is org_id → coach_id →
 * client_id; this derives the org/coach claims from the resolved session coach,
 * which then drive a request-scoped, RLS-honoring Postgres transaction
 * (lib/supabase/pg.ts#withOrgClaim) for tenant-scoped reads (Phase 1 §5.3).
 */
import type { Coach } from './supabase/types'

export type TenantClaims = {
  orgId: string
  coachId: string
  coachRole: string
}

/** Build the tenant claims for a resolved coach. */
export function tenantClaimsFromCoach(coach: Coach): TenantClaims {
  if (!coach.org_id) {
    throw new Error(
      `Coach ${coach.id} has no org_id — migration 042 (organizations + org_id) ` +
        'must be applied before tenant-scoped queries can run.'
    )
  }
  return { orgId: coach.org_id, coachId: coach.id, coachRole: coach.role }
}
