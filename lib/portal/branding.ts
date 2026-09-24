/**
 * Enterprise co-branding (migration 073). A sponsor company's logo shows at
 * the top of its participants' portal home and chat, beside "Powered by
 * theLeadershipWell" at equal size.
 *
 * Same isolation rule as lib/portal/company.ts: the company is resolved
 * STRICTLY through the client's own `clients.company_id` — a client can only
 * ever receive their own company's logo. Reads are defensive: before 073 is
 * applied (or with no company / no logo) the result is null and the portal
 * renders exactly as before.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { DOCUMENTS_BUCKET, ensureDocumentsBucket } from '@/lib/documents/storage'

/** Raster only — an SVG can carry script, and this is served on our origin. */
export const LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
export const LOGO_MAX_BYTES = 1024 * 1024

export type PortalBranding = {
  companyName: string
  /** Same-origin, session-scoped URL; `v` busts the cache on a replaced logo. */
  logoUrl: string
}

type LogoRow = { id: string; name: string; logo_path: string | null; logo_content_type: string | null; logo_updated_at: string | null }

async function companyLogoRow(clientId: string): Promise<LogoRow | null> {
  const supabase = getSupabaseAdmin()
  const { data: client } = await supabase.from('clients').select('company_id').eq('id', clientId).maybeSingle()
  if (!client?.company_id) return null
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, logo_path, logo_content_type, logo_updated_at')
    .eq('id', client.company_id)
    .maybeSingle()
  if (error || !data) return null // pre-073: the columns don't exist yet
  return data as LogoRow
}

export async function loadPortalBranding(clientId: string): Promise<PortalBranding | null> {
  try {
    const row = await companyLogoRow(clientId)
    if (!row?.logo_path) return null
    const v = row.logo_updated_at ? new Date(row.logo_updated_at).getTime() : 0
    return { companyName: row.name, logoUrl: `/api/portal/branding/logo?v=${v}` }
  } catch {
    return null
  }
}

/** The bytes of THIS client's company logo, or null. */
export async function readPortalLogo(clientId: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  try {
    const row = await companyLogoRow(clientId)
    if (!row?.logo_path) return null
    return readLogoFile(getSupabaseAdmin(), row.logo_path, row.logo_content_type)
  } catch {
    return null
  }
}

export async function readLogoFile(
  supabase: SupabaseClient<Database>,
  path: string,
  contentType: string | null
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(path)
  if (error || !data) return null
  return { bytes: await data.arrayBuffer(), contentType: contentType || 'image/png' }
}

/** Validate + store a logo for a company; replaces any previous one. */
export async function saveCompanyLogo(
  supabase: SupabaseClient<Database>,
  companyId: string,
  file: { bytes: Buffer; type: string }
): Promise<{ ok: true; logo_updated_at: string } | { ok: false; status: number; error: string }> {
  const ext = LOGO_TYPES[file.type]
  if (!ext) return { ok: false, status: 400, error: 'Upload a PNG, JPEG or WebP image (SVG is not accepted).' }
  if (file.bytes.length === 0) return { ok: false, status: 400, error: 'That file is empty.' }
  if (file.bytes.length > LOGO_MAX_BYTES) return { ok: false, status: 400, error: 'Logos must be 1 MB or smaller.' }

  const { data: prev, error: readErr } = await supabase
    .from('companies')
    .select('id, logo_path')
    .eq('id', companyId)
    .maybeSingle()
  if (readErr) {
    return { ok: false, status: 500, error: /logo_path/.test(readErr.message) ? 'Apply migration 073 (company logo) first.' : readErr.message }
  }
  if (!prev) return { ok: false, status: 404, error: 'Company not found.' }

  await ensureDocumentsBucket(supabase)
  const path = `companies/${companyId}/logo.${ext}`
  const { error: upErr } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file.bytes, { contentType: file.type, upsert: true })
  if (upErr) return { ok: false, status: 500, error: upErr.message }
  if (prev.logo_path && prev.logo_path !== path) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([prev.logo_path]).catch(() => {})
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('companies')
    .update({ logo_path: path, logo_content_type: file.type, logo_updated_at: now, updated_at: now })
    .eq('id', companyId)
  if (error) return { ok: false, status: 500, error: error.message }
  return { ok: true, logo_updated_at: now }
}

export async function removeCompanyLogo(supabase: SupabaseClient<Database>, companyId: string): Promise<void> {
  const { data } = await supabase.from('companies').select('logo_path').eq('id', companyId).maybeSingle()
  if (data?.logo_path) await supabase.storage.from(DOCUMENTS_BUCKET).remove([data.logo_path]).catch(() => {})
  const now = new Date().toISOString()
  await supabase
    .from('companies')
    .update({ logo_path: null, logo_content_type: null, logo_updated_at: now, updated_at: now })
    .eq('id', companyId)
}
