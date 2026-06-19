'use client'
import { useState } from 'react'
import { UpcomingSessions } from './UpcomingSessions'

const DURATIONS = [30, 45, 60, 90]

/**
 * "Schedule next session" — books the client's next session at the end of a
 * session. Posts a wall-clock date/time (interpreted in the coach's timezone
 * server-side), which creates the Google Calendar event + confirmation email.
 * Lists upcoming sessions below, with cancel. `reloadKey`/`onChanged` keep the
 * compact list on the name card in sync.
 */
export function ScheduleCard({
  clientId,
  reloadKey,
  onChanged,
}: {
  clientId: string
  reloadKey: number
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState(60)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function schedule() {
    if (!date || !time) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${clientId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time, durationMinutes: duration }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not schedule the session.')
      setOpen(false)
      setDate('')
      setTime('')
      setDuration(60)
      onChanged()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Sessions</p>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="rounded-tlw-lg bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity hover:opacity-90"
          >
            + Schedule next session
          </button>
        )}
      </div>

      {open && (
        <div className="mb-4 rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-canvas/40 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-[1px] text-tlw-warm-gray">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-2.5 py-1.5 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-[1px] text-tlw-warm-gray">Time</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-2.5 py-1.5 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-[1px] text-tlw-warm-gray">Length</span>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-2.5 py-1.5 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={schedule}
                disabled={busy || !date || !time}
                className="rounded-tlw-md bg-tlw-navy-rich px-3 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy ? 'Scheduling…' : 'Schedule'}
              </button>
              <button
                onClick={() => { setOpen(false); setError('') }}
                className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso"
              >
                Cancel
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-tlw-warm-gray">
            Times are in your coaching timezone. We&apos;ll add it to your calendar and email a confirmation.
          </p>
          {error && <p className="mt-2 text-[13px] text-tlw-signal-orange">{error}</p>}
        </div>
      )}

      <UpcomingSessions clientId={clientId} reloadKey={reloadKey} onChanged={onChanged} />
    </div>
  )
}
