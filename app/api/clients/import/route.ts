import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
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
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const supabase = getSupabaseAdmin()

  // Which CA clients are already in Supabase?
  const { data: existing, error: readErr } = await supabase
    .from('clients')
    .select('ca_client_id')
    .not('ca_client_id', 'is', null)
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })

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
    const { error: insErr, count } = await supabase
      .from('clients')
      .insert(toInsert, { count: 'exact' })
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    imported = count ?? toInsert.length
  }

  return NextResponse.json({
    imported,
    skipped: caClients.length - toInsert.length,
    total: caClients.length,
  })
}
