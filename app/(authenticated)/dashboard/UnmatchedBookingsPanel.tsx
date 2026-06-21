'use client'
import { useCallback, useEffect, useState } from 'react'
import type { Client } from '@/lib/supabase/types'
import { formatWhenShort } from '@/lib/datetime'

interface Booking {
  id: string
  scheduled_at: string
  duration_minutes: number
  title: string | null
  attendee_email: string | null
  source: string
}

const SOURCE_LABEL: Record<string, string> = {
  calendly: 'Calendly',
  hubspot: 'HubSpot',
  external: 'External',
  native: 'Native',
}

/**
 * Unmatched bookings review queue. External sessions (typically booked through
 * Jeff's Calendly/HubSpot links) land on his Google Calendar and are captured by
 * the calendar sync, but some can't be tied to a roster client (e.g. the guest used
 * a different email). Rather than silently drop them, they surface here so the coach
 * can assign each to a client — at which point it becomes that client's Next
 * Appointment — or dismiss it. A "Sync now" button pulls the calendar on demand.
 */
export function UnmatchedBookingsPanel({ clients, timeZone }: { clients: Client[]; timeZone: string }) {
  const [items, setItems] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [picks, setPicks] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/bookings/unmatched')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setItems(data.bookings || [])
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function sync() {
    setSyncing(true)
    try {
      await fetch('/api/bookings/sync', { method: 'POST' })
      await load()
    } finally {
      setSyncing(false)
    }
  }

  async function assign(id: string) {
    const clientId = picks[id]
    if (!clientId) return
    setBusy(id)
    const prev = items
    setItems((cur) => cur.filter((b) => b.id !== id))
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setItems(prev)
    } finally {
      setBusy(null)
    }
  }

  async function dismiss(id: string) {
    setBusy(id)
    const prev = items
    setItems((cur) => cur.filter((b) => b.id !== id))
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setItems(prev)
    } finally {
      setBusy(null)
    }
  }

  function whenLabel(iso: string): string {
    try {
      return formatWhenShort(new Date(iso), timeZone)
    } catch {
      return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          Unmatched bookings
          {!loading && !error && items.length > 0 && (
            <span className="ml-2 rounded-full bg-tlw-signal-orange/15 px-2 py-[1px] text-[11px] font-semibold text-tlw-signal-orange">
              {items.length}
            </span>
          )}
        </p>
        <button
          onClick={sync}
          disabled={syncing}
          className="text-[12px] font-medium text-tlw-signal-orange hover:underline disabled:opacity-40"
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      {loading ? (
        <div className="h-14 animate-pulse rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface/60" />
      ) : error ? (
        <div className="rounded-tlw-xl border border-tlw-warm-gray/20 bg-tlw-surface p-6 text-center text-[13px] text-tlw-espresso">
          Couldn&apos;t load bookings.
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-[120px] flex-col items-center justify-center rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 text-center">
          <p className="text-[13px] text-tlw-warm-gray">No unmatched bookings.</p>
          <p className="mt-1 text-[12px] text-tlw-warm-gray">
            Calendly &amp; HubSpot bookings that can&apos;t be tied to a client appear here.
          </p>
        </div>
      ) : (
        <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {items.map((b) => (
            <div
              key={b.id}
              className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-tlw-navy-deep">{b.title || 'Untitled session'}</p>
                  <p className="mt-0.5 text-[12px] text-tlw-warm-gray">{whenLabel(b.scheduled_at)}</p>
                  {b.attendee_email && (
                    <p className="mt-0.5 truncate text-[12px] text-tlw-warm-gray">{b.attendee_email}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-tlw-navy-rich/10 px-2.5 py-0.5 text-[11px] font-medium text-tlw-navy-rich">
                  {SOURCE_LABEL[b.source] || b.source}
                </span>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <select
                  value={picks[b.id] || ''}
                  onChange={(e) => setPicks((p) => ({ ...p, [b.id]: e.target.value }))}
                  className="min-w-0 flex-1 rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-surface px-2 py-1.5 text-[13px] text-tlw-espresso"
                >
                  <option value="">Assign to client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => assign(b.id)}
                  disabled={!picks[b.id] || busy === b.id}
                  className="shrink-0 rounded-tlw-lg bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Assign
                </button>
                <button
                  onClick={() => dismiss(b.id)}
                  disabled={busy === b.id}
                  title="Dismiss this booking"
                  aria-label="Dismiss this booking"
                  className="shrink-0 rounded-md px-1.5 py-1 text-[14px] leading-none text-tlw-warm-gray transition-colors hover:bg-tlw-warm-gray/15 hover:text-tlw-espresso disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
