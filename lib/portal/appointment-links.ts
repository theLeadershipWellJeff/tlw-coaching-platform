/**
 * Self-service change links for a booked session (pure, dependency-free).
 *
 * Calendly (and other schedulers) write the invitee's own reschedule / cancel
 * links into the Google Calendar event they create, e.g.
 *   "Need to make changes to this event?
 *    Cancel: https://calendly.com/cancellations/<uuid>
 *    Reschedule: https://calendly.com/reschedulings/<uuid>"
 * The calendar-watch sync keeps that event on `appointments.raw_event`, so
 * the portal can hand the client the same links the scheduler emailed them.
 *
 * Only https links on known scheduler hosts are ever returned — the event
 * description is third-party text and this lands as a link on a client page.
 * No link found → null, and the portal offers "Request a change" instead.
 */

export type AppointmentChangeLinks = { rescheduleUrl: string | null; cancelUrl: string | null }

const SCHEDULER_HOSTS = ['calendly.com', 'zoom.us', 'hubspot.com', 'savvycal.com', 'acuityscheduling.com']

function allowedHost(host: string): boolean {
  const h = host.toLowerCase()
  return SCHEDULER_HOSTS.some((d) => h === d || h.endsWith('.' + d))
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

/** Every allowed https URL in a text/HTML blob, in order, de-duplicated. */
export function schedulerUrls(text: string): string[] {
  const out: string[] = []
  const re = /https:\/\/[^\s"'<>)\]]+/gi
  for (const m of decodeEntities(text).match(re) || []) {
    const raw = m.replace(/[.,;:!?]+$/, '')
    try {
      const u = new URL(raw)
      if (u.protocol !== 'https:' || !allowedHost(u.hostname)) continue
      if (!out.includes(u.toString())) out.push(u.toString())
    } catch {
      /* not a URL */
    }
  }
  return out
}

/** Pull the reschedule / cancel links out of a Google Calendar event (raw_event). */
export function extractChangeLinks(rawEvent: unknown): AppointmentChangeLinks {
  const ev = (rawEvent && typeof rawEvent === 'object' ? rawEvent : {}) as { description?: unknown; location?: unknown }
  const text = [ev.description, ev.location].filter((v) => typeof v === 'string').join('\n')
  let rescheduleUrl: string | null = null
  let cancelUrl: string | null = null
  if (!text) return { rescheduleUrl, cancelUrl }
  for (const url of schedulerUrls(text)) {
    const path = (() => {
      try {
        const u = new URL(url)
        return (u.pathname + u.search).toLowerCase()
      } catch {
        return ''
      }
    })()
    if (!rescheduleUrl && /reschedul/.test(path)) rescheduleUrl = url
    else if (!cancelUrl && /cancel/.test(path)) cancelUrl = url
  }
  return { rescheduleUrl, cancelUrl }
}
