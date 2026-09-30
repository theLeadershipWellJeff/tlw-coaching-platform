'use client'
import { useState } from 'react'
import { InfoPopover } from './InfoPopover'
import { ScheduleRequestForm } from './ScheduleRequestForm'
import type { PortalAppointment, PortalCoachContact } from '@/lib/portal/data'

function fmtDateTime(iso: string, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz || undefined,
    }).format(new Date(iso))
  } catch {
    return new Date(iso).toLocaleString('en-US')
  }
}

/**
 * Upcoming sessions with self-service changes. A session booked through a
 * scheduler that wrote its own reschedule / cancel links into the calendar
 * event (Calendly) gets those links; anything else gets "Request a change",
 * which emails the coach's assistant (or the coach).
 */
export function UpcomingSessionsCard({
  appointments,
  timezone,
  coach,
}: {
  appointments: PortalAppointment[]
  timezone: string | null
  coach: PortalCoachContact | null
}) {
  const [open, setOpen] = useState<{ id: string; kind: 'reschedule' | 'cancel' } | null>(null)
  const recipient = coach?.assistantName || (coach?.assistantEmail ? 'the scheduling assistant' : coach?.firstName || 'your coach')
  const link = 'text-[12px] font-medium text-tlw-signal-orange hover:underline'

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">Upcoming sessions</h2>
        <InfoPopover
          label="Upcoming sessions"
          text={
            coach
              ? `Your booked sessions with ${coach.firstName || 'your coach'}. Reschedule or cancel a session here; a new booking shows up within the hour.`
              : 'Your booked coaching sessions.'
          }
        />
      </div>
      <div className="mt-3">
        {appointments.length === 0 ? (
          <p className="text-[13px] text-tlw-warm-gray">No upcoming session scheduled yet.</p>
        ) : (
          <ul className="space-y-3">
            {appointments.map((a, i) => (
              <li key={a.id}>
                <p className={i === 0 ? 'text-[15px] text-tlw-espresso' : 'text-[13px] text-tlw-espresso'}>
                  {fmtDateTime(a.scheduled_at, timezone)}
                  <span className="text-tlw-warm-gray"> · {a.duration_minutes} min</span>
                </p>
                {coach && (
                  <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
                    {a.rescheduleUrl ? (
                      <a href={a.rescheduleUrl} target="_blank" rel="noopener noreferrer" className={link}>
                        Reschedule
                      </a>
                    ) : (
                      <button onClick={() => setOpen({ id: a.id, kind: 'reschedule' })} className={link}>
                        Request a new time
                      </button>
                    )}
                    {a.cancelUrl ? (
                      <a href={a.cancelUrl} target="_blank" rel="noopener noreferrer" className={link}>
                        Cancel
                      </a>
                    ) : (
                      <button onClick={() => setOpen({ id: a.id, kind: 'cancel' })} className={link}>
                        Cancel
                      </button>
                    )}
                  </div>
                )}
                {open?.id === a.id && (
                  <ScheduleRequestForm
                    key={open.kind}
                    kind={open.kind}
                    appointmentId={a.id}
                    recipient={recipient}
                    onClose={() => setOpen(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
