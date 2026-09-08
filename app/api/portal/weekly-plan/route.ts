import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { checkPortalRateLimit, logPortalAccess } from '@/lib/portal/access'
import { logPortalEvent } from '@/lib/portal/events'
import { addTask, isValidWeekStart, loadWeeklyPlans, removeTask, saveWeeklyPlan, setTaskDone, weekStartFor, MAX_WEEKLY_TASKS } from '@/lib/portal/weekly-plan'

export const runtime = 'nodejs'

/**
 * The client's weekly plans (migration 061). GET → this week's plan (if any),
 * the most recent plan, and the current week start in their zone. POST →
 * save/replace a week's task list (the client confirmed it in the chat).
 * PATCH → check a task off ({planId, taskId, done}), add a to-do to this
 * week ({add: text}), or remove one ({planId, remove: taskId}). All scoped
 * to the session client; the table missing just reads as "no plans".
 */
export async function GET() {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const { data: client } = await supabase.from('clients').select('timezone').eq('id', clientId).maybeSingle()
  const weekStart = weekStartFor(new Date(), client?.timezone)
  const plans = await loadWeeklyPlans(clientId, 4)
  const current = plans.find((p) => p.week_start === weekStart) || null
  return NextResponse.json({ weekStart, current, latest: plans[0] || null, plans, maxTasks: MAX_WEEKLY_TASKS })
}

export async function POST(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limit = await checkPortalRateLimit(clientId, 'weekly_plan_write')
  if (!limit.allowed) return NextResponse.json({ error: 'Please slow down a little and try again shortly.' }, { status: 429 })
  const body = await req.json().catch(() => ({}))
  const supabase = getSupabaseAdmin()
  const { data: client } = await supabase.from('clients').select('org_id, timezone').eq('id', clientId).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const weekStart = isValidWeekStart(body.weekStart) ? body.weekStart : weekStartFor(new Date(), client.timezone)
  let conversationId: string | null = null
  if (body.conversationId) {
    const { data: conv } = await supabase.from('portal_conversations').select('id').eq('id', String(body.conversationId)).eq('client_id', clientId).maybeSingle()
    conversationId = conv?.id || null
  }
  try {
    const plan = await saveWeeklyPlan(clientId, client.org_id, { weekStart, tasks: body.tasks, title: body.title ?? null, conversationId })
    await logPortalAccess(clientId, 'weekly_plan_write', { detail: plan.id })
    await logPortalEvent(clientId, 'weekly_plan_saved', { plan_id: plan.id, week_start: weekStart, task_count: plan.tasks.length, conversation_id: conversationId })
    return NextResponse.json({ plan })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not save the plan.'
    const status = /weekly_plans/.test(msg) ? 503 : /at least one/.test(msg) ? 400 : 500
    return NextResponse.json({ error: status === 503 ? 'Weekly plans are not available yet.' : msg }, { status })
  }
}

export async function PATCH(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const planId = String(body.planId || '')

  // Add a to-do to this week from the home card.
  if (typeof body.add === 'string') {
    const text = body.add.replace(/\s+/g, ' ').trim()
    if (!text) return NextResponse.json({ error: 'Write the to-do first.' }, { status: 400 })
    const limit = await checkPortalRateLimit(clientId, 'weekly_plan_write')
    if (!limit.allowed) return NextResponse.json({ error: 'Please slow down a little and try again shortly.' }, { status: 429 })
    const supabase = getSupabaseAdmin()
    const { data: client } = await supabase.from('clients').select('org_id, timezone').eq('id', clientId).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const weekStart = isValidWeekStart(body.weekStart) ? body.weekStart : weekStartFor(new Date(), client.timezone)
    try {
      const plan = await addTask(clientId, client.org_id, weekStart, text)
      if (!plan) return NextResponse.json({ error: `A week holds up to ${MAX_WEEKLY_TASKS} to-dos — finish or remove one first.` }, { status: 409 })
      await logPortalAccess(clientId, 'weekly_plan_write', { detail: `add:${plan.id}` })
      await logPortalEvent(clientId, 'weekly_plan_saved', { plan_id: plan.id, week_start: weekStart, task_count: plan.tasks.length, source: 'card' })
      return NextResponse.json({ plan })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not add the to-do.'
      return NextResponse.json({ error: /weekly_plans/.test(msg) ? 'Weekly plans are not available yet.' : msg }, { status: /weekly_plans/.test(msg) ? 503 : 500 })
    }
  }

  // Remove a to-do.
  if (typeof body.remove === 'string') {
    if (!planId) return NextResponse.json({ error: 'planId is required.' }, { status: 400 })
    const plan = await removeTask(clientId, planId, body.remove)
    if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await logPortalAccess(clientId, 'weekly_plan_write', { detail: `remove:${planId}` })
    return NextResponse.json({ plan })
  }

  const taskId = String(body.taskId || '')
  if (!planId || !taskId || typeof body.done !== 'boolean') return NextResponse.json({ error: 'planId, taskId and done are required.' }, { status: 400 })
  const plan = await setTaskDone(clientId, planId, taskId, body.done)
  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (body.done) await logPortalEvent(clientId, 'weekly_plan_task_done', { plan_id: planId, task_id: taskId })
  return NextResponse.json({ plan })
}
