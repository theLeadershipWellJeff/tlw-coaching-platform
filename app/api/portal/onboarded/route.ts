import { NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * Mark the first-visit tour as taken (migration 053). Stored on the client
 * record rather than localStorage so it doesn't re-fire on a new device.
 * A failed write returns 500 so the page can log it; the tour itself keeps a
 * per-browser fallback so the person is not greeted again regardless.
 */
export async function POST() {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from('clients').update({ portal_onboarded: true }).eq('id', clientId)
    if (error) throw new Error(error.message)
  } catch (e) {
    // Fail loud to the caller (it logs and keeps a per-browser fallback), so a
    // write that never lands is visible in the network tab instead of showing
    // up only as a tour that will not go away.
    console.error('portal onboarded flag failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not save.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
