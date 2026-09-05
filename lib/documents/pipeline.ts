/**
 * Client-document pipeline: upload → store → extract → validate → persist.
 *
 * One path for coach upload, client self-upload, bulk upload, and retry, so the
 * guards live in exactly one place:
 *  - PDF only, ≤ 4 MB, valid header; per-client caps (5 assessments / 10 total,
 *    raisable per client via portal_features);
 *  - the NAME GATE: the participant name printed on the report must match the
 *    client record, or the extraction fails with `name_mismatch` and nothing
 *    is surfaced until a human confirms (`confirmName`). Coach side it catches
 *    a report filed on the wrong client; client side it catches a participant
 *    uploading a colleague's report;
 *  - a document whose extraction is not `complete` is never client-visible and
 *    never enters chat context — but it IS still downloadable by its owner;
 *  - a second assessment on the same instrument links to its predecessor
 *    (`supersedes_document_id`) and carries the longitudinal `comparison`.
 *
 * Rater names never reach the database: the extractor returns them only so
 * this module can assert their absence, which the validator already did.
 */
import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClientDocument, ClientDocumentKind, Database, PortalFeatures } from '@/lib/supabase/types'
import { extractTranscriptText } from '@/lib/transcripts/extract'
import { compareAssessments, extractAssessment360, namesMatch, type Assessment360Data } from './assessment-360'
import { DOCUMENTS_BUCKET, documentStoragePath, ensureDocumentsBucket } from './storage'

export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024
export const DEFAULT_MAX_ASSESSMENTS = 5
export const DEFAULT_MAX_DOCUMENTS = 10

export class DocumentError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'DocumentError'
  }
}

export type UploadInput = {
  clientId: string
  orgId: string
  kind: ClientDocumentKind
  bytes: Buffer
  filename: string
  title?: string | null
  uploaderRole: 'coach' | 'client'
  uploadedBy?: string | null
  visibleToCoach: boolean
}

export type UploadResult = {
  document: ClientDocument
  /** Human-readable outcome for the UI. */
  message: string
}

/** Plain-language rejection for a file that isn't a usable report. */
export function checkPdfBytes(bytes: Buffer, filename: string): void {
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new DocumentError(400, `"${filename}" is larger than 4 MB. A single feedback report is usually about 1 MB — check this is the individual report, not a bundle.`)
  if (bytes.length < 1000 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new DocumentError(400, `"${filename}" isn't a PDF. Download the report from the assessment portal as a PDF and try again.`)
  }
}

async function loadCaps(supabase: SupabaseClient<Database>, clientId: string): Promise<{ maxAssessments: number; maxDocuments: number; features: PortalFeatures }> {
  const { data } = await supabase.from('clients').select('portal_features').eq('id', clientId).maybeSingle()
  const f = ((data?.portal_features as PortalFeatures) || {}) as PortalFeatures & { max_assessments?: number; max_documents?: number }
  return {
    maxAssessments: Number(f.max_assessments) > 0 ? Number(f.max_assessments) : DEFAULT_MAX_ASSESSMENTS,
    maxDocuments: Number(f.max_documents) > 0 ? Number(f.max_documents) : DEFAULT_MAX_DOCUMENTS,
    features: f,
  }
}

async function enforceCaps(supabase: SupabaseClient<Database>, clientId: string, kind: ClientDocumentKind): Promise<void> {
  const caps = await loadCaps(supabase, clientId)
  const { data: rows } = await supabase.from('client_documents').select('kind').eq('client_id', clientId)
  const all = rows || []
  if (all.length >= caps.maxDocuments) throw new DocumentError(409, `This client already has ${all.length} documents (limit ${caps.maxDocuments}).`)
  if (kind === 'assessment_360' && all.filter((r) => r.kind === 'assessment_360').length >= caps.maxAssessments) {
    throw new DocumentError(409, `This client already has ${caps.maxAssessments} assessment reports on file (the limit).`)
  }
}

