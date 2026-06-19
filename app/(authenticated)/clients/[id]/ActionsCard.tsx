'use client'
import { useEffect, useState } from 'react'

interface ActionRow {
  id: string
  description: string
  status: string
  due_date: string | null
  completed_at: string | null
  created_at: string
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Action items the coach has sent to this client (via a note email), with their
 * live status — `done` flips automatically when the client taps the checkbox in
 * their email. The coach can also check/uncheck here (optimistic, then persisted
 * via the same coach-side PATCH the capture panel uses).
 */
export function ActionsCard({ clientId, reloadKey = 0 }: { clientId: string; reloadKey?: number }) {
  const [rows, setRows] = useState<ActionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/clients/${clientId}/actions`)
      .then((r) => (r.ok ? r.json() : { actions: [] }))
      .then((d) => !cancelled && setRows(d.actions || []))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [clientId, reloadKey])

  // Coach-side check/uncheck — optimistic, then persisted.
  async function toggle(row: ActionRow) {
    const next = row.status === 'done' ? 'open' : 'done'
    setRows((prev) =>
      prev.map((a) =>
        a.id === row.id
          ? { ...a, status: next, completed_at: next === 'done' ? new Date().toISOString() : null }
          : a
      )
    )
    try {
      const res = await fetch(`/api/clients/${clientId}/actions/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const data = await res.json()
      if (res.ok && data.action) {
        setRows((prev) => prev.map((a) => (a.id === data.action.id ? data.action : a)))
      }
    } catch {
      // Leave the optimistic state; the next reload reconciles it.
    }
  }

  // Nothing sent yet — keep the workspace uncluttered.
  if (!loading && rows.length === 0) return null

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Action items</p>
        {rows.length > 0 && (
          <span className="text-[11px] text-tlw-warm-gray">
            {rows.filter((r) => r.status === 'done').length}/{rows.length} done
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-12 animate-pulse rounded-tlw-lg bg-tlw-canvas" />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((a) => {
            const done = a.status === 'done'
            return (
              <li key={a.id} className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggle(a)}
                  aria-label={done ? 'Mark not done' : 'Mark done'}
                  aria-pressed={done}
                  className="mt-[1px] shrink-0"
                >
                  {done ? (
                    <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-tlw-navy-rich text-[10px] font-bold text-tlw-cream">
                      ✓
                    </span>
                  ) : (
                    <span className="inline-block h-4 w-4 rounded-[3px] border-2 border-tlw-navy-rich transition-colors hover:bg-tlw-navy-rich/10" />
                  )}
                </button>
                <div className="min-w-0">
                  <p className={`text-[13px] ${done ? 'text-tlw-warm-gray line-through' : 'text-tlw-espresso'}`}>
                    {a.description}
                  </p>
                  {done && a.completed_at && (
                    <p className="text-[11px] text-tlw-warm-gray">completed {fmtDate(a.completed_at)}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
