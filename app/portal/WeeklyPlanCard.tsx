'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { InfoPopover } from './InfoPopover'

type Task = { id: string; text: string; done: boolean; done_at: string | null }
type Plan = { id: string; week_start: string; title: string | null; tasks: Task[]; conversation_id: string | null; updated_at: string }
type Data = { weekStart: string; current: Plan | null; latest: Plan | null }

function weekLabel(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00Z')
  return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
}

/**
 * "This week" — the Top 5 the client saved from a Plan-your-week chat, as a
 * checklist. Checking a task saves at once. With no plan for the current week
 * the card shows the most recent one (labelled) and a nudge to plan this week.
 */
export function WeeklyPlanCard() {
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/portal/weekly-plan')
      setData(res.ok ? await res.json() : { weekStart: '', current: null, latest: null })
    } catch {
      setData({ weekStart: '', current: null, latest: null })
    }
  }
  useEffect(() => {
    load()
  }, [])

  const plan = data?.current || data?.latest || null
  const isCurrent = !!data?.current

  async function toggle(task: Task) {
    if (!plan) return
    setBusy(task.id)
    // Optimistic flip; the server copy replaces it on return.
    setData((d) => d && { ...d, [isCurrent ? 'current' : 'latest']: { ...plan, tasks: plan.tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)) } })
    try {
      const res = await fetch('/api/portal/weekly-plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, taskId: task.id, done: !task.done }),
      })
      if (!res.ok) await load()
      else {
        const d = await res.json()
        setData((cur) => cur && { ...cur, [isCurrent ? 'current' : 'latest']: d.plan })
      }
    } catch {
      await load()
    } finally {
      setBusy(null)
    }
  }

  const done = plan ? plan.tasks.filter((t) => t.done).length : 0

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">
          This week
          {plan && <span className="ml-2 text-[11px] font-normal normal-case tracking-normal text-tlw-warm-gray">{weekLabel(plan.week_start)}{!isCurrent && ' · your most recent plan'}</span>}
        </h2>
        <InfoPopover
          label="This week"
          text="The Top 5 you agreed on in Plan your week. Check things off as you go; the assistant sees what got done when you plan the next week."
        />
      </div>
      <div className="mt-3">
        {data === null ? (
          <p className="text-[13px] text-tlw-warm-gray">Loading…</p>
        ) : !plan ? (
          <p className="text-[13px] text-tlw-warm-gray">No plan yet. A short conversation gives you five things that make this week a success.</p>
        ) : (
          <>
            {plan.title && <p className="text-[14px] font-medium text-tlw-navy-deep">{plan.title}</p>}
            <ul className="mt-1 space-y-1.5">
              {plan.tasks.map((t) => (
                <li key={t.id}>
                  <label className="flex cursor-pointer items-start gap-2.5 text-[14px] text-tlw-espresso">
                    <input type="checkbox" checked={t.done} disabled={busy === t.id} onChange={() => toggle(t)} className="mt-1 h-4 w-4 accent-tlw-signal-orange" />
                    <span className={t.done ? 'text-tlw-warm-gray line-through' : ''}>{t.text}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-tlw-warm-gray">{done} of {plan.tasks.length} done</p>
          </>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/portal/chat?mode=week" className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich">
            {plan && isCurrent ? 'Revisit this week' : 'Plan your week'}
          </Link>
          {plan?.conversation_id && (
            <Link href={`/portal/chat?c=${plan.conversation_id}`} className="rounded-tlw-lg border border-tlw-warm-gray/25 px-4 py-2 text-[13px] font-medium text-tlw-navy-rich transition-colors hover:bg-tlw-canvas">
              Open the conversation
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
