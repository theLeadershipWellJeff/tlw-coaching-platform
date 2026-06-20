'use client'
import { useCallback, useEffect, useState } from 'react'
import { formatWhenShort } from '@/lib/datetime'

export interface Appointment {
  id: string
  scheduled_at: string
  duration_minutes: number
  status: string
}

/** Format an instant for display. When the coach's `timeZone` is known we render
 *  in it (so an evening Pacific session never reads as the next morning); without
 *  it we fall back to the browser's locale/zone. */
function fmtLong(iso: string, timeZone?: string): string {
  if (timeZone) return formatWhenShort(new Date(iso), timeZone)
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * The client's upcoming scheduled sessions. `compact` renders a couple of quiet
 * lines for the name card (no controls, nothing if empty); the full mode lists
 * every future session with a cancel control and is used inside the Sessions
 * card. Both read the same endpoint and refetch when `reloadKey` changes.
 */
export function UpcomingSessions({
  clientId,
  reloadKey = 0,
  compact = false,
  onChanged,
  timeZone,
}: {
  clientId: string
  reloadKey?: number
  compact?: boolean
  onChanged?: () => void
  timeZone?: string
}) {
  const [appts, setAppts] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/appointments`)
      const data = await res.json()
      if (res.ok) setAppts(data.appointments || [])
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    load()
  }, [load, reloadKey])

  async function cancel(id: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/appointments/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setCancelling(null)
        await load()
        onChanged?.()
      }
    } finally {
      setBusy(false)
    }
  }

  // Compact: a few quiet lines under the name/email. Show nothing until loaded
  // or when there's nothing scheduled.
  if (compact) {
    if (loading || appts.length === 0) return null
    return (
      <div className="mt-3 border-t border-tlw-warm-gray/15 pt-3">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">Upcoming sessions</p>
        <ul className="space-y-1">
          {appts.slice(0, 3).map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-[13px] text-tlw-espresso">
              <CalIcon />
              <span>{fmtLong(a.scheduled_at, timeZone)}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // Full list (Sessions card).
  if (loading) {
    return <div className="h-10 animate-pulse rounded-tlw-lg bg-tlw-canvas/60" />
  }
  if (appts.length === 0) {
    return <p className="text-[13px] text-tlw-warm-gray">No sessions scheduled yet.</p>
  }
  return (
    <ul className="space-y-2">
      {appts.map((a) => (
        <li
          key={a.id}
          className="flex items-center justify-between gap-3 rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-canvas/40 px-3 py-2"
        >
          <span className="flex items-center gap-2 text-[14px] text-tlw-espresso">
            <CalIcon />
            {fmtLong(a.scheduled_at, timeZone)}
            <span className="text-[12px] text-tlw-warm-gray">· {a.duration_minutes} min</span>
          </span>
          <div className="flex shrink-0 items-center gap-2 text-[12px] font-medium">
            {cancelling === a.id ? (
              <>
                <button onClick={() => cancel(a.id)} disabled={busy} className="text-red-600 hover:underline disabled:opacity-40">
                  cancel session
                </button>
                <button onClick={() => setCancelling(null)} className="text-tlw-warm-gray hover:text-tlw-espresso">
                  keep
                </button>
              </>
            ) : (
              <button onClick={() => setCancelling(a.id)} className="text-tlw-warm-gray hover:text-red-600">
                cancel
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function CalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" className="shrink-0 text-tlw-warm-gray">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}
