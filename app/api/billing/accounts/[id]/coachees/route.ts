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

  const reassign = body?.reassign === true

  // Check if a coachee row already exists for this client+coach (unique constraint).
  const { data: existing } = await supabase
    .from('coachees')
    .select('id, billing_account_id')
    .eq('coach_id', coach.id)
    .eq('client_id', client_id)
    .maybeSingle()

  if (existing) {
    if (existing.billing_account_id === params.id) {
      // Already on this account — fetch and return it.
      const { data } = await supabase
        .from('coachees')
        .select('*, clients ( id, name, email )')
        .eq('id', existing.id)
        .single()
      return NextResponse.json({ coachee: data, reassigned: false })
    }
    if (!reassign) {
      return NextResponse.json({
        error: 'client is already a coachee on another billing account',
        canReassign: true,
      }, { status: 409 })
    }
    // Move the coachee row to this account.
    const { data, error } = await supabase
      .from('coachees')
      .update({ billing_account_id: params.id })
      .eq('id', existing.id)
      .select('*, clients ( id, name, email )')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Move their engagements too, so billing runs group them under the new
    // account (an engagement left pointing at the old account would bill the
    // client individually instead of rolling up).
    const { error: engErr } = await supabase
      .from('engagements')
      .update({ billing_account_id: params.id })
      .eq('coachee_id', existing.id)
      .eq('coach_id', coach.id)
    if (engErr) return NextResponse.json({ error: `coachee moved but engagements failed to follow: ${engErr.message}` }, { status: 500 })

    return NextResponse.json({ coachee: data, reassigned: true })
  }

  const { data, error } = await supabase
    .from('coachees')
    .insert({ coach_id: coach.id, client_id, billing_account_id: params.id })
    .select('*, clients ( id, name, email )')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ coachee: data }, { status: 201 })
}
