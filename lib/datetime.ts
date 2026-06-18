/**
 * Timezone-aware date helpers.
 *
 * Kept dependency-free (no googleapis) so client components can import them too.
 * All "Y-M-D" output is the calendar date as it reads on a clock in `timeZone` —
 * which is what we store in `session_date` and show the coach — never the
 * server's UTC date. On Vercel the server runs in UTC, so a `new Date()`-derived
 * date is "tomorrow" for an evening Pacific session; route every coach-facing
 * "today" through here with the coach's timezone instead.
 */

/** The calendar date (YYYY-MM-DD) of `at` as seen in `timeZone`. */
export function ymdInTimeZone(at: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value
  return `${p.year}-${p.month}-${p.day}`
}

/** Today's date (YYYY-MM-DD) in `timeZone`. */
export function todayInTimeZone(timeZone: string): string {
  return ymdInTimeZone(new Date(), timeZone)
}

/** Is `tz` an IANA timezone the runtime understands? */
export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
