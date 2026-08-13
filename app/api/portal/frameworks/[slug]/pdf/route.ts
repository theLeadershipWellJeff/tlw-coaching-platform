import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { resolveClientFrameworkPdf } from '@/lib/portal/frameworks'
import { PDF_BUCKET } from '@/lib/library-storage'

export const runtime = 'nodejs'

/** Redirect to a short-lived signed URL for a framework's PDF — only if this
 *  framework was surfaced to the authenticated client. */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const path = await resolveClientFrameworkPdf(clientId, params.slug)
  if (!path) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.storage.from(PDF_BUCKET).createSignedUrl(path, 300)
  if (error || !data) return NextResponse.json({ error: 'Could not open the PDF.' }, { status: 502 })

  return NextResponse.redirect(data.signedUrl)
}
