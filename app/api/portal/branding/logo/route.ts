import { NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { readPortalLogo } from '@/lib/portal/branding'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Streams the logo of the signed-in client's OWN company (resolved through
 * clients.company_id — there is no company id in the URL to tamper with).
 * 404 when there is none. `?v=` in the URL is a cache-buster only.
 */
export async function GET() {
  const clientId = await getPortalClientId()
  if (!clientId) return new NextResponse(null, { status: 401 })
  const file = await readPortalLogo(clientId)
  if (!file) return new NextResponse(null, { status: 404 })
  return new NextResponse(file.bytes, {
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
