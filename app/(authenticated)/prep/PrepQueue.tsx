'use client'
import { useCallback, useEffect, useState } from 'react'
import { PrepSheetItem, type PrepSheetRow } from './PrepSheetItem'

/**
 * The coach's cross-client prep-sheet queue. Drafts + failures first (need
 * review), then approved/scheduled, then a compact history of sent + skipped.
 * Acting on a row refetches the list so it moves between sections. A ?focus= deep
 * link (from the review email's "Review & approve") scrolls to that sheet.
 */
export function PrepQueue() {
  const [rows, setRows] = useState<PrepSheetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/prep-sheets')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load prep sheets')
      setRows(data.prepSheets || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    try {
      const focus = new URLSearchParams(window.location.search).get('focus')
      if (focus) setFocusId(focus)
    } catch {
      /* ignore */
    }
  }, [load])

  useEffect(() => {
    if (loading || !focusId) return
    const el = document.getElementById(`prep-${focusId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setFocusId(null), 2400)
    return () => clearTimeout(t)
  }, [loading, focusId])

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

  const review = rows.filter((r) => r.status === 'draft' || r.status === 'failed')
  const scheduled = rows.filter((r) => r.status === 'approved')
  const history = rows.filter((r) => r.status === 'sent' || r.status === 'skipped')

  const focusRing = (id: string) =>
    focusId === id ? 'rounded-tlw-lg ring-2 ring-tlw-signal-orange ring-offset-2 ring-offset-tlw-canvas transition-shadow' : ''

  const section = (title: string, list: PrepSheetRow[]) =>
    list.length > 0 ? (
      <section>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          {title} · {list.length}
        </p>
        <div className="space-y-3">
          {list.map((r) => (
            <div key={r.id} id={`prep-${r.id}`} className={focusRing(r.id)}>
              <PrepSheetItem sheet={r} showClient onChanged={load} />
            </div>
          ))}
        </div>
      </section>
    ) : null

  return (
    <div className="space-y-8">
      {rows.length === 0 && (
        <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-8 text-center">
          <p className="text-[14px] text-tlw-espresso">No prep sheets yet.</p>
          <p className="mt-1 text-[13px] text-tlw-warm-gray">
            Drafts appear here automatically a few days before each session — you’ll get a review email too.
          </p>
        </div>
      )}
      {section('Needs review', review)}
      {section('Scheduled', scheduled)}
      {section('History', history)}
    </div>
  )
}
