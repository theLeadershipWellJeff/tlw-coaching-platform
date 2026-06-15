import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

/**
 * Attach each row's client full name as `client_name`, resolved in one extra
 * query (relationship types aren't generated, so we join in code rather than
 * via an embedded select — same pattern as the per-client transcripts route).
 *
 * Names are for in-app display only; the stored `client_initials` remain the
 * privacy-preserving label used everywhere data is persisted or emailed.
 */
export async function withClientNames<T extends { client_id?: string | null }>(
  supabase: SupabaseClient<Database>,
  rows: T[]
): Promise<(T & { client_name: string | null })[]> {
  const ids = Array.from(new Set(rows.map((r) => r.client_id).filter((id): id is string => !!id)))
  if (ids.length === 0) return rows.map((r) => ({ ...r, client_name: null }))

  const { data } = await supabase.from('clients').select('id, name').in('id', ids)
  const nameById = new Map((data || []).map((c) => [c.id, c.name]))

  return rows.map((r) => ({ ...r, client_name: r.client_id ? nameById.get(r.client_id) ?? null : null }))
}
