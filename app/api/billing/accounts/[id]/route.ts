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
  const allowed = ['name', 'billing_email', 'billing_cc', 'stripe_customer_id', 'status', 'closed_at'] as const
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (updates.status && !['active', 'closed'].includes(updates.status as string))
    return NextResponse.json({ error: 'status must be active or closed' }, { status: 400 })

  const { data, error } = await supabase
    .from('billing_accounts')
    .update(updates as any)
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account: data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await requireAccount(supabase, coach.id, params.id)
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Cascade delete: invoice_lines → invoices → engagements → coachees → account

  // 1. Get all invoice IDs for this account
  const { data: invoiceRows } = await supabase
    .from('invoices')
    .select('id')
    .eq('billing_account_id', params.id)
    .eq('coach_id', coach.id)

  const invoiceIds = (invoiceRows ?? []).map((r: any) => r.id)

  // 2. Delete invoice lines
  if (invoiceIds.length > 0) {
    await supabase.from('invoice_lines').delete().in('invoice_id', invoiceIds)
  }

  // 3. Delete invoices
  await supabase.from('invoices').delete().eq('billing_account_id', params.id).eq('coach_id', coach.id)

  // 4. Delete engagements
  await supabase.from('engagements').delete().eq('billing_account_id', params.id).eq('coach_id', coach.id)

  // 5. Delete coachees
  await supabase.from('coachees').delete().eq('billing_account_id', params.id).eq('coach_id', coach.id)

  // 6. Delete the account itself
  const { error } = await supabase
    .from('billing_accounts')
    .delete()
    .eq('id', params.id)
    .eq('coach_id', coach.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
