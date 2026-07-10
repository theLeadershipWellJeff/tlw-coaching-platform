/**
 * Read-time enrichment for nudge lists: the client's session rhythm (last /
 * next appointment) so the coach reviews each nudge in context, and the
 * attached-PDF display name. Shared by the cross-client queue
 * (GET /api/nudges) and the per-client card (GET /api/clients/[id]/nudges).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

export type AppointmentContext = {
  last_appointment_at: string | null
  next_appointment_at: string | null
}

/**
 * Per-client last (most recent past, scheduled/completed) and next (soonest
 * upcoming, still scheduled) appointment instants. Cancelled/ignored rows
 * never count.
 */
export async function loadAppointmentContext(
  supabase: SupabaseClient<Database>,
  clientIds: string[]
): Promise<Map<string, AppointmentContext>> {
  const map = new Map<string, AppointmentContext>()
  const ids = Array.from(new Set(clientIds)).filter(Boolean)
  if (!ids.length) return map

  const { data } = await supabase
    .from('appointments')
    .select('client_id, scheduled_at, status')
    .in('client_id', ids)
    .in('status', ['scheduled', 'completed'])
  const now = Date.now()
  for (const row of data || []) {
    if (!row.client_id || !row.scheduled_at) continue
    const ctx = map.get(row.client_id) || { last_appointment_at: null, next_appointment_at: null }
    const at = new Date(row.scheduled_at).getTime()
    if (Number.isNaN(at)) continue
    if (at < now) {
      if (!ctx.last_appointment_at || at > new Date(ctx.last_appointment_at).getTime()) {
        ctx.last_appointment_at = row.scheduled_at
      }
    } else if (row.status === 'scheduled') {
      if (!ctx.next_appointment_at || at < new Date(ctx.next_appointment_at).getTime()) {
        ctx.next_appointment_at = row.scheduled_at
      }
    }
    map.set(row.client_id, ctx)
  }
  return map
}

/** Display names for attached Library PDFs, keyed by pdf_resources.id. */
export async function loadPdfNames(
  supabase: SupabaseClient<Database>,
  pdfIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const ids = Array.from(new Set(pdfIds.filter((id): id is string => !!id)))
  if (!ids.length) return map
  const { data } = await supabase.from('pdf_resources').select('id, name').in('id', ids)
  for (const p of data || []) map.set(p.id, p.name)
  return map
}
