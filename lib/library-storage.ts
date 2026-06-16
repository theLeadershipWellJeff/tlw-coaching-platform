import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// Private Storage bucket holding Library PDF resources. Reached only via the
// service-role key (signed URLs are minted server-side for viewing).
export const PDF_BUCKET = 'library-pdfs'

/** Create the bucket if it doesn't exist yet (idempotent). */
export async function ensurePdfBucket(supabase: SupabaseClient<Database>): Promise<void> {
  const { error } = await supabase.storage.createBucket(PDF_BUCKET, { public: false })
  // A 409 ("already exists") is expected on every call after the first.
  if (error && !/exist/i.test(error.message)) throw error
}
