import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
  if (body.role === 'coach' || body.role === 'supervisor') updates.role = body.role

  const { data, error } = await supabase
    .from('coaches')
    .update(updates as any)
    .eq('id', params.id)
    .select('id, name, email, role, created_at, timezone')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ coach: data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Prevent deleting yourself.
  if (params.id === coach.id)
    return NextResponse.json({ error: 'Cannot remove your own account' }, { status: 400 })

  const { error } = await supabase
    .from('coaches')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
