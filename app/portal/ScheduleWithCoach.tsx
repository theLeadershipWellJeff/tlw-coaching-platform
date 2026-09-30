'use client'
import { useState } from 'react'
import { ScheduleRequestForm } from './ScheduleRequestForm'
import type { PortalCoachContact } from '@/lib/portal/data'

/**
 * The top-of-page scheduling block for a client who has an assigned coach:
 * the coach's booking link (Calendly / Zoom Scheduler / HubSpot) and/or their
 * scheduling assistant. Renders nothing when the coach has neither.
 */
export function ScheduleWithCoach({ coach }: { coach: PortalCoachContact }) {
  const [asking, setAsking] = useState(false)
  const who = coach.firstName || 'your coach'
  const assistantLabel = coach.assistantName || 'the scheduling assistant'
  if (!coach.bookingUrl && !coach.assistantEmail) return null

  return (
    <div className="mt-6 space-y-3">
      {coach.bookingUrl && (
        <a
          href={coach.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-tlw-2xl bg-tlw-navy-deep px-5 py-4 text-white transition-opacity hover:opacity-90"
        >
          <span className="text-[15px] font-medium">Schedule your next session with {who}</span>
          <span className="text-[18px] text-tlw-signal-orange" aria-hidden>
            →
          </span>
        </a>
      )}
      {coach.assistantEmail && (
        <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface px-5 py-4">
          <p className="text-[14px] text-tlw-espresso">
            {coach.bookingUrl ? 'Prefer a person? ' : ''}
            {coach.assistantName ? `${coach.assistantName} books ${who}'s sessions` : `${who}'s sessions are booked by an assistant`}
            {' — '}
            <a href={`mailto:${coach.assistantEmail}`} className="font-medium text-tlw-navy-deep underline decoration-tlw-signal-orange underline-offset-2">
              {coach.assistantEmail}
            </a>
          </p>
          {asking ? (
            <ScheduleRequestForm kind="book" recipient={assistantLabel} onClose={() => setAsking(false)} />
          ) : (
            <button onClick={() => setAsking(true)} className="mt-1.5 text-[13px] font-medium text-tlw-signal-orange hover:underline">
              Ask {assistantLabel} to find a time →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
