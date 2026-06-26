import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import type { BillingMode, BillingOwner, EngagementStatus, InstallmentScheduleEntry } from '@/lib/billing/types'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify account belongs to this coach.
  const { data: account } = await supabase
    .from('billing_accounts')
    .select('id')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('engagements')
    .select(`*, coachees ( *, clients ( id, name, email ) )`)
    .eq('billing_account_id', params.id)
    .eq('coach_id', coach.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ engagements: data })
}

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

  const body = await req.json().catch(() => ({})) as {
    coachee_id?: string
    billing_mode?: BillingMode
    billing_owner?: BillingOwner
    status?: EngagementStatus
    rate_hourly?: number
    monthly_amount?: number
    billing_day?: number
    engagement_total?: number
    installment_count?: number
    installment_schedule?: InstallmentScheduleEntry[]
    description_template?: string
  }

  if (!body.coachee_id) return NextResponse.json({ error: 'coachee_id is required' }, { status: 400 })
  if (!body.billing_mode || !['arrears','subscription','per_engagement'].includes(body.billing_mode))
    return NextResponse.json({ error: 'billing_mode must be arrears, subscription, or per_engagement' }, { status: 400 })

  // Validate that the coachee belongs to this coach + account.
  const { data: coachee } = await supabase
    .from('coachees')
    .select('id')
    .eq('id', body.coachee_id)
    .eq('coach_id', coach.id)
    .eq('billing_account_id', params.id)
    .maybeSingle()
  if (!coachee) return NextResponse.json({ error: 'coachee not found on this account' }, { status: 400 })

  // Mode-specific required fields.
  if (body.billing_mode === 'arrears' && !body.rate_hourly)
    return NextResponse.json({ error: 'rate_hourly is required for arrears mode' }, { status: 400 })
  if (body.billing_mode === 'subscription' && (!body.monthly_amount || !body.billing_day))
    return NextResponse.json({ error: 'monthly_amount and billing_day are required for subscription mode' }, { status: 400 })
  if (body.billing_mode === 'per_engagement' && !body.engagement_total)
    return NextResponse.json({ error: 'engagement_total is required for per_engagement mode' }, { status: 400 })

  const { data, error } = await supabase
    .from('engagements')
    .insert({
      coach_id: coach.id,
      billing_account_id: params.id,
      coachee_id: body.coachee_id,
      billing_mode: body.billing_mode,
      billing_owner: body.billing_owner ?? 'TLW',
      status: body.status ?? 'active',
      rate_hourly: body.rate_hourly ?? null,
      monthly_amount: body.monthly_amount ?? null,
      billing_day: body.billing_day ?? null,
      engagement_total: body.engagement_total ?? null,
      installment_count: body.installment_count ?? null,
      installment_schedule: body.installment_schedule ?? null,
      description_template: body.description_template ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ engagement: data }, { status: 201 })
}
