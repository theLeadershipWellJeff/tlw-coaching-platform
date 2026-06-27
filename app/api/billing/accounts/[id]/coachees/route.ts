import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('billing_accounts')
    .select('id')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const client_id = body?.client_id as string | undefined
  if (!client_id) return NextResponse.json({ error: 'client_id is required' }, { status: 400 })

  // Verify coach has access to this client.
  const { data: link } = await supabase
    .from('coach_clients')
    .select('client_id')
    .eq('coach_id', coach.id)
    .eq('client_id', client_id)
    .maybeSingle()
  if (!link) return NextResponse.json({ error: 'client not found' }, { status: 400 })

  const { data, error } = await supabase
    .from('coachees')
    .insert({ coach_id: coach.id, client_id, billing_account_id: params.id })
    .select('*, clients ( id, name, email )')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'client already a coachee on this account' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ coachee: data }, { status: 201 })
}
