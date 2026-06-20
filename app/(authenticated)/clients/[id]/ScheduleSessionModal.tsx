'use client'
import { useState } from 'react'
import { Modal } from '@/app/components/shared/Modal'

const DURATIONS = [30, 45, 60, 90]

/**
 * Book the client's next session from inside the note workspace. Same booking
 * path as the workspace Sessions card (POST /api/clients/[id]/schedule): the
 * wall-clock pick is interpreted in the coach's timezone server-side, creating
 * the Google Calendar event + confirmation email.
 */
export function ScheduleSessionModal({
  clientId,
  clientName,
  onClose,
  onScheduled,
}: {
  clientId: string
  clientName: string
  onClose: () => void
  onScheduled?: () => void
}) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState(60)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

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
      setDone(true)
      onScheduled?.()
      setTimeout(onClose, 1000)
    } catch (e: any) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={`Schedule next session${clientName ? ` · ${clientName}` : ''}`} onClose={onClose}>
      {done ? (
        <p className="py-6 text-center text-[14px] font-medium" style={{ color: 'var(--color-success)' }}>
          Scheduled ✓
        </p>
      ) : (
        <div className="space-y-4">
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
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-tlw-warm-gray">
            Times are in your coaching timezone. We&apos;ll add it to your calendar and email a confirmation.
          </p>
          {error && <p className="text-[13px] text-tlw-signal-orange">{error}</p>}
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">Cancel</button>
            <button
              onClick={schedule}
              disabled={busy || !date || !time}
              className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? 'Scheduling…' : 'Schedule'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
