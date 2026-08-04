/**
 * When a prep sheet is delivered to the client.
 *
 * The rule: `delivery_lead_days` before the session, at `delivery_hour` in the
 * CLIENT's timezone (their morning), BUT never later than exactly 48 hours
 * before the session — the guarantee wins over the preferred hour. A very
 * early-morning session (where day-minus-2 at 8am would land inside the 48h
 * window) clamps to exactly T-48h.
 *
 * Dependency-free (own DST-correct offset via Intl) so it stays unit-testable
 * with a throwaway node script and doesn't drag googleapis in through calendar.ts.
 */
import { ymdInTimeZone } from '@/lib/datetime'
import type { PrepSheetSettings } from './settings'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
export const DELIVERY_GUARANTEE_MS = 48 * HOUR_MS

/** Offset (ms) of a timezone at a given instant, via Intl (DST-correct). */
function tzOffsetMs(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUTC - at.getTime()
}

/** Interpret Y-M-D + whole hour as wall-clock in `timeZone`; return the instant. */
function wallClockToUtc(y: number, m: number, d: number, hour: number, timeZone: string): Date {
  const wallMs = Date.UTC(y, m - 1, d, hour, 0, 0)
  // Two-pass to stay correct across DST boundaries.
  const guess = new Date(wallMs)
  return new Date(wallMs - tzOffsetMs(guess, timeZone))
}

export type DeliveryPlan = {
  at: Date // the clamped, DST-correct delivery instant
  clamped: boolean // true when the preferred hour was pulled back to exactly T-48h
}

/**
 * Compute the delivery plan for a session starting at `sessionStart`.
 * `timeZone` is the client's timezone (caller falls back to the coach's when the
 * client has none). `clamped` marks a short-notice session where the preferred
 * hour would have violated the 48h guarantee.
 */
export function computeDeliveryPlan(
  sessionStart: Date,
  settings: PrepSheetSettings,
  timeZone: string
): DeliveryPlan {
  // The session's calendar date as read in the client's timezone, minus the lead.
  const sessionYmd = ymdInTimeZone(sessionStart, timeZone)
  const [sy, sm, sd] = sessionYmd.split('-').map(Number)
  // Anchor at local midnight of the session date, step back whole days, then read
  // the resulting Y-M-D (handles month/year rollover without date math bugs).
  const anchor = wallClockToUtc(sy, sm, sd, 0, timeZone)
  const deliveryDayAnchor = new Date(anchor.getTime() - settings.delivery_lead_days * DAY_MS)
  const deliveryYmd = ymdInTimeZone(deliveryDayAnchor, timeZone)
  const [dy, dm, dd] = deliveryYmd.split('-').map(Number)

  const preferred = wallClockToUtc(dy, dm, dd, settings.delivery_hour, timeZone)

  // The guarantee: at least 48h before the session. If the preferred hour lands
  // later than T-48h (a very early session), clamp to exactly T-48h.
  const latestAllowed = new Date(sessionStart.getTime() - DELIVERY_GUARANTEE_MS)
  const clamped = preferred.getTime() > latestAllowed.getTime()
  return { at: clamped ? latestAllowed : preferred, clamped }
}

/** Just the delivery instant (see computeDeliveryPlan). */
export function computeScheduledSendAt(
  sessionStart: Date,
  settings: PrepSheetSettings,
  timeZone: string
): Date {
  return computeDeliveryPlan(sessionStart, settings, timeZone).at
}
