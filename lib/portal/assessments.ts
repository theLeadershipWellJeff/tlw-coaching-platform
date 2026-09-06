/**
 * Assessment surfaces for the Client Portal (Phase 3 of the debrief add-on).
 *
 * The gate is `portal_features.assessments === true` AND a completed
 * assessment document — NEVER `client_type`. A coaching client with a 360 and a
 * standalone participant get the identical surface. Every query is scoped to
 * the authenticated clientId.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { Assessment360Data } from '@/lib/documents/assessment-360/types'
import type { PortalFeatures } from '@/lib/supabase/types'

export type PortalAssessment = {
  id: string
  title: string | null
  instrument: string | null
  assessment_date: string | null
  has_comparison: boolean
  uploader_role: 'coach' | 'client'
  visible_to_coach: boolean
}

export type PortalAssessments = {
  enabled: boolean
  documents: PortalAssessment[]
}

export async function assessmentsEnabled(clientId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('clients').select('portal_features').eq('id', clientId).maybeSingle()
  const f = (data?.portal_features || {}) as PortalFeatures
  return f.assessments === true
}

/** Completed assessments, newest first by assessment_date (never created_at). */
export async function loadPortalAssessments(clientId: string): Promise<PortalAssessments> {
  const enabled = await assessmentsEnabled(clientId)
  if (!enabled) return { enabled: false, documents: [] }
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('client_documents')
    .select('id, title, instrument, assessment_date, supersedes_document_id, uploader_role, visible_to_coach, structured_data')
    .eq('client_id', clientId)
    .eq('kind', 'assessment_360')
    .eq('extraction_status', 'complete')
    .order('assessment_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  const documents: PortalAssessment[] = (data || []).map((d) => ({
    id: d.id,
    title: d.title,
    instrument: d.instrument,
    assessment_date: d.assessment_date,
    has_comparison: !!(d.structured_data as { comparison?: unknown } | null)?.comparison,
    uploader_role: d.uploader_role as 'coach' | 'client',
    visible_to_coach: d.visible_to_coach,
  }))
  return { enabled: true, documents }
}

/**
 * The most recent completed assessment's structured data for chat grounding
 * (the build prompt: include the most recent in full plus its comparison
 * block; never every historical report). Null when the flag is off or no
 * completed document exists — the chat then behaves exactly as before.
 */
export async function loadLatestAssessmentForChat(
  clientId: string
): Promise<{ documentId: string; data: Assessment360Data; assessmentCount: number } | null> {
  const { enabled, documents } = await loadPortalAssessments(clientId)
  if (!enabled || documents.length === 0) return null
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('client_documents')
    .select('id, structured_data')
    .eq('id', documents[0].id)
    .eq('client_id', clientId)
    .maybeSingle()
  if (!data?.structured_data) return null
  return { documentId: data.id, data: data.structured_data as unknown as Assessment360Data, assessmentCount: documents.length }
}