/**
 * Store a new document and run extraction in-band (a 33-page report extracts
 * in well under a second). Returns the persisted row; extraction outcome is
 * on `extraction_status` / `extraction_error`.
 */
export async function createClientDocument(
  supabase: SupabaseClient<Database>,
  input: UploadInput,
  opts: { confirmName?: boolean } = {}
): Promise<UploadResult> {
  checkPdfBytes(input.bytes, input.filename)
  await enforceCaps(supabase, input.clientId, input.kind)
  await ensureDocumentsBucket(supabase)

  const id = randomUUID()
  const storagePath = documentStoragePath(input.clientId, id)
  const { error: upErr } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, input.bytes, { contentType: 'application/pdf', upsert: false })
  if (upErr) throw new DocumentError(500, `Could not store the file: ${upErr.message}`)

  const { data: row, error } = await supabase
    .from('client_documents')
    .insert({
      id,
      org_id: input.orgId,
      client_id: input.clientId,
      kind: input.kind,
      title: input.title || input.filename.replace(/\.pdf$/i, ''),
      storage_path: storagePath,
      size_bytes: input.bytes.length,
      extraction_status: 'pending',
      uploaded_by: input.uploadedBy ?? null,
      uploader_role: input.uploaderRole,
      // A personnel review is never visible to any coach, whatever the caller says.
      visible_to_coach: input.kind === 'personnel_review' ? false : input.visibleToCoach,
    })
    .select('*')
    .single()
  if (error || !row) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath])
    throw new DocumentError(500, `Could not record the document: ${error?.message || 'insert failed'}`)
  }

  const document = await runExtraction(supabase, row as ClientDocument, input.bytes, opts)
  return { document, message: describeOutcome(document) }
}

