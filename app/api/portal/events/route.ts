import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { logPortalEvent, type PortalEventType } from '@/lib/portal/events'

export const runtime = 'nodejs'

/** Client-side outcome events the page itself can report (an allowlist — the
 *  server-side ones are logged by their own routes). Body: { type, metadata? }. */
const CLIENT_REPORTABLE: PortalEventType[] = ['talk_to_coach_clicked', 'report_viewed', 'comparison_viewed']

export async function POST(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const type = String(body?.type || '') as PortalEventType
  if (!CLIENT_REPORTABLE.includes(type)) return NextResponse.json({ error: 'Unknown event.' }, { status: 400 })
  const metadata = body?.metadata && typeof body.metadata === 'object' ? (body.metadata as Record<string, unknown>) : {}
  await logPortalEvent(clientId, type, metadata)
  return NextResponse.json({ ok: true })
}
