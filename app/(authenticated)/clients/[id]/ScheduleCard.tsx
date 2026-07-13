'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { UpcomingSessions } from './UpcomingSessions'

const DURATIONS = [30, 45, 60, 90]

type Check = {
  startsAt: string
  past: boolean
  coachTimezone: string
  coachTimeLabel: string
  clientTimezone: string | null
  clientCity: string | null
  clientTimeLabel: string | null
  conflictChecked: boolean
  conflict: boolean
  withinAvailability: boolean
  availabilityLabel: string
}

/**
 * "Schedule next session" — books the client's next session at the end of a
 * session. Posts a wall-clock date/time (interpreted in the coach's timezone
 * server-side), which creates the Google Calendar event + confirmation email.
 *
 * As the coach picks a time, a live pre-flight (`/schedule/check`) shows the slot
 * in both the coach's and the client's timezone (so they can agree on the call),
 * flags a Google Calendar conflict (the Schedule button goes grey + disabled),
 * and warns — without blocking — when the time is outside the coach's set hours.
 */
export function ScheduleCard({
  clientId,
  reloadKey,
  onChanged,
  coachTimezone,
}: {
  clientId: string
  reloadKey: number
  onChanged: () => void
  coachTimezone?: string
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState(60)
  const [meetingLink, setMeetingLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [check, setCheck] = useState<Check | null>(null)
  const [checking, setChecking] = useState(false)
  const reqId = useRef(0)
  const linkTouched = useRef(false)

  // Prefill the meeting link when the form opens — the last link used for this
  // client (else the coach's usual one), from GET /schedule. Never overwrites
  // something the coach has already typed.
  useEffect(() => {
    if (!open || linkTouched.current) return
    let stale = false
    fetch(`/api/clients/${clientId}/schedule`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!stale && !linkTouched.current && data?.defaultMeetingLink) {
          setMeetingLink(data.defaultMeetingLink)
        }
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [open, clientId])

  // Live pre-flight, debounced, whenever the picked slot changes.
  useEffect(() => {
    if (!open || !date || !time) {
      setCheck(null)
      setChecking(false)
      return
    }
    const id = ++reqId.current
    setChecking(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/schedule/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, time, durationMinutes: duration }),
        })
        const data = await res.json()
        if (id !== reqId.current) return // a newer pick superseded this one
        if (res.ok) setCheck(data)
        else setCheck(null)
      } catch {
        if (id === reqId.current) setCheck(null)
      } finally {
        if (id === reqId.current) setChecking(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [open, date, time, duration, clientId])

  const reset = useCallback(() => {
    setOpen(false)
    setError('')
    setCheck(null)
  }, [])

  // Blocked from booking: a confirmed calendar conflict or a past time. The
  // out-of-hours case only warns — the coach can still book.
  const blocked = Boolean(check && (check.conflict || check.past))
  const canSchedule = Boolean(date && time && !busy && !checking && !blocked)

  async function schedule() {
    if (!canSchedule) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${clientId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time, durationMinutes: duration, meetingLink: meetingLink.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not schedule the session.')
      setDate('')
      setTime('')
      setDuration(60)
      reset()
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
                disabled={!canSchedule}
                title={blocked ? 'This time is unavailable on your calendar.' : undefined}
                className={`rounded-tlw-md px-3 py-2 text-[13px] font-medium transition-colors ${
                  canSchedule
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'cursor-not-allowed bg-tlw-warm-gray/30 text-tlw-warm-gray'
                }`}
              >
                {busy ? 'Scheduling…' : checking ? 'Checking…' : 'Schedule'}
              </button>
              <button
                onClick={reset}
                className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Zoom (or other) meeting link — goes into the calendar invite and
              the confirmation/reminder emails. Prefilled with the last one used. */}
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[1px] text-tlw-warm-gray">
              Meeting link <span className="normal-case tracking-normal">(optional)</span>
            </span>
            <input
              type="url"
              value={meetingLink}
              onChange={(e) => {
                linkTouched.current = true
                setMeetingLink(e.target.value)
              }}
              placeholder="https://zoom.us/j/…"
              className="w-full max-w-md rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-2.5 py-1.5 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
            />
          </label>

          {/* Live read-out of the picked slot. */}
          {date && time && (
            <div className="mt-3 space-y-1.5 border-t border-tlw-warm-gray/15 pt-3 text-[13px]">
              {check ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="w-[64px] shrink-0 text-[11px] font-medium uppercase tracking-[1px] text-tlw-warm-gray">
                      You
                    </span>
                    <span className="text-tlw-espresso">{check.coachTimeLabel}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="w-[64px] shrink-0 text-[11px] font-medium uppercase tracking-[1px] text-tlw-warm-gray">
                      Client
                    </span>
                    {check.clientTimeLabel ? (
                      <span className="text-tlw-espresso">
                        {check.clientTimeLabel}
                        <span className="ml-1 text-[11px] text-tlw-warm-gray">
                          ({check.clientCity || check.clientTimezone?.replace(/_/g, ' ')})
                        </span>
                      </span>
                    ) : (
                      <span className="text-tlw-warm-gray">
                        Add the client&apos;s timezone (edit client) to show their local time.
                      </span>
                    )}
                  </div>

                  {/* Calendar conflict — blocks booking. */}
                  {check.conflict && (
                    <p className="flex items-center gap-1.5 pt-1 font-medium text-red-600">
                      <Dot className="text-red-500" /> Conflicts with another event on your calendar.
                    </p>
                  )}
                  {/* Couldn't verify the calendar — allow, but say so. */}
                  {!check.conflict && !check.conflictChecked && (
                    <p className="pt-1 text-[12px] text-tlw-warm-gray">
                      Couldn&apos;t verify your calendar — double-check for conflicts.
                    </p>
                  )}
                  {/* Free + verified. */}
                  {!check.conflict && check.conflictChecked && !check.past && (
                    <p className="flex items-center gap-1.5 pt-1 text-[12px] text-green-700">
                      <Dot className="text-green-600" /> Your calendar is free then.
                    </p>
                  )}
                  {/* Outside set hours — warn only. */}
                  {!check.past && !check.withinAvailability && (
                    <p className="text-[12px] text-amber-600">
                      Outside your usual hours ({check.availabilityLabel}). You can still book it.
                    </p>
                  )}
                  {check.past && <p className="text-[12px] text-red-600">That time is in the past.</p>}
                </>
              ) : (
                <p className="text-[12px] text-tlw-warm-gray">{checking ? 'Checking your calendar…' : ''}</p>
              )}
            </div>
          )}

          <p className="mt-3 text-[11px] text-tlw-warm-gray">
            Times you pick are in your coaching timezone. We&apos;ll add the session to your calendar and email a
            confirmation — the meeting link rides along in the invite and every reminder.
          </p>
          {error && <p className="mt-2 text-[13px] text-tlw-signal-orange">{error}</p>}
        </div>
      )}

      <UpcomingSessions clientId={clientId} reloadKey={reloadKey} onChanged={onChanged} timeZone={coachTimezone} />
    </div>
  )
}

function Dot({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full bg-current ${className}`} />
}
