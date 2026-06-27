import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('coaches')
    .select('id, name, email, role, created_at, timezone')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Augment each coach with client count and account count.
  const coachIds = (data ?? []).map((c: any) => c.id)

  const [clientCounts, accountCounts] = await Promise.all([
    supabase
      .from('coach_clients')
      .select('coach_id')
      .in('coach_id', coachIds),
    supabase
      .from('billing_accounts' as any)
      .select('coach_id, status')
      .in('coach_id', coachIds),
  ])

  const clientsByCoach: Record<string, number> = {}
  for (const row of (clientCounts.data ?? []) as any[]) {
    clientsByCoach[row.coach_id] = (clientsByCoach[row.coach_id] ?? 0) + 1
  }

  const accountsByCoach: Record<string, number> = {}
  for (const row of (accountCounts.data ?? []) as any[]) {
    if (row.status === 'active') {
      accountsByCoach[row.coach_id] = (accountsByCoach[row.coach_id] ?? 0) + 1
    }
  }

  const coaches = (data ?? []).map((c: any) => ({
    ...c,
    client_count: clientsByCoach[c.id] ?? 0,
    account_count: accountsByCoach[c.id] ?? 0,
    is_me: c.id === coach.id,
  }))

  return NextResponse.json({ coaches })
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const name = (body?.name as string | undefined)?.trim()
  const email = (body?.email as string | undefined)?.trim().toLowerCase()
  const role = body?.role === 'supervisor' ? 'supervisor' : 'coach'

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: 'valid email is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('coaches')
    .insert({ name, email, role, timezone: '' } as any)
    .select('id, name, email, role, created_at, timezone')
    .single()

  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: 'A coach with that email already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ coach: data }, { status: 201 })
}
