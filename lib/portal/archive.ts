import type { PortalFeatures } from '@/lib/supabase/types'

/** True when the Command Center has archived this client's portal access. */
export function isPortalArchived(features: unknown): boolean {
  return ((features || {}) as PortalFeatures).archived === true
}
