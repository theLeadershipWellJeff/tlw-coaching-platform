import type { PortalFeatures } from '@/lib/supabase/types'

/** True when the Command Center has archived this client's portal access. */
export function isPortalArchived(features: unknown): boolean {
  return ((features || {}) as PortalFeatures).archived === true
}

/**
 * True when a portal access window (`clients.portal_access_expires_at`, set from
 * the cohort) has passed. Null/unparseable = no window = never expired.
 */
export function isPortalAccessExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false
  const t = Date.parse(expiresAt)
  return Number.isFinite(t) && t < now
}

/** Archived OR past the access window — the one "no portal access" test for auth + session. */
export function isPortalAccessBlocked(row: { portal_features?: unknown; portal_access_expires_at?: string | null } | null | undefined): boolean {
  if (!row) return false
  return isPortalArchived(row.portal_features) || isPortalAccessExpired(row.portal_access_expires_at)
}
