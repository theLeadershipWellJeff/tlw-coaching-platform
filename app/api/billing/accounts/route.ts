import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import type { BillingAccountType } from '@/lib/billing/types'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
