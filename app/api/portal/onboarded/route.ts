import { NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * Mark the first-visit tour as taken (migration 053). Stored on the client
 * record rather than localStorage so it doesn't re-fire on a new device.
 * Best-effort: a failure just means the tour offers itself again.
 */
export async function POST() {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('clients').update({ portal_onboarded: true }).eq('id', clientId)
  } catch (e) {
    console.error('portal onboarded flag failed:', e)
  }
  return NextResponse.json({ ok: true })
}
