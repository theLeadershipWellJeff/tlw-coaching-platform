/**
 * Resolve which coach sends a client's portal emails — their primary coach (or
 * any linked coach as a fallback). Returns the full Coach row so the caller can
 * send via that coach's stored Gmail refresh token (unattended).
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { Coach } from '@/lib/supabase/types'

export async function resolveClientCoach(clientId: string): Promise<Coach | null> {
  const supabase = getSupabaseAdmin()
  const { data: links } = await supabase
    .from('coach_clients')
    .select('coach_id, role')
    .eq('client_id', clientId)
  if (!links || links.length === 0) return null
  const primary = links.find((l) => l.role === 'primary') || links[0]
  const { data: coach } = await supabase
    .from('coaches')
    .select('*')
    .eq('id', primary.coach_id)
    .maybeSingle()
  return coach ?? null
}
