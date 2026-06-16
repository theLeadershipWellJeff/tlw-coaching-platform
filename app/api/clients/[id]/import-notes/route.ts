import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const CA_URL = 'https://www.coachaccountable.com/API/'
const CA_ID = process.env.COACH_ACCOUNTABLE_API_ID!
const CA_KEY = process.env.COACH_ACCOUNTABLE_API_KEY!

async function caPost(action: string, paramObj: Record<string, string> = {}) {
  const body = new URLSearchParams({ a: action, APIID: CA_ID, APIKey: CA_KEY, ...paramObj })
  const res = await fetch(CA_URL, { method: 'POST', body })
  const json = await res.json()
  if (json.error !== 0) throw new Error(json.message)
  return json.return
}

function safeDate(v: unknown): string {
  const s = String(v || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date().toISOString().slice(0, 10)
}

type NoteInsert = Database['public']['Tables']['notes']['Insert']

/**
 * Port this client's Coach Accountable session notes into the in-app notes
 * table. Idempotent: notes already imported (matched by ca_session_id) are
 * skipped, so it's safe to re-run. Called per client by the roster's bulk
 * "import notes" action so each request stays well within limits.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CA_ID || !CA_KEY) {
    return NextResponse.json(
      { error: 'Coach Accountable is not configured (COACH_ACCOUNTABLE_API_ID / _API_KEY).' },
      { status: 400 }
    )
  }

  const supabase = getSupabaseAdmin()

  const { data: client, error: cErr } = await supabase
    .from('clients')
    .select('id, ca_client_id')
    .eq('id', params.id)
    .maybeSingle()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  // Manually-added clients aren't linked to CA — nothing to import.
  if (!client.ca_client_id) return NextResponse.json({ imported: 0, skipped: 0, reason: 'no_ca_link' })

  let raw: any[]
  try {
    raw = (await caPost('Session.getAll', { ClientID: client.ca_client_id, dateFrom: '2010-01-01' })) || []
  } catch (e: any) {
    return NextResponse.json({ error: `Coach Accountable: ${e.message}` }, { status: 502 })
  }

  const sessions = raw.filter((n) => n && n.ID != null)

  const { data: existing } = await supabase
    .from('notes')
    .select('ca_session_id')
    .eq('client_id', client.id)
    .not('ca_session_id', 'is', null)
  const seen = new Set((existing || []).map((e) => String(e.ca_session_id)))

  const toInsert: NoteInsert[] = []
  for (const n of sessions) {
    const caId = String(n.ID)
    if (seen.has(caId)) continue
    toInsert.push({
      client_id: client.id,
      session_date: safeDate(n.dateOf),
      title: n.title?.trim() || null,
      content: typeof n.content === 'string' ? n.content : '',
      duration_minutes: 60,
      ca_session_id: caId,
    })
  }

  let imported = 0
  if (toInsert.length > 0) {
    const { error, count } = await supabase.from('notes').insert(toInsert, { count: 'exact' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    imported = count ?? toInsert.length
  }

  return NextResponse.json({ imported, skipped: sessions.length - toInsert.length })
}
