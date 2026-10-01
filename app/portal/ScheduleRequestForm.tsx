'use client'
import { useState } from 'react'

/**
 * Inline "ask to book / move / cancel" form → POST /api/portal/schedule-request.
 * Goes to the coach's scheduling assistant when one is set, else the coach.
 */
export function ScheduleRequestForm({
  kind,
  appointmentId,
  recipient,
  onClose,
}: {
  kind: 'book' | 'reschedule' | 'cancel'
  appointmentId?: string
  /** Who it goes to, for the copy ("Priya", "your coach"). */
  recipient: string
  onClose?: () => void
}) {
  const [message, setMessage] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  const placeholder =
    kind === 'book'
      ? 'A few days and times that work for you…'
      : kind === 'reschedule'
        ? 'Times that would work instead (optional)…'
        : 'Anything you want to add (optional)…'

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (kind === 'book' && !message.trim()) return
    setState('sending')
    setError('')
    try {
      const res = await fetch('/api/portal/schedule-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, appointmentId, message }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not send your request.')
      setState('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your request.')
      setState('error')
    }
  }

  if (state === 'sent') {
    return (
      <div className="mt-2 rounded-tlw-md bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso">
        Sent to {recipient}. You&apos;ll hear back by email, and the change shows here once it&apos;s on the calendar.
        {onClose && (
          <button onClick={onClose} className="ml-2 text-[12px] font-medium text-tlw-signal-orange hover:underline">
            Close
          </button>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={send} className="mt-2">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className="w-full resize-none rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
      />
      {state === 'error' && <p className="mt-1 text-[12px] text-tlw-signal-orange">{error}</p>}
      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={state === 'sending' || (kind === 'book' && !message.trim())}
          className="rounded-tlw-md bg-tlw-navy-deep px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {state === 'sending' ? 'Sending…' : kind === 'cancel' ? `Ask ${recipient} to cancel` : `Send to ${recipient}`}
        </button>
        {onClose && (
          <button type="button" onClick={onClose} className="text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
            Never mind
          </button>
        )}
      </div>
    </form>
  )
}
