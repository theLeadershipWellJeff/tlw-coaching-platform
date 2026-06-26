import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

async function requireAccount(supabase: ReturnType<typeof getSupabaseAdmin>, coachId: string, id: string) {
  const { data } = await supabase
    .from('billing_accounts')
    .select('*')
    .eq('id', id)
    .eq('coach_id', coachId)
    .maybeSingle()
  return data
}

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch account with its coachees + clients and engagements in one round.
  const { data: account, error } = await supabase
    .from('billing_accounts')
    .select(`
      *,
      coachees (
        *,
        clients ( id, name, email )
      ),
      engagements (
        *,
        coachees (
          *,
          clients ( id, name, email )
        )
      )
    `)
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ account })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await requireAccount(supabase, coach.id, params.id)
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const allowed = ['name', 'billing_email', 'stripe_customer_id'] as const
  const updates: Partial<{ name: string; billing_email: string; stripe_customer_id: string; updated_at: string }> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await supabase
    .from('billing_accounts')
    .update(updates)
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account: data })
}
