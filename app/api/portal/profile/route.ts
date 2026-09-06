import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { allTimeZones } from '@/lib/scheduling'
import type { Database } from '@/lib/supabase/types'

export const runtime = 'nodejs'

/**
 * The client's own profile for the portal Settings page. Reads and writes
 * ONLY the client-facing identity fields — name, preferred name ("What should
 * I call you"), phone, timezone. Email is returned read-only: it is the
 * sign-in identity, so changing it is a coach / support action. Never
 * key_info or any coach-private column. Scoped to the session client.
 */
const SELECT = 'id, name, email, phone, timezone'

export async function GET() {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('clients').select(SELECT).eq('id', clientId).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // preferred_name (migration 061) read separately so a missing column never
  // breaks the page — it just reads as unset.
  const preferred = await supabase
    .from('clients')
    .select('preferred_name')
    .eq('id', clientId)
    .maybeSingle()
    .then(
      (r) => ({ value: r.data?.preferred_name ?? null, available: true }),
      () => ({ value: null, available: false })
    )
  return NextResponse.json({
    profile: { name: data.name, email: data.email, phone: data.phone, timezone: data.timezone, preferred_name: preferred.value },
    preferredNameAvailable: preferred.available,
  })
}

export async function PATCH(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const patch: Database['public']['Tables']['clients']['Update'] = { updated_at: new Date().toISOString() }

  if ('name' in body) {
    const name = String(body.name || '').trim().slice(0, 120)
    if (name.length < 2) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
    patch.name = name
  }
  if ('preferredName' in body) {
    const v = String(body.preferredName || '').trim().slice(0, 60)
    patch.preferred_name = v || null
  }
  if ('phone' in body) {
    const v = String(body.phone || '').trim().slice(0, 40)
    if (v && !/^[+\d][\d\s().-]{5,}$/.test(v)) return NextResponse.json({ error: 'That phone number does not look right.' }, { status: 400 })
    patch.phone = v || null
  }
  if ('timezone' in body) {
    const v = String(body.timezone || '').trim()
    if (v && !allTimeZones().includes(v)) return NextResponse.json({ error: 'Unknown timezone.' }, { status: 400 })
    patch.timezone = v || null
  }
  if (Object.keys(patch).length === 1) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('clients').update(patch).eq('id', clientId)
  if (error) {
    // Pre-061: preferred_name is not a column yet. Save the rest and say so.
    if ('preferred_name' in patch && /preferred_name/.test(error.message)) {
      delete patch.preferred_name
      const { error: e2 } = await supabase.from('clients').update(patch).eq('id', clientId)
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
      return NextResponse.json({ ok: true, warning: 'Your preferred name could not be saved yet — everything else was.' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
