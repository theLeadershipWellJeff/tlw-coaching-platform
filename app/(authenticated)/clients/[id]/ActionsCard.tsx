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
 * their email. Read-only here; the loop is: send note → client taps → logged.
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
                {done ? (
                  <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] bg-tlw-navy-rich text-[10px] font-bold text-tlw-cream">
                    ✓
                  </span>
                ) : (
                  <span className="mt-[1px] inline-block h-4 w-4 shrink-0 rounded-[3px] border-2 border-tlw-navy-rich" />
                )}
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
