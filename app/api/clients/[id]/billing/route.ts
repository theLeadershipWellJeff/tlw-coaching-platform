/**
 * GET  /api/clients/[id]/billing
 *   Returns the coachee link, billing account, and engagements for this client.
 *
 * POST /api/clients/[id]/billing/link
 *   Body: { accountId }
 *   Links this client to an existing billing account (creates a coachees row).
 *
 * POST /api/clients/[id]/billing/create-account
 *   Body: { name, type, billing_email }
 *   Creates a new billing account AND links this client to it as a coachee.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { coachCanAccessClient } from '@/lib/client-access'
import type { BillingAccountType } from '@/lib/billing/types'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await coachCanAccessClient(supabase, coach.id, params.id)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Find coachee row(s) for this client + coach.
  const { data: coachees } = await supabase
    .from('coachees')
    .select(`
      id,
      billing_account_id,
      billing_accounts ( id, name, type, billing_email, stripe_customer_id )
    `)
    .eq('client_id', params.id)
    .eq('coach_id', coach.id)

  if (!coachees || coachees.length === 0) {
    // Return available accounts so the UI can offer a link flow.
    const { data: accounts } = await supabase
      .from('billing_accounts')
      .select('id, name, type, billing_email')
      .eq('coach_id', coach.id)
      .order('name', { ascending: true })
    return NextResponse.json({ linked: false, accounts: accounts ?? [] })
  }

  const coachee = coachees[0] as any
  const account = coachee.billing_accounts

  // Load engagements for this coachee. select('*') so the edit-client modal's
  // engagement section gets session_count/length_months too (and a not-yet-
  // applied migration 036 can't break the query).
  const { data: engagements } = await supabase
    .from('engagements')
    .select('*')
    .eq('coachee_id', coachee.id)
    .eq('coach_id', coach.id)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    linked: true,
    coacheeId: coachee.id,
    account,
    engagements: engagements ?? [],
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await coachCanAccessClient(supabase, coach.id, params.id)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    action?: 'link' | 'create-account'
    accountId?: string
    name?: string
    type?: string
    billing_email?: string
  }

  if (body.action === 'link') {
    // Link this client to an existing billing account.
    if (!body.accountId) return NextResponse.json({ error: 'accountId is required' }, { status: 400 })

    // Verify the account belongs to this coach.
    const { data: account } = await supabase
      .from('billing_accounts')
      .select('id, name, type, billing_email')
      .eq('id', body.accountId)
      .eq('coach_id', coach.id)
      .maybeSingle()
    if (!account) return NextResponse.json({ error: 'Billing account not found' }, { status: 404 })

    const { data: coachee, error } = await supabase
      .from('coachees')
      .insert({ coach_id: coach.id, client_id: params.id, billing_account_id: body.accountId })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Client is already linked to a billing account' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ coacheeId: coachee.id, account })

  } else if (body.action === 'create-account') {
    // Create a new billing account and immediately link this client.
    if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
    if (!body.billing_email?.trim()) return NextResponse.json({ error: 'billing_email is required' }, { status: 400 })
    const type: BillingAccountType = body.type === 'enterprise' ? 'enterprise' : 'solo'

    const { data: account, error: accErr } = await supabase
      .from('billing_accounts')
      .insert({ coach_id: coach.id, name: body.name.trim(), type, billing_email: body.billing_email.trim() })
      .select()
      .single()
    if (accErr || !account) return NextResponse.json({ error: accErr?.message ?? 'Failed to create account' }, { status: 500 })

    const { data: coachee, error: coacheeErr } = await supabase
      .from('coachees')
      .insert({ coach_id: coach.id, client_id: params.id, billing_account_id: account.id })
      .select()
      .single()
    if (coacheeErr) return NextResponse.json({ error: coacheeErr.message }, { status: 500 })

    return NextResponse.json({ coacheeId: coachee.id, account }, { status: 201 })

  } else {
    return NextResponse.json({ error: 'action must be link or create-account' }, { status: 400 })
  }
}
