'use client'
import { useEffect, useState } from 'react'
import type { Client } from '@/lib/supabase/types'

// Default the next session a week out at 9:00am — the coach adjusts as needed.
function defaultDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Right-edge slide-over to schedule the client's next coaching session. The
 * client's name + email are pre-filled from the record already in context; on
 * confirm it POSTs to /api/clients/[id]/schedule, which creates the Google
 * Calendar event and emails the invite.
 */
export function ScheduleSessionModal({
  client,
  noteId,
  onClose,
  onScheduled,
}: {
  client: Client
  noteId?: string
  onClose: () => void
  onScheduled?: () => void
}) {
  const [date, setDate] = useState(defaultDate())
  const [time, setTime] = useState('09:00')
  const [duration, setDuration] = useState(55)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  // Drives the slide-in transition (false on first paint → true after mount).
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const firstName = client.name.trim().split(/\s+/)[0] || client.name

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${client.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time, duration, noteId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not schedule the session.')
      setDone(true)
      onScheduled?.()
      setTimeout(onClose, 1800)
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  const field =
    'w-full rounded-tlw-lg border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none transition-colors focus:border-tlw-signal-orange'

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end bg-tlw-navy-deep/40 transition-opacity duration-200 ${
        shown ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex h-full w-full max-w-md flex-col overflow-y-auto bg-tlw-surface shadow-2xl transition-transform duration-200 ease-out ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-tlw-warm-gray/15 px-6 py-4">
          <h2 className="text-lg font-medium text-tlw-navy-deep">Schedule next session</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-tlw-warm-gray transition-colors hover:text-tlw-espresso"
          >
            ✕
          </button>
        </div>

        {done ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-tlw-navy-rich text-xl font-bold text-tlw-cream">
              ✓
            </span>
            <p className="text-[14px] text-tlw-espresso">
              Session scheduled — invite sent to {firstName}.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-1 flex-col gap-5 px-6 py-5">
            {/* Client is pre-filled from context — no searching. */}
            <div className="rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-canvas/40 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">
                Client
              </p>
              <p className="mt-1 text-[14px] font-medium text-tlw-navy-deep">{client.name}</p>
              <p className="text-[12px] text-tlw-warm-gray">
                {client.email || 'No email on file — no invite will be sent.'}
              </p>
            </div>

            <div className="flex gap-3">
              <label className="flex-1 space-y-1.5">
                <span className="text-[12px] font-medium text-tlw-espresso">Date</span>
                <input
                  type="date"
                  className={field}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
              <label className="w-32 space-y-1.5">
                <span className="text-[12px] font-medium text-tlw-espresso">Time</span>
                <input
                  type="time"
                  className={field}
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                />
              </label>
            </div>

            <label className="space-y-1.5">
              <span className="text-[12px] font-medium text-tlw-espresso">Duration (minutes)</span>
              <input
                type="number"
                min={5}
                step={5}
                className={field}
                value={duration}
                onChange={(e) => setDuration(Math.max(5, Math.round(Number(e.target.value) || 0)))}
              />
            </label>

            {error && (
              <div className="rounded-tlw-lg border border-tlw-signal-orange/30 bg-tlw-signal-orange/5 px-3 py-2">
                <p className="text-[13px] text-tlw-signal-orange">{error}</p>
              </div>
            )}

            <div className="mt-auto flex justify-end gap-2 border-t border-tlw-warm-gray/15 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-tlw-lg px-4 py-2 text-[13px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-colors hover:bg-tlw-navy-rich/85 disabled:opacity-60"
              >
                {saving ? 'Scheduling…' : error ? 'Retry' : 'Schedule session'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
