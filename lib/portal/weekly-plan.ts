/**
 * Plan your week (migration 061). A weekly-plan chat runs under the
 * `weekly_plan` brief (Jeff's goal-setting master prompt) and, when the client
 * chooses, its agreed Top 5 is extracted into a `weekly_plans` row that the
 * portal home card shows as a checklist. Nothing is saved without the client
 * confirming the list — the model proposes, the person decides.
 *
 * Every read/write here is scoped to the client id the caller authenticated.
 */
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { PortalChatMode, WeeklyPlan, WeeklyPlanTask } from '@/lib/supabase/types'
import type { ChatMsg } from './chat'

export const MAX_WEEKLY_TASKS = 7
const MODEL = process.env.PORTAL_CHAT_MODEL || 'claude-sonnet-4-6'

/** The Monday (YYYY-MM-DD) of the week containing `date` in the given zone. */
export function weekStartFor(date: Date = new Date(), timeZone?: string | null): string {
  let y: number, m: number, d: number, weekday: number
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(date)
    const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
    y = Number(get('year'))
    m = Number(get('month'))
    d = Number(get('day'))
    weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  } catch {
    y = date.getUTCFullYear()
    m = date.getUTCMonth() + 1
    d = date.getUTCDate()
    weekday = date.getUTCDay()
  }
  const back = (weekday + 6) % 7 // days since Monday
  const monday = new Date(Date.UTC(y, m - 1, d - back))
  return monday.toISOString().slice(0, 10)
}

/** "Week of Sep 7" style label for a week_start. */
export function weekLabel(weekStart: string): string {
  const d = new Date(weekStart + 'T12:00:00Z')
  return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
}

export function isValidWeekStart(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))
}

