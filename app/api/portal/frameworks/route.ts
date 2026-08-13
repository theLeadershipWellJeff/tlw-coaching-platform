import { NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { loadPortalFrameworks } from '@/lib/portal/frameworks'

export const runtime = 'nodejs'

export async function GET() {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const frameworks = await loadPortalFrameworks(clientId)
  return NextResponse.json({ frameworks })
}
