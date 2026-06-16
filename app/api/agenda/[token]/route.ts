import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { AGENDA_PROMPTS } from '@/lib/agenda'

export const runtime = 'nodejs'

// Public (token = credential): load an agenda request so the client can fill it.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const { data: reqRow } = await supabase
    .from('agenda_requests')
    .select('client_id, status, items')
    .eq('token', params.token)
    .maybeSingle()
  if (!reqRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: client } = await supabase.from('clients').select('name').eq('id', reqRow.client_id).maybeSingle()
  const firstName = (client?.name || '').split(' ')[0] || 'there'

  return NextResponse.json({
    clientFirstName: firstName,
    status: reqRow.status,
    prompts: AGENDA_PROMPTS,
    items: reqRow.items || [],
  })
}

// Public: submit the client's agenda answers. Body: { answers: string[] }
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const { data: reqRow } = await supabase
    .from('agenda_requests')
    .select('id')
    .eq('token', params.token)
    .maybeSingle()
  if (!reqRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const answers: string[] = Array.isArray(body.answers) ? body.answers : []
  const items = AGENDA_PROMPTS.map((q, i) => ({ q, a: String(answers[i] || '').trim() })).filter((x) => x.a)
  if (items.length === 0) return NextResponse.json({ error: 'Please answer at least one prompt.' }, { status: 400 })

  const { error } = await supabase
    .from('agenda_requests')
    .update({ items, status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', reqRow.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
