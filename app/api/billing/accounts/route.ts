import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import type { BillingAccountType } from '@/lib/billing/types'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const withSummary = req.nextUrl.searchParams.get('withSummary') === '1'

  if (withSummary) {
    // Return accounts with coachee + active-engagement counts for the cards view.
    const { data, error } = await supabase
      .from('billing_accounts')
      .select(`
        id, name, type,
        coachees ( id ),
        engagements ( id, status )
      `)
      .eq('coach_id', coach.id)
      .order('name', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const accounts = (data ?? []).map((acct: any) => ({
      id: acct.id,
      name: acct.name,
      type: acct.type,
      coacheeCount: (acct.coachees ?? []).length,
      activeEngagements: (acct.engagements ?? []).filter((e: any) => e.status === 'active').length,
    }))

    return NextResponse.json({ accounts })
  }

  const { data, error } = await supabase
    .from('billing_accounts')
    .select('*')
    .eq('coach_id', coach.id)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ accounts: data })
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { name, type, billing_email } = body as {
    name?: string
    type?: BillingAccountType
    billing_email?: string
  }

  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!type || !['solo', 'enterprise'].includes(type))
    return NextResponse.json({ error: 'type must be solo or enterprise' }, { status: 400 })
  if (!billing_email?.trim())
    return NextResponse.json({ error: 'billing_email is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('billing_accounts')
    .insert({ coach_id: coach.id, name: name.trim(), type, billing_email: billing_email.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account: data }, { status: 201 })
}
