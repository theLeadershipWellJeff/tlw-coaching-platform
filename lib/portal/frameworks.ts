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

  // Two sources, unioned: frameworks a nudge was sent about, and frameworks a
  // scored session merely NAMED (migration 055). A framework the coach taught in
  // session but never nudged about used to be invisible here.
  const [{ data: nudges }, mentioned] = await Promise.all([
    supabase
      .from('nudges')
      .select('framework_slug, coach_id')
      .eq('client_id', clientId)
      .eq('type', 'framework')
      .not('framework_slug', 'is', null),
    // Reads defensively: an install that hasn't applied 055 falls back to the
    // nudge-derived list, which is what this card showed before.
    supabase
      .from('client_frameworks')
      .select('framework_slug, coach_id')
      .eq('client_id', clientId)
      .is('dismissed_at', null)
      .then(
        (r) => r.data ?? [],
        () => []
      ),
  ])

  const slugs = Array.from(
    new Set(
      [...(nudges ?? []), ...mentioned].map((n) => n.framework_slug).filter(Boolean)
    )
  ) as string[]
  if (slugs.length === 0) return []
  const coachId = (nudges?.[0]?.coach_id ?? mentioned[0]?.coach_id) as string | undefined
  if (!coachId) return []

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

  // Authorization mirrors what the card can show — a nudge about this framework,
  // or a recorded (non-dismissed) mention. Keeping these two in step matters: a
  // framework visible on the card whose PDF 404s would look broken, and one
  // authorized here but not shown would be a leak.
  const { data: nudge } = await supabase
    .from('nudges')
    .select('coach_id')
    .eq('client_id', clientId)
    .eq('type', 'framework')
    .eq('framework_slug', slug)
    .limit(1)
    .maybeSingle()

  let coachId: string | null = nudge?.coach_id ?? null
  if (!coachId) {
    const { data: mention } = await supabase
      .from('client_frameworks')
      .select('coach_id')
      .eq('client_id', clientId)
      .eq('framework_slug', slug)
      .is('dismissed_at', null)
      .limit(1)
      .maybeSingle()
    coachId = mention?.coach_id ?? null
  }
  if (!coachId) return null

  const { data: leaf } = await supabase
    .from('garden_notes')
    .select('pdf_resource_id')
    .eq('coach_id', coachId)
    .eq('id', slug)
    // The surfacing gate is re-applied here, so a leaf the coach later marked
    // non-eligible stops serving its PDF even to a client who saw it before.
    .eq('nudge_eligible', true)
    .maybeSingle()
  if (!leaf?.pdf_resource_id) return null

  const { data: pdf } = await supabase
    .from('pdf_resources')
    .select('storage_path')
    .eq('id', leaf.pdf_resource_id)
    .maybeSingle()
  return pdf?.storage_path ?? null
}
