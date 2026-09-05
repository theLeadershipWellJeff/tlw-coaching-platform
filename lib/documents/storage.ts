/**
 * Private Storage bucket for client documents (assessment reports, personnel
 * reviews). Deliberately NOT `library-pdfs`: different audience (the client's
 * own personal information), different lifecycle, different deletion policy.
 *
 * Path convention: `${clientId}/${documentId}.pdf`. Reached only via the
 * service-role key; clients get a short-lived signed URL from a route that has
 * already verified ownership.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

export const DOCUMENTS_BUCKET = 'client-documents'

/** Create the bucket if it doesn't exist yet (idempotent). */
export async function ensureDocumentsBucket(supabase: SupabaseClient<Database>): Promise<void> {
  const { error } = await supabase.storage.createBucket(DOCUMENTS_BUCKET, { public: false })
  if (error && !/exist/i.test(error.message)) throw error
}

export function documentStoragePath(clientId: string, documentId: string): string {
  return `${clientId}/${documentId}.pdf`
}

/**
 * Short-lived signed URL. `downloadAs` sets Content-Disposition: attachment
 * with that filename, so the browser saves the file instead of rendering it.
 */
export async function signedDocumentUrl(
  supabase: SupabaseClient<Database>,
  storagePath: string,
  opts: { seconds?: number; downloadAs?: string } = {}
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, opts.seconds ?? 300, opts.downloadAs ? { download: opts.downloadAs } : undefined)
  if (error || !data) return null
  return data.signedUrl
}
