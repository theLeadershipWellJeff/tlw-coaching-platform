import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { checkPortalRateLimit, logPortalAccess } from '@/lib/portal/access'
import { logPortalEvent } from '@/lib/portal/events'
import { cleanClientGoal, isClientEditable, MAX_GOALS } from '@/lib/portal/goals'
import type { CoachingGoal } from '@/lib/supabase/types'

export const runtime = 'nodejs'

/**
 * Portal goals write path (Phase 3). Writes to the same `clients.coaching_goals`
 * the coach edits, stamping `author: 'client'`. Metrics are required — that is
 * the "measure of success" the product promises. The client can only change or
 * remove goals they authored; coach-authored goals are read-only here. No AI
 * writes anything: "save as goal" from the chat lands in this editor first.
 */
async function loadGoals(clientId: string): Promise<CoachingGoal[]> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('clients').select('coaching_goals').eq('id', clientId).maybeSingle()
  return Array.isArray(data?.coaching_goals) ? (data!.coaching_goals as CoachingGoal[]) : []
}

async function saveGoals(clientId: string, goals: CoachingGoal[]): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('clients').update({ coaching_goals: goals }).eq('id', clientId)
  return !error
}

export async function GET() {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const goals = await loadGoals(clientId)
  return NextResponse.json({ goals: goals.map((g, index) => ({ ...g, index, editable: isClientEditable(g) })) })
}

/** Add a goal. Body: { title, description?, metrics: string[] (≥1) }. */
export async function POST(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limit = await checkPortalRateLimit(clientId, 'goal_write')
  if (!limit.allowed) return NextResponse.json({ error: 'Please slow down a little and try again shortly.' }, { status: 429 })
  const body = await req.json().catch(() => ({}))
  const cleaned = cleanClientGoal(body)
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const goals = await loadGoals(clientId)
  if (goals.length >= MAX_GOALS) return NextResponse.json({ error: `You can keep up to ${MAX_GOALS} goals — retire one first.` }, { status: 409 })
  const next = [...goals, cleaned.goal]
  if (!(await saveGoals(clientId, next))) return NextResponse.json({ error: 'Could not save the goal.' }, { status: 500 })
  await logPortalAccess(clientId, 'goal_write', { detail: 'create' })
  await logPortalEvent(clientId, 'goal_created', { title: cleaned.goal.title, source: body?.from === 'chat' ? 'chat' : 'editor' })
  await logPortalEvent(clientId, 'metric_defined', { title: cleaned.goal.title, count: cleaned.goal.metrics?.length ?? 0 })
  return NextResponse.json({ goals: next.map((g, index) => ({ ...g, index, editable: isClientEditable(g) })) }, { status: 201 })
}

/** Edit one of the client's OWN goals. Body: { index, title, description?, metrics }. */
export async function PATCH(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const index = Number(body?.index)
  const goals = await loadGoals(clientId)
  if (!Number.isInteger(index) || !isClientEditable(goals[index])) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const cleaned = cleanClientGoal(body)
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const next = goals.map((g, i) => (i === index ? cleaned.goal : g))
  if (!(await saveGoals(clientId, next))) return NextResponse.json({ error: 'Could not save the goal.' }, { status: 500 })
  await logPortalAccess(clientId, 'goal_write', { detail: `edit:${index}` })
  return NextResponse.json({ goals: next.map((g, i) => ({ ...g, index: i, editable: isClientEditable(g) })) })
}

/** Remove one of the client's OWN goals. Body: { index }. */
export async function DELETE(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const index = Number(body?.index)
  const goals = await loadGoals(clientId)
  if (!Number.isInteger(index) || !isClientEditable(goals[index])) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const next = goals.filter((_, i) => i !== index)
  if (!(await saveGoals(clientId, next))) return NextResponse.json({ error: 'Could not remove the goal.' }, { status: 500 })
  await logPortalAccess(clientId, 'goal_write', { detail: `delete:${index}` })
  return NextResponse.json({ goals: next.map((g, i) => ({ ...g, index: i, editable: isClientEditable(g) })) })
}
