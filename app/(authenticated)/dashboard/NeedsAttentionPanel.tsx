'use client'
/**
 * "Needs your attention" — the coach attention queue (migration 067), the
 * durable surface for coach_tasks. Mounted at the top of the dashboard, above
 * the arrangeable board, so it is never an opt-in card: if the digest cron
 * dies, the coach still sees the queue here. When the queue is empty it
 * collapses to one quiet line.
 *
 * Rows are grouped by client, newest session first. Actions:
 *   write_note → find-or-create the session's note and open the editor
 *   send_note  → open that note (Phase 3 wires the send flow onto it)
 *   File       → a note exists and stays internal        (confirm step)
 *   Dismiss    → no note is needed for this session      (confirm step)
 * Mobile-first: rows stack full-width, actions are full-width buttons in a
 * thumb-reachable row, nothing depends on hover. Coach-internal only.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatWhenShort } from '@/lib/datetime'

interface QueueTask {
  id: string
  task_type: string
  due_at: string
  client: { id: string; name: string } | null
  appointment: { id: string; scheduled_at: string; duration_minutes: number } | null
  note: { id: string; title: string | null } | null
}

const TYPE_LABEL: Record<string, string> = {
  write_note: 'Write session note',
  send_note: 'Send session note',
}

type Confirm = { id: string; action: 'file' | 'dismiss' }

export function NeedsAttentionPanel({ timeZone: initialTz }: { timeZone: string }) {
  const router = useRouter()
  const [tasks, setTasks] = useState<QueueTask[]>([])
  const [timeZone, setTimeZone] = useState(initialTz)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load the queue.')
      setTasks(data.tasks || [])
      if (data.timeZone) setTimeZone(data.timeZone)
      setUnavailable(!!data.unavailable)
      setError('')
    } catch (e: any) {
      setError(e.message || 'Could not load the queue.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function resolve(id: string, action: 'file' | 'dismiss') {
    setBusy(id)
    setConfirm(null)
    setRowError((m) => ({ ...m, [id]: '' }))
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 409) throw new Error(data.error || 'Could not resolve the task.')
      // 409 = already resolved elsewhere — either way the row is gone.
      setTasks((cur) => cur.filter((t) => t.id !== id))
    } catch (e: any) {
      setRowError((m) => ({ ...m, [id]: e.message }))
    } finally {
      setBusy(null)
    }
  }

  async function open(task: QueueTask) {
    if (task.task_type === 'send_note' && task.note && task.client) {
      router.push(`/clients/${task.client.id}/notes?note=${task.note.id}`)
      return
    }
    setBusy(task.id)
    setRowError((m) => ({ ...m, [task.id]: '' }))
    try {
      const res = await fetch(`/api/tasks/${task.id}/note`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.href) throw new Error(data.error || 'Could not open the note.')
      router.push(data.href)
    } catch (e: any) {
      setRowError((m) => ({ ...m, [task.id]: e.message }))
      setBusy(null)
    }
  }

  function when(task: QueueTask): string {
    const iso = task.appointment?.scheduled_at
    if (!iso) return ''
    try {
      return formatWhenShort(new Date(iso), timeZone)
    } catch {
      return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    }
  }

  if (loading) return <div className="mb-5 h-10 animate-pulse rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface/60" />
  if (unavailable) return null

  if (error) {
    return (
      <section className="mb-5 rounded-tlw-2xl border border-tlw-warm-gray/20 bg-tlw-surface px-4 py-3 text-[13px] text-tlw-espresso">
        Needs your attention: {error}{' '}
        <button onClick={load} className="font-medium text-tlw-navy-rich underline">
          Retry
        </button>
      </section>
    )
  }

  if (tasks.length === 0) {
    return (
      <p className="mb-5 flex items-center gap-2 text-[12px] text-tlw-warm-gray">
        <span aria-hidden>✓</span> Nothing needs your attention.
      </p>
    )
  }

  // Group by client, keeping the newest-session-first order the API returns.
  const groups: { client: QueueTask['client']; tasks: QueueTask[] }[] = []
  for (const t of tasks) {
    const key = t.client?.id ?? '__none'
    let g = groups.find((x) => (x.client?.id ?? '__none') === key)
    if (!g) {
      g = { client: t.client, tasks: [] }
      groups.push(g)
    }
    g.tasks.push(t)
  }

  return (
    <section className="mb-5 rounded-tlw-2xl border border-tlw-warm-gray/20 bg-tlw-surface p-4 sm:p-5" aria-labelledby="needs-attention-title">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="needs-attention-title" className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          Needs your attention
          <span className="ml-2 rounded-full bg-tlw-signal-orange/15 px-2 py-[1px] text-[11px] font-semibold text-tlw-signal-orange">{tasks.length}</span>
        </h2>
      </div>

      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.client?.id ?? 'none'}>
            {g.client ? (
              <Link href={`/clients/${g.client.id}`} className="text-[14px] font-semibold text-tlw-navy-deep hover:underline">
                {g.client.name}
              </Link>
            ) : (
              <p className="text-[14px] font-semibold text-tlw-navy-deep">Unassigned session</p>
            )}
            <ul className="mt-1.5 space-y-2">
              {g.tasks.map((t) => {
                const isBusy = busy === t.id
                const confirming = confirm?.id === t.id ? confirm.action : null
                const canFile = t.task_type === 'send_note' && !!t.note
                return (
                  <li key={t.id} className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-canvas/60 p-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-tlw-espresso">{TYPE_LABEL[t.task_type] || t.task_type}</p>
                        <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
                          {when(t)}
                          {t.note?.title ? ` · ${t.note.title}` : ''}
                        </p>
                      </div>
                    </div>

                    {confirming ? (
                      <div className="mt-2.5 rounded-tlw-lg border border-tlw-warm-gray/25 bg-tlw-surface p-2.5">
                        <p className="text-[12px] text-tlw-espresso">
                          {confirming === 'file'
                            ? 'File this session? The note is kept for you and will not be sent to the client.'
                            : 'Dismiss this session? No session note will be written for it.'}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            onClick={() => resolve(t.id, confirming)}
                            disabled={isBusy}
                            className="min-h-[40px] rounded-tlw-lg bg-tlw-navy-rich px-3 text-[13px] font-medium text-white disabled:opacity-40"
                          >
                            {confirming === 'file' ? 'Yes, file it' : 'Yes, dismiss'}
                          </button>
                          <button
                            onClick={() => setConfirm(null)}
                            disabled={isBusy}
                            className="min-h-[40px] rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-surface px-3 text-[13px] font-medium text-tlw-espresso disabled:opacity-40"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                        <button
                          onClick={() => open(t)}
                          disabled={isBusy}
                          className="col-span-2 min-h-[40px] rounded-tlw-lg bg-tlw-navy-rich px-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 sm:col-auto"
                        >
                          {isBusy ? 'Opening…' : t.task_type === 'send_note' ? 'Open note to send' : 'Write note'}
                        </button>
                        {canFile && (
                          <button
                            onClick={() => setConfirm({ id: t.id, action: 'file' })}
                            disabled={isBusy}
                            title="Keep the note internal — nothing goes to the client"
                            className="min-h-[40px] rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-surface px-3 text-[13px] font-medium text-tlw-espresso hover:bg-tlw-canvas disabled:opacity-40"
                          >
                            File
                          </button>
                        )}
                        <button
                          onClick={() => setConfirm({ id: t.id, action: 'dismiss' })}
                          disabled={isBusy}
                          title="No session note is needed for this session"
                          className={`min-h-[40px] rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-surface px-3 text-[13px] font-medium text-tlw-warm-gray hover:bg-tlw-canvas hover:text-tlw-espresso disabled:opacity-40 ${canFile ? '' : 'col-span-2 sm:col-auto'}`}
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                    {rowError[t.id] && <p className="mt-2 text-[12px] text-red-700">{rowError[t.id]}</p>}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
