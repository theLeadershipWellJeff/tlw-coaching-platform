/**
 * Billing route authorization seam (§10 / §12.3).
 *
 * Billing routes read the acting coach through THIS helper rather than calling
 * getSessionCoach directly, so a read-only `bookkeeper` role (coaches.role) can
 * be added later without touching every route. Today it resolves the signed-in
 * coach and admits coach | supervisor | bookkeeper; the `canWrite` flag is the
 * seam a bookkeeper would fail on for money-movement routes.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSessionCoach } from '@/lib/coach'
import type { Coach, Database } from '@/lib/supabase/types'

export type BillingActor = {
  coach: Coach
  /** Whether this actor may trigger money movement (charge/adjust/send). */
  canWrite: boolean
}

/**
 * The billing actor for the signed-in session, or null if not authenticated.
 * A future 'bookkeeper' role resolves here with canWrite=false.
 */
export async function getBillingActor(
  supabase: SupabaseClient<Database>,
): Promise<BillingActor | null> {
  const coach = await getSessionCoach(supabase)
  if (!coach) return null
  const role = (coach as any).role ?? 'coach'
  return { coach, canWrite: role !== 'bookkeeper' }
}
