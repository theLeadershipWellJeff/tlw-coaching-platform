/**
 * Company context for chat — loaded STRICTLY through the client's own
 * `company_id`. A client with no company gets null, and the prompt then
 * carries no company section at all (no placeholder, no "no company context"
 * line). The isolation rule — a client at Company A can never receive Company
 * B's context — is verified by scripts/spikes/verify-portal-phase3.js against
 * a real Postgres using the same two-step lookup as below.
 *
 * Since migration 060 the context also carries the sponsor's uploaded
 * documents (extracted text, budgeted), which is how an enterprise client
 * customises the chat for its own people.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'

export type CompanyContext = {
  id: string
  name: string
  vision: string | null
  values: string | null
  documents: Array<{ title: string; text: string }>
}

/** Total characters of company-document text carried into the prompt. */
export const COMPANY_DOCS_CHAR_BUDGET = 16000
const PER_DOC_CHARS = 8000

export async function loadCompanyContext(clientId: string): Promise<CompanyContext | null> {
  const supabase = getSupabaseAdmin()
  const { data: client } = await supabase.from('clients').select('company_id').eq('id', clientId).maybeSingle()
  if (!client?.company_id) return null
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, vision, values')
    .eq('id', client.company_id)
    .maybeSingle()
  if (!company) return null

  const documents: CompanyContext['documents'] = []
  try {
    const { data: docs } = await supabase
      .from('company_documents')
      .select('title, extracted_text')
      .eq('company_id', company.id)
      .eq('include_in_chat', true)
      .eq('extraction_status', 'complete')
      .order('created_at', { ascending: true })
    let budget = COMPANY_DOCS_CHAR_BUDGET
    for (const d of docs || []) {
      if (budget <= 0) break
      const text = (d.extracted_text || '').trim().slice(0, Math.min(PER_DOC_CHARS, budget))
      if (!text) continue
      budget -= text.length
      documents.push({ title: d.title, text })
    }
  } catch {
    // Migration 060 not applied yet — vision/values still work.
  }

  if (!company.vision && !company.values && documents.length === 0) return null
  return { id: company.id, name: company.name, vision: company.vision, values: company.values, documents }
}
