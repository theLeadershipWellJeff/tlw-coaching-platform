/**
 * Session billing math (theLeadershipWell rule).
 *
 * The per-client `session_fee` is an hourly rate. Sessions are billed in
 * half-hour units with a one-hour minimum, rounding UP to the next half hour
 * once the session runs MORE than 15 minutes past the previous half-hour mark:
 *
 *   45m   -> 1.0h     55m   -> 1.0h     1h00m -> 1.0h
 *   1h15m -> 1.0h     1h16m -> 1.5h     1h20m -> 1.5h
 *   1h30m -> 1.5h     1h40m -> 1.5h     1h50m -> 2.0h
 *
 * Past-week revenue uses each note's actual logged length; the projection uses
 * the scheduled calendar-event length.
 */

/** Billed hours for a session of `minutes`, per the half-hour rounding rule. */
export function billedHours(minutes: number): number {
  const m = Math.max(0, Math.round(minutes || 0))
  let halfUnits = Math.floor(m / 30) + (m % 30 > 15 ? 1 : 0)
  if (halfUnits < 2) halfUnits = 2 // minimum one hour
  return halfUnits / 2
}

/** Revenue for one session: hourly fee × billed hours (0 if no fee on file). */
export function sessionRevenue(fee: number | null | undefined, minutes: number): number {
  const f = typeof fee === 'number' && fee > 0 ? fee : 0
  return f * billedHours(minutes)
}
