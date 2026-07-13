import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { coachCanAccessClient } from '@/lib/client-access'
import type { BillingAccountType } from '@/lib/billing/types'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const withSummary = req.nextUrl.searchParams.get('withSummary') === '1'
  const statusParam = req.nextUrl.searchParams.get('status') ?? 'active'

  if (withSummary) {
    // Return accounts with coachee + active-engagement counts for the cards view.
    let query = supabase
      .from('billing_accounts')
      .select(`
        id, name, type, billing_email, status,
        coachees ( id ),
        engagements ( id, status )
      `)
      .eq('coach_id', coach.id)
      .order('name', { ascending: true })

    if (statusParam !== 'all') {
      query = (query as any).eq('status', statusParam)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const accounts = (data ?? []).map((acct: any) => ({
      id: acct.id,
      name: acct.name,
      type: acct.type,
      billing_email: acct.billing_email,
      status: acct.status,
      coacheeCount: (acct.coachees ?? []).length,
      activeEngagements: (acct.engagements ?? []).filter((e: any) => e.status === 'active').length,
    }))

    return NextResponse.json({ accounts })
  }

  let query = supabase
    .from('billing_accounts')
    .select('*')
    .eq('coach_id', coach.id)
    .order('name', { ascending: true })

  if (statusParam !== 'all') {
    query = (query as any).eq('status', statusParam)
  }

  const { data, error } = await (query as any)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ?clientId=<uuid> — resolve the client's billing account (via coachees) so
  // the Create-invoice modal can preselect it; falls back to the client's
  // name/email for a one-off prefill when they have no billing account yet.
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (clientId && await coachCanAccessClient(supabase, coach.id, clientId)) {
    const [{ data: coachee }, { data: client }] = await Promise.all([
      supabase
        .from('coachees')
        .select('billing_account_id, created_at')
        .eq('coach_id', coach.id)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('clients')
        .select('id, name, email')
        .eq('id', clientId)
        .maybeSingle(),
    ])
    return NextResponse.json({
      accounts: data,
      clientMatch: {
        accountId: (coachee as any)?.billing_account_id ?? null,
        name: (client as any)?.name ?? null,
        email: (client as any)?.email ?? null,
      },
    })
  }

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