/** Re-run extraction for an existing row (retry / confirm-name). */
export async function retryExtraction(
  supabase: SupabaseClient<Database>,
  documentId: string,
  opts: { confirmName?: boolean } = {}
): Promise<UploadResult> {
  const { data: row } = await supabase.from('client_documents').select('*').eq('id', documentId).maybeSingle()
  if (!row) throw new DocumentError(404, 'Document not found')
  const { data: file, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(row.storage_path)
  if (error || !file) throw new DocumentError(500, `Could not read the stored file: ${error?.message || 'missing'}`)
  const bytes = Buffer.from(await file.arrayBuffer())
  const document = await runExtraction(supabase, row as ClientDocument, bytes, opts)
  return { document, message: describeOutcome(document) }
}

function describeOutcome(doc: ClientDocument): string {
  switch (doc.extraction_status) {
    case 'complete':
      return 'Report read and verified.'
    case 'unsupported':
      return `This report layout isn't supported yet. ${doc.extraction_error || ''}`.trim()
    case 'failed':
      return doc.extraction_error?.startsWith('name_mismatch')
        ? 'The name on the report does not match this client — confirm it is theirs to continue.'
        : `Could not read the report: ${doc.extraction_error || 'unknown error'}`
    default:
      return 'Extraction pending.'
  }
}

async function runExtraction(
  supabase: SupabaseClient<Database>,
  row: ClientDocument,
  bytes: Buffer,
  opts: { confirmName?: boolean }
): Promise<ClientDocument> {
  const patch: Partial<ClientDocument> & { updated_at: string } = { updated_at: new Date().toISOString() }

  if (row.kind !== 'assessment_360') {
    // Text-only kinds: no structured pass, no name gate.
    try {
      patch.extracted_text = await extractTranscriptText(`${row.id}.pdf`, bytes)
      patch.extraction_status = 'complete'
      patch.extraction_error = null
    } catch (e) {
      patch.extraction_status = 'failed'
      patch.extraction_error = e instanceof Error ? e.message : String(e)
    }
    return persist(supabase, row.id, patch)
  }

  const outcome = await extractAssessment360(new Uint8Array(bytes))
  patch.format_version = outcome.formatVersion
  if (outcome.status !== 'complete') {
    patch.extraction_status = outcome.status
    patch.extraction_error = outcome.error
    patch.structured_data = null
    patch.extracted_text = null
    return persist(supabase, row.id, patch)
  }

  // Name gate.
  const { data: client } = await supabase.from('clients').select('name').eq('id', row.client_id).maybeSingle()
  const clientName = client?.name || ''
  if (!opts.confirmName && !namesMatch(outcome.data.participant_name, clientName)) {
    patch.extraction_status = 'failed'
    patch.extraction_error = `name_mismatch: the report is for "${outcome.data.participant_name}"; this client record is "${clientName}".`
    patch.structured_data = null
    patch.extracted_text = null
    patch.assessment_date = outcome.data.assessment_date
    patch.instrument = outcome.data.instrument
    return persist(supabase, row.id, patch)
  }

  // Longitudinal link: the most recent OTHER completed assessment on the same
  // instrument for this client, ordered by assessment_date (never created_at).
  let data: Assessment360Data = outcome.data
  const { data: priors } = await supabase
    .from('client_documents')
    .select('id, assessment_date, structured_data')
    .eq('client_id', row.client_id)
    .eq('kind', 'assessment_360')
    .eq('extraction_status', 'complete')
    .eq('instrument', outcome.data.instrument)
    .neq('id', row.id)
    .not('structured_data', 'is', null)
    .order('assessment_date', { ascending: false, nullsFirst: false })
  const prior = (priors || []).find((p) => !outcome.data.assessment_date || !p.assessment_date || p.assessment_date <= outcome.data.assessment_date)
  if (prior?.structured_data) {
    const priorData = prior.structured_data as unknown as Assessment360Data
    data = { ...data, comparison: compareAssessments(data, priorData, prior.id) }
    patch.supersedes_document_id = prior.id
  }

  patch.structured_data = data as unknown as Record<string, unknown>
  patch.extracted_text = outcome.extractedText
  patch.extraction_status = 'complete'
  patch.extraction_error = outcome.warnings.length ? `warnings: ${outcome.warnings.join(' | ')}` : null
  patch.assessment_date = data.assessment_date
  patch.instrument = data.instrument
  // A title the uploader didn't set explicitly is the filename stem; once the
  // report is read, name it by instrument and date instead.
  if (!row.title || !row.title.includes(' · ')) patch.title = `${data.instrument} · ${data.report_date}`
  return persist(supabase, row.id, patch)
}

async function persist(supabase: SupabaseClient<Database>, id: string, patch: Partial<ClientDocument>): Promise<ClientDocument> {
  const { data, error } = await supabase.from('client_documents').update(patch).eq('id', id).select('*').single()
  if (error || !data) throw new DocumentError(500, `Could not save the extraction: ${error?.message || 'update failed'}`)
  return data as ClientDocument
}

/** The coach-side view: never a personnel review, only rows the client allows. */
export async function listCoachVisibleDocuments(supabase: SupabaseClient<Database>, clientId: string): Promise<ClientDocument[]> {
  const { data } = await supabase
    .from('client_documents')
    .select('id, org_id, client_id, kind, title, storage_path, size_bytes, extraction_status, extraction_error, uploaded_by, uploader_role, visible_to_coach, assessment_date, instrument, format_version, supersedes_document_id, created_at, updated_at')
    .eq('client_id', clientId)
    .eq('visible_to_coach', true)
    .neq('kind', 'personnel_review')
    .order('assessment_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  return ((data || []) as unknown as ClientDocument[]).map((d) => ({ ...d, extracted_text: null, structured_data: null }))
}

/** Remove a document (row + file). */
export async function deleteClientDocument(supabase: SupabaseClient<Database>, doc: Pick<ClientDocument, 'id' | 'storage_path'>): Promise<void> {
  await supabase.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path])
  const { error } = await supabase.from('client_documents').delete().eq('id', doc.id)
  if (error) throw new DocumentError(500, error.message)
}
