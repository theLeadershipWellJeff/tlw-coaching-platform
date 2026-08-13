/**
 * Frameworks surfaced to a client — the coaching frameworks (garden leaves) that
 * were shared with THIS client via framework nudges. Read-only, scoped by the
 * client's own nudge history; a client can only ever see (and open the PDF for) a
 * framework that was actually surfaced to them.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'

export type PortalFramework = {
  slug: string
  title: string
  summary: string | null
  type: string | null
  hasPdf: boolean
}

export async function loadPortalFrameworks(clientId: string): Promise<PortalFramework[]> {
  const supabase = getSupabaseAdmin()

  const { data: nudges } = await supabase
    .from('nudges')
    .select('framework_slug, coach_id')
    .eq('client_id', clientId)
    .eq('type', 'framework')
    .not('framework_slug', 'is', null)
  if (!nudges || nudges.length === 0) return []

  const slugs = Array.from(new Set(nudges.map((n) => n.framework_slug).filter(Boolean))) as string[]
  if (slugs.length === 0) return []
  const coachId = nudges[0].coach_id

  const { data: leaves } = await supabase
    .from('garden_notes')
    .select('id, title, summary, type, pdf_resource_id')
    .eq('coach_id', coachId)
    .in('id', slugs)
    .eq('nudge_eligible', true)

  return (leaves || []).map((l) => ({
    slug: l.id,
    title: l.title,
    summary: l.summary,
    type: l.type,
    hasPdf: !!l.pdf_resource_id,
  }))
}

/** Resolve a framework PDF's Storage path — ONLY if this framework was surfaced
 *  to this client. Returns the storage_path, or null (unknown / not theirs / no
 *  PDF). */
export async function resolveClientFrameworkPdf(
  clientId: string,
  slug: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin()

  const { data: nudge } = await supabase
    .from('nudges')
    .select('coach_id')
    .eq('client_id', clientId)
    .eq('type', 'framework')
    .eq('framework_slug', slug)
    .limit(1)
    .maybeSingle()
  if (!nudge) return null

  const { data: leaf } = await supabase
    .from('garden_notes')
    .select('pdf_resource_id')
    .eq('coach_id', nudge.coach_id)
    .eq('id', slug)
    .maybeSingle()
  if (!leaf?.pdf_resource_id) return null

  const { data: pdf } = await supabase
    .from('pdf_resources')
    .select('storage_path')
    .eq('id', leaf.pdf_resource_id)
    .maybeSingle()
  return pdf?.storage_path ?? null
}