/** Normalise free text into tasks: trim, drop empties/dupes, cap the count. */
export function cleanTasks(input: unknown, existing: WeeklyPlanTask[] = []): WeeklyPlanTask[] {
  const raw = Array.isArray(input) ? input : []
  const seen = new Set<string>()
  const out: WeeklyPlanTask[] = []
  for (const item of raw) {
    const text = (typeof item === 'string' ? item : item && typeof item === 'object' && 'text' in item ? String((item as { text: unknown }).text || '') : '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    // Keep a matching existing task's id + done state so a re-save never
    // un-checks what the client already did.
    const prior = existing.find((t) => t.text.trim().toLowerCase() === key)
    const id = typeof item === 'object' && item && 'id' in item && typeof (item as { id: unknown }).id === 'string' ? (item as { id: string }).id : prior?.id || `t${out.length + 1}_${Math.random().toString(36).slice(2, 8)}`
    const done = typeof item === 'object' && item && 'done' in item ? !!(item as { done: unknown }).done : prior?.done || false
    out.push({ id, text, done, done_at: done ? prior?.done_at || new Date().toISOString() : null })
    if (out.length >= MAX_WEEKLY_TASKS) break
  }
  return out
}

/** Plans for the client, newest week first (defensive: no table → []). */
export async function loadWeeklyPlans(clientId: string, limit = 4): Promise<WeeklyPlan[]> {
  const supabase = getSupabaseAdmin()
  try {
    const { data, error } = await supabase
      .from('weekly_plans')
      .select('*')
      .eq('client_id', clientId)
      .order('week_start', { ascending: false })
      .limit(limit)
    if (error) return []
    return (data || []).map((p) => ({ ...p, tasks: Array.isArray(p.tasks) ? (p.tasks as WeeklyPlanTask[]) : [] })) as WeeklyPlan[]
  } catch {
    return []
  }
}

export async function saveWeeklyPlan(
  clientId: string,
  orgId: string,
  input: { weekStart: string; tasks: unknown; title?: string | null; conversationId?: string | null }
): Promise<WeeklyPlan> {
  const supabase = getSupabaseAdmin()
  const { data: current } = await supabase.from('weekly_plans').select('*').eq('client_id', clientId).eq('week_start', input.weekStart).maybeSingle()
  const tasks = cleanTasks(input.tasks, Array.isArray(current?.tasks) ? (current!.tasks as WeeklyPlanTask[]) : [])
  if (!tasks.length) throw new Error('Add at least one task.')
  const row = {
    client_id: clientId,
    org_id: orgId,
    week_start: input.weekStart,
    title: input.title?.trim().slice(0, 120) || null,
    tasks,
    conversation_id: input.conversationId || current?.conversation_id || null,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('weekly_plans')
    .upsert(row as never, { onConflict: 'client_id,week_start' })
    .select('*')
    .single()
  if (error || !data) throw new Error(error?.message || 'Could not save the plan.')
  return { ...data, tasks: data.tasks as WeeklyPlanTask[] } as WeeklyPlan
}

/** Flip one task; the update is filtered on client_id so another client's plan can never be touched. */
export async function setTaskDone(clientId: string, planId: string, taskId: string, done: boolean): Promise<WeeklyPlan | null> {
  const supabase = getSupabaseAdmin()
  const { data: plan } = await supabase.from('weekly_plans').select('*').eq('id', planId).eq('client_id', clientId).maybeSingle()
  if (!plan) return null
  const tasks = (Array.isArray(plan.tasks) ? (plan.tasks as WeeklyPlanTask[]) : []).map((t) =>
    t.id === taskId ? { ...t, done, done_at: done ? new Date().toISOString() : null } : t
  )
  const { data, error } = await supabase
    .from('weekly_plans')
    .update({ tasks, updated_at: new Date().toISOString() })
    .eq('id', planId)
    .eq('client_id', clientId)
    .select('*')
    .maybeSingle()
  if (error || !data) return null
  return { ...data, tasks: data.tasks as WeeklyPlanTask[] } as WeeklyPlan
}

/** Compact text of recent plans for the weekly-plan prompt. */
export function formatPlansForPrompt(plans: WeeklyPlan[]): string {
  if (!plans.length) return ''
  return plans
    .map((p) => {
      const lines = p.tasks.map((t) => `  ${t.done ? '[x]' : '[ ]'} ${t.text}`)
      const done = p.tasks.filter((t) => t.done).length
      return `${weekLabel(p.week_start)} (${done}/${p.tasks.length} done):\n${lines.join('\n')}`
    })
    .join('\n\n')
}

/**
 * Ask the model for the Top 5 the conversation agreed on, as JSON. Returns
 * strings only — the client reviews and edits before anything is saved.
 */
export async function extractTasksFromConversation(messages: ChatMsg[]): Promise<{ title: string | null; tasks: string[] }> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured.')
  const transcript = messages
    .slice(-30)
    .map((m) => `${m.role === 'user' ? 'CLIENT' : 'COACH'}: ${m.content}`)
    .join('\n\n')
    .slice(-40000)
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await client.messages.create(
    {
      model: MODEL,
      max_tokens: 800,
      system:
        'You read a planning conversation and return ONLY a JSON object: {"title": string|null, "tasks": string[]}. "tasks" = the concrete actions for the week the CLIENT agreed to or chose (at most 7, ideally 5), each a short imperative sentence in the client\'s own terms, ordered by the priority the conversation gave them. Prefer what the client confirmed over what the coach merely suggested; if nothing was confirmed, take the most recent proposed list. "title" = a 3–8 word theme for the week if one was named, else null. No prose, no markdown, no code fence.',
      messages: [{ role: 'user', content: `CONVERSATION:\n\n${transcript}\n\nReturn the JSON now.` }],
    },
    { timeout: 60_000, maxRetries: 1 }
  )
  const text = res.content.find((b) => b.type === 'text')
  const raw = text && 'text' in text ? text.text.trim() : ''
  const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  let parsed: { title?: unknown; tasks?: unknown } = {}
  try {
    parsed = JSON.parse(json)
  } catch {
    const m = json.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        parsed = JSON.parse(m[0])
      } catch {
        /* fall through */
      }
    }
  }
  const tasks = cleanTasks(parsed.tasks).map((t) => t.text)
  const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 120) : null
  return { title, tasks }
}

export function isChatMode(v: unknown): v is PortalChatMode {
  return v === 'general' || v === 'weekly_plan'
}
