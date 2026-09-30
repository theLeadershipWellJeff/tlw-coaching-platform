/**
 * How a coach's portal clients reach them to schedule (pure, dependency-free):
 * a booking link (coaches.booking_url, migration 051 — Calendly, Zoom
 * Scheduler, HubSpot) and/or a scheduling assistant (migration 074). Shared by
 * Account → Scheduling (the coach's own PATCH /api/coach) and the Command
 * Center (a supervisor's PATCH /api/coaches/[id]) so both validate the same way.
 */

export type SchedulingFieldResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** "" / null clears. Only http(s) — the link is rendered on a client-facing page. */
export function parseBookingUrl(raw: unknown): SchedulingFieldResult<string | null> {
  const s = String(raw ?? '').trim()
  if (!s) return { ok: true, value: null }
  try {
    const u = new URL(s)
    if (u.protocol === 'https:' || u.protocol === 'http:') return { ok: true, value: s }
  } catch {
    /* fall through */
  }
  return { ok: false, error: 'Enter a valid booking link starting with https://' }
}

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/

/** "" / null clears. */
export function parseAssistantEmail(raw: unknown): SchedulingFieldResult<string | null> {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return { ok: true, value: null }
  if (s.length > 200 || !EMAIL_RE.test(s)) return { ok: false, error: 'Enter a valid assistant email address.' }
  return { ok: true, value: s }
}

/** "" / null clears. */
export function parseAssistantName(raw: unknown): SchedulingFieldResult<string | null> {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!s) return { ok: true, value: null }
  if (s.length > 80) return { ok: false, error: 'Keep the assistant name under 80 characters.' }
  return { ok: true, value: s }
}

/**
 * Read the three scheduling fields off a request body (only the keys present),
 * as a partial `coaches` update. Keys: bookingUrl, assistantName, assistantEmail.
 */
export function schedulingUpdateFromBody(
  body: Record<string, unknown>
): SchedulingFieldResult<{ booking_url?: string | null; scheduling_assistant_name?: string | null; scheduling_assistant_email?: string | null }> {
  const out: { booking_url?: string | null; scheduling_assistant_name?: string | null; scheduling_assistant_email?: string | null } = {}
  if ('bookingUrl' in body) {
    const r = parseBookingUrl(body.bookingUrl)
    if (!r.ok) return r
    out.booking_url = r.value
  }
  if ('assistantName' in body) {
    const r = parseAssistantName(body.assistantName)
    if (!r.ok) return r
    out.scheduling_assistant_name = r.value
  }
  if ('assistantEmail' in body) {
    const r = parseAssistantEmail(body.assistantEmail)
    if (!r.ok) return r
    out.scheduling_assistant_email = r.value
  }
  return { ok: true, value: out }
}

/** First name for client-facing copy ("Schedule with Maya"). */
export function coachFirstName(name: string | null | undefined): string | null {
  const first = String(name || '').trim().split(/\s+/)[0]
  return first || null
}
