import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireSupervisor, toErrorResponse } from '@/lib/api-handler'
import { logAdminAction } from '@/lib/admin/audit'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

// Supervisor-only: editing a coach's role is privilege management and deleting
// a coach is destructive — neither may be reachable by an ordinary coach
// (ISOLATION_AUDIT Decision #2).

const PLANS = ['beta', 'free', 'paying'] as const

export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  let actor
  try {
    actor = await requireSupervisor(supabase)
  } catch (e) {
    return toErrorResponse(e)
  }

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
  if (body.role === 'coach' || body.role === 'supervisor') updates.role = body.role
  // Command Center plan label (migration 057). Hand-set; the coach-subscription
  // webhook also moves it, but the supervisor's choice always sticks until the
  // next subscription event.
  if (PLANS.includes(body.plan)) updates.plan = body.plan
  if (typeof body.plan_note === 'string') updates.plan_note = body.plan_note.trim() || null

  // Audit plan changes with the old value — read it before writing.
  let oldPlan: string | null = null
  if (updates.plan !== undefined) {
    const { data: before } = await supabase
      .from('coaches')
      .select('plan')
      .eq('id', params.id)
      .maybeSingle()
    oldPlan = (before as any)?.plan ?? null
  }

  const { data, error } = await supabase
    .from('coaches')
    .update(updates as any)
    .eq('id', params.id)
    .select('id, name, email, role, created_at, timezone, plan, plan_note, subscription_status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (updates.plan !== undefined && updates.plan !== oldPlan) {
    await logAdminAction(supabase, {
      actorCoachId: actor.id,
      action: 'plan_change',
      targetCoachId: params.id,
      detail: { from: oldPlan, to: updates.plan },
    })
  }

  return NextResponse.json({ coach: data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  let coach
  try {
    coach = await requireSupervisor(supabase)
  } catch (e) {
    return toErrorResponse(e)
  }

  // Prevent deleting yourself.
  if (params.id === coach.id)
    return NextResponse.json({ error: 'Cannot remove your own account' }, { status: 400 })

  // Capture identity for the audit row before the FK goes away.
  const { data: target } = await supabase
    .from('coaches')
    .select('email, name')
    .eq('id', params.id)
    .maybeSingle()

  const { error } = await supabase
    .from('coaches')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction(supabase, {
    actorCoachId: coach.id,
    action: 'coach_removed',
    detail: { email: (target as any)?.email ?? null, name: (target as any)?.name ?? null },
  })

  return NextResponse.json({ deleted: true })
}
