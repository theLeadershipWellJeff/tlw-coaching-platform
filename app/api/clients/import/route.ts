import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach } from '@/lib/api-handler'
import { linkCoachToClient } from '@/lib/client-access'
import type { Database } from '@/lib/supabase/types'

const CA_URL = 'https://www.coachaccountable.com/API/'
const CA_ID = process.env.COACH_ACCOUNTABLE_API_ID!
const CA_KEY = process.env.COACH_ACCOUNTABLE_API_KEY!

async function caPost(action: string, params: Record<string, string> = {}) {
  const body = new URLSearchParams({ a: action, APIID: CA_ID, APIKey: CA_KEY, ...params })
  const res = await fetch(CA_URL, { method: 'POST', body })
  const json = await res.json()
  if (json.error !== 0) throw new Error(json.message)
  return json.return
}

interface CaClient {
  ID: number | string
  firstName?: string
  lastName?: string
  email?: string
}

type ClientInsert = Database['public']['Tables']['clients']['Insert']

// Pull the Coach Accountable roster into Supabase. Idempotent: clients already
// imported (matched by ca_client_id) are skipped, so it's safe to re-run.
export async function POST(_req: NextRequest) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await requireCoach(supabase).catch(() => null)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!CA_ID || !CA_KEY) {
    return NextResponse.json(
      { error: 'Coach Accountable is not configured (COACH_ACCOUNTABLE_API_ID / _API_KEY).' },
      { status: 400 }
    )
  }

  let caClients: CaClient[]
  try {
    caClients = (await caPost('Client.getAll')) || []
  } catch (e: any) {
    return NextResponse.json({ error: `Coach Accountable: ${e.message}` }, { status: 502 })
  }

  // Which CA clients are already in Supabase?
  const { data: existing, error: readErr } = await supabase
    .from('clients')
    .select('ca_client_id')
    .not('ca_client_id', 'is', null)
  if (readErr) {
    return NextResponse.json({ error: `Supabase: ${readErr.message}` }, { status: 500 })
  }

  const seen = new Set((existing || []).map((c) => String(c.ca_client_id)))

  const toInsert: ClientInsert[] = []
  for (const c of caClients) {
    const caId = String(c.ID)
    if (seen.has(caId)) continue
    const name = `${c.firstName || ''} ${c.lastName || ''}`.trim()
    if (!name) continue
    toInsert.push({
      name,
      email: c.email?.trim() || null,
      status: 'active',
      ca_client_id: caId,
      tags: [],
    })
  }

  let imported = 0
  if (toInsert.length > 0) {
    const { data: inserted, error: insErr } = await supabase
      .from('clients')
      .insert(toInsert)
      .select('id')
    if (insErr) return NextResponse.json({ error: `Supabase: ${insErr.message}` }, { status: 500 })
    imported = inserted?.length ?? toInsert.length
    // Link each newly imported client to the importing coach.
    for (const row of inserted ?? []) {
      await linkCoachToClient(supabase, coach.id, row.id, 'primary')
    }
  }

  return NextResponse.json({
    imported,
    skipped: caClients.length - toInsert.length,
    total: caClients.length,
  })
}
