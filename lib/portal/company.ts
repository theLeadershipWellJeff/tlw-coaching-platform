/**
 * Company vision/values for chat context — loaded STRICTLY through the
 * client's own `company_id`. A client with no company gets null, and the prompt
 * then carries no company section at all (no placeholder, no "no company
 * context" line). The isolation rule — a client at Company A can never receive
 * Company B's context — is verified by scripts/spikes/verify-portal-phase3.js
 * against a real Postgres using the same two-step lookup as below.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'

export type CompanyContext = { id: string; name: string; vision: string | null; values: string | null }

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
  if (!company.vision && !company.values) return null
  return { id: company.id, name: company.name, vision: company.vision, values: company.values }
}
