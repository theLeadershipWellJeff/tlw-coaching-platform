'use client'
import { useCallback, useEffect, useState } from 'react'
import { NudgeItem, type NudgeRow } from './NudgeItem'

/**
 * The coach's cross-client Nudge Queue — every pending nudge in one place. Drafts
 * first (need review), then scheduled/snoozed. Each item is self-contained; acting
 * on one refetches the list so it falls away once handled.
 */
export function NudgeQueue() {
  const [rows, setRows] = useState<NudgeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/nudges')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load nudges')
      setRows(data.nudges || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return <div className="h-40 animate-pulse rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface/60" />
  }
  if (error) {
    return (
      <div className="rounded-tlw-xl border border-tlw-warm-gray/20 bg-tlw-surface p-8 text-center text-[13px] text-tlw-espresso">
        {error}
      </div>
    )
  }

  const drafts = rows.filter((n) => n.status === 'draft')
  const queued = rows.filter((n) => n.status === 'scheduled' || n.status === 'snoozed')

  if (rows.length === 0) {
    return (
      <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-8 text-center">
        <p className="text-[14px] text-tlw-espresso">No nudges to review.</p>
        <p className="mt-1 text-[13px] text-tlw-warm-gray">
          New drafts appear here automatically after a session is scored.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {drafts.length > 0 && (
        <section>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
            Needs review · {drafts.length}
          </p>
          <div className="space-y-3">
            {drafts.map((n) => (
              <NudgeItem key={n.id} nudge={n} showClient onChanged={load} />
            ))}
          </div>
        </section>
      )}

      {queued.length > 0 && (
        <section>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
            Scheduled · {queued.length}
          </p>
          <div className="space-y-3">
            {queued.map((n) => (
              <NudgeItem key={n.id} nudge={n} showClient onChanged={load} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
