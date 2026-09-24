import { NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { loadPortalBranding } from '@/lib/portal/branding'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The signed-in client's co-branding (their own company's logo), or null. */
export async function GET() {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ branding: await loadPortalBranding(clientId) })
}
