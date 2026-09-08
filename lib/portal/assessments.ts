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

/**
 * A one-line status for the chat when a 360 exists on file but is NOT the
 * surfaced report — so the assistant explains the state ("your report is on
 * file but the name didn't match", "it's still being read") instead of saying
 * no report exists. Null when nothing needs explaining: no assessment rows, or
 * the latest one is complete and the surfaces are on.
 */
export async function loadAssessmentStatusForChat(clientId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  const [{ data: docs }, enabled] = await Promise.all([
    supabase
      .from('client_documents')
      .select('id, kind, title, extraction_status, extraction_error, created_at, extracted_text')
      .eq('client_id', clientId)
      .in('kind', ['assessment_360', 'general'])
      .order('created_at', { ascending: false })
      .limit(10),
    assessmentsEnabled(clientId),
  ])
  const rows = docs || []
  const latest360 = rows.find((d) => d.kind === 'assessment_360')
  const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  if (latest360) {
    if (latest360.extraction_status === 'complete' && enabled) return null
    if (latest360.extraction_status === 'complete' && !enabled) {
      return `A 360 report was added on ${when(latest360.created_at)} and read successfully, but the 360 surfaces are not switched on for this account, so its contents are not available to you. If they ask about it, say exactly that and point them to their coach or support.`
    }
    const err = latest360.extraction_error || ''
    if (latest360.extraction_status === 'failed' && err.startsWith('name_mismatch')) {
      return `A 360 report was added on ${when(latest360.created_at)} but could not be attached to this account because the name on the report did not match the name on the account, so its contents are not available to you. If they ask about it, say exactly that and suggest they ask their coach or support to confirm the report is theirs.`
    }
    if (latest360.extraction_status === 'unsupported') {
      return `A 360 report was added on ${when(latest360.created_at)} but its layout could not be read automatically; support has been notified. Its contents are not available to you. If they ask about it, say exactly that.`
    }
    if (latest360.extraction_status === 'failed') {
      return `A 360 report was added on ${when(latest360.created_at)} but could not be read; support has been notified. Its contents are not available to you. If they ask about it, say exactly that.`
    }
    return `A 360 report was added on ${when(latest360.created_at)} and is still being read. Its contents are not available to you yet. If they ask about it, say exactly that and suggest they try again shortly.`
  }
  // A 360 filed as an "other document" before the pipeline learned to recognise
  // one by its layout: the assistant sees clipped text, not the report.
  const looksLike360 = rows.find(
    (d) => d.kind === 'general' && /Differentiating Competenc|Extraordinary Leader|Leadership Tent/i.test(d.extracted_text || '')
  )
  if (looksLike360) {
    return `A document added on ${when(looksLike360.created_at)}${looksLike360.title ? ` ("${looksLike360.title}")` : ''} looks like a 360 feedback report but was filed as an other document, so you see only part of its text rather than the full report. If they ask about their 360, say exactly that and suggest they remove it under "Your documents" on their home page and add it again — it will then be read in full.`
  }
  return null
}
