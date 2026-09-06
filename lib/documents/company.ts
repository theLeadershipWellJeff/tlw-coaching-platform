/**
 * Company documents (migration 060): sponsor-supplied material that shapes the
 * chat for that company's participants. PDF / Word / text; extracted text is
 * what the chat reads. Stored in the private client-documents bucket under
 * companies/<company_id>/<id>.<ext>.
 */
import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompanyDocument, Database } from '@/lib/supabase/types'
import { extractTranscriptText, SUPPORTED_TRANSCRIPT_EXTENSIONS } from '@/lib/transcripts/extract'
import { DOCUMENTS_BUCKET, ensureDocumentsBucket } from './storage'
import { DocumentError, MAX_DOCUMENT_BYTES } from './pipeline'

const ALLOWED_EXT = new Set<string>(['pdf', 'docx', 'txt', 'md', 'markdown', 'text'])
export const MAX_COMPANY_DOCUMENTS = 12

function extOf(filename: string): string {
  return (filename.split('.').pop() || '').toLowerCase()
}

export async function createCompanyDocument(
  supabase: SupabaseClient<Database>,
  input: { companyId: string; orgId: string; bytes: Buffer; filename: string; title?: string | null; uploadedBy: string | null; includeInChat?: boolean }
): Promise<CompanyDocument> {
  const ext = extOf(input.filename)
  if (!ALLOWED_EXT.has(ext)) {
    throw new DocumentError(400, `"${input.filename}" isn't a supported format. Use PDF, Word (.docx), or text (${SUPPORTED_TRANSCRIPT_EXTENSIONS.filter((e) => ALLOWED_EXT.has(e)).map((e) => '.' + e).join(', ')}).`)
  }
  if (input.bytes.length > MAX_DOCUMENT_BYTES) throw new DocumentError(400, `"${input.filename}" is larger than 4 MB.`)
  const { count } = await supabase.from('company_documents').select('id', { count: 'exact', head: true }).eq('company_id', input.companyId)
  if ((count ?? 0) >= MAX_COMPANY_DOCUMENTS) throw new DocumentError(409, `This company already has ${MAX_COMPANY_DOCUMENTS} documents — remove one first.`)

  await ensureDocumentsBucket(supabase)
  const id = randomUUID()
  const storagePath = `companies/${input.companyId}/${id}.${ext}`
  const contentType = ext === 'pdf' ? 'application/pdf' : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/plain'
  const { error: upErr } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(storagePath, input.bytes, { contentType, upsert: false })
  if (upErr) throw new DocumentError(500, `Could not store the file: ${upErr.message}`)

  let extracted_text: string | null = null
  let extraction_status = 'complete'
  let extraction_error: string | null = null
  try {
    extracted_text = (await extractTranscriptText(input.filename, input.bytes)).trim()
    if (!extracted_text) {
      extraction_status = 'failed'
      extraction_error = 'No readable text found in the file.'
    }
  } catch (e) {
    extraction_status = 'failed'
    extraction_error = e instanceof Error ? e.message : String(e)
  }

  const { data, error } = await supabase
    .from('company_documents')
    .insert({
      id,
      org_id: input.orgId,
      company_id: input.companyId,
      title: (input.title || '').trim() || input.filename.replace(/\.[^.]+$/, ''),
      storage_path: storagePath,
      size_bytes: input.bytes.length,
      extracted_text,
      extraction_status,
      extraction_error,
      include_in_chat: input.includeInChat !== false,
      uploaded_by: input.uploadedBy,
    })
    .select('*')
    .single()
  if (error || !data) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath])
    throw new DocumentError(500, `Could not record the document: ${error?.message || 'insert failed'}`)
  }
  return data as CompanyDocument
}

/** Metadata only — never the text. */
export async function listCompanyDocuments(supabase: SupabaseClient<Database>, companyId: string): Promise<Array<Omit<CompanyDocument, 'extracted_text'> & { text_chars: number }>> {
  const { data } = await supabase
    .from('company_documents')
    .select('id, org_id, company_id, title, storage_path, size_bytes, extracted_text, extraction_status, extraction_error, include_in_chat, uploaded_by, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  return (data || []).map(({ extracted_text, ...rest }) => ({ ...rest, text_chars: extracted_text?.length || 0 })) as any
}

export async function deleteCompanyDocument(supabase: SupabaseClient<Database>, doc: Pick<CompanyDocument, 'id' | 'storage_path'>): Promise<void> {
  await supabase.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path])
  const { error } = await supabase.from('company_documents').delete().eq('id', doc.id)
  if (error) throw new DocumentError(500, error.message)
}
