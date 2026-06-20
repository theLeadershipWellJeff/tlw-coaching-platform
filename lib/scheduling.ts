/**
 * Per-coach scheduling settings — shared types, defaults, and pure helpers.
 *
 * Kept dependency-free (no googleapis / no server-only imports) so the Account
 * settings UI, the workspace scheduler, the schedule API, and the reminder cron
 * all read the same shapes. Persisted as jsonb on `coaches` (migration 020);
 * a NULL column means "use the defaults" so existing coaches are unchanged.
 */

// ----- Availability (bookable hours per weekday) ---------------------------

/** One weekday's bookable window. `start`/`end` are wall-clock "HH:MM" in the
 *  coach's own timezone. A day with `enabled: false` is treated as off. */
export type DayAvailability = {
  enabled: boolean
  start: string // "HH:MM" (24h)
  end: string // "HH:MM" (24h)
}

/** Keyed "0".."6" = Sunday..Saturday (JS getDay order). */
export type CoachAvailability = Record<string, DayAvailability>

export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** A normal Mon–Fri 9–5 week — the fallback when a coach hasn't customized. */
export function defaultAvailability(): CoachAvailability {
  const out: CoachAvailability = {}
  for (let d = 0; d < 7; d++) {
    out[String(d)] = { enabled: d >= 1 && d <= 5, start: '09:00', end: '17:00' }
  }
  return out
}

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/

/** Coerce stored/posted availability into a complete, valid 7-day map. Bad or
 *  missing days fall back to the default for that day so the shape is total. */
export function normalizeAvailability(raw: unknown): CoachAvailability {
  const base = defaultAvailability()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const src = raw as Record<string, unknown>
  for (let d = 0; d < 7; d++) {
    const key = String(d)
    const v = src[key]
    if (!v || typeof v !== 'object') continue
    const day = v as Record<string, unknown>
    const start = typeof day.start === 'string' && TIME_RE.test(day.start) ? day.start : base[key].start
    const end = typeof day.end === 'string' && TIME_RE.test(day.end) ? day.end : base[key].end
    base[key] = { enabled: Boolean(day.enabled), start, end }
  }
  return base
}

/** Minutes-since-midnight for an "HH:MM" string (NaN if malformed). */
function hhmmToMinutes(s: string): number {
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return NaN
  return Number(m[1]) * 60 + Number(m[2])
}

/** The wall-clock weekday (0–6) and minutes-since-midnight of an instant as it
 *  reads on a clock in `timeZone`. */
function wallClockParts(at: Date, timeZone: string): { day: number; minutes: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts: Record<string, string> = {}
  for (const p of dtf.formatToParts(at)) parts[p.type] = p.value
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const day = dayMap[parts.weekday] ?? new Date(at).getUTCDay()
  const minutes = Number(parts.hour) * 60 + Number(parts.minute)
  return { day, minutes }
}

/**
 * Does a session starting at `startsAt` for `durationMinutes` fall entirely
 * within the coach's bookable hours (read in the coach's timezone)? Used to
 * WARN (never block) when the coach picks an out-of-hours slot. A start outside
 * the window, or a run past the window's end, counts as outside.
 */
export function isWithinAvailability(
  startsAt: Date,
  durationMinutes: number,
  availability: CoachAvailability,
  timeZone: string
): boolean {
  const { day, minutes } = wallClockParts(startsAt, timeZone)
  const win = availability[String(day)]
  if (!win || !win.enabled) return false
  const open = hhmmToMinutes(win.start)
  const close = hhmmToMinutes(win.end)
  if (Number.isNaN(open) || Number.isNaN(close)) return false
  return minutes >= open && minutes + durationMinutes <= close
}

// ----- Reminders -----------------------------------------------------------

/** One "X hours before the session" nudge. */
export type ReminderRule = {
  hoursBefore: number
  enabled: boolean
}

export type ReminderSettings = {
  /** Send the booking-confirmation email at schedule time. */
  confirmation: boolean
  /** Pre-session nudges, each at its own lead time. */
  reminders: ReminderRule[]
}

/** Confirmation on + a single 24h nudge — matches the original behavior. */
export function defaultReminderSettings(): ReminderSettings {
  return { confirmation: true, reminders: [{ hoursBefore: 24, enabled: true }] }
}

// Lead times a coach may choose from in the UI (hours before the session).
export const REMINDER_LEAD_OPTIONS = [1, 2, 3, 6, 12, 24, 48, 72] as const
const MAX_LEAD_HOURS = 24 * 14

/** Coerce stored/posted reminder settings into a valid shape. */
export function normalizeReminderSettings(raw: unknown): ReminderSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultReminderSettings()
  const src = raw as Record<string, unknown>
  const confirmation = src.confirmation === undefined ? true : Boolean(src.confirmation)
  const rawList = Array.isArray(src.reminders) ? src.reminders : []
  const seen = new Set<number>()
  const reminders: ReminderRule[] = []
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const hoursBefore = Math.round(Number(r.hoursBefore))
    if (!Number.isFinite(hoursBefore) || hoursBefore <= 0 || hoursBefore > MAX_LEAD_HOURS) continue
    if (seen.has(hoursBefore)) continue
    seen.add(hoursBefore)
    reminders.push({ hoursBefore, enabled: Boolean(r.enabled) })
  }
  reminders.sort((a, b) => a.hoursBefore - b.hoursBefore)
  return { confirmation, reminders }
}

/**
 * The (appointment_id, kind) slot name a nudge claims in `appointment_reminders`.
 * 24h keeps the legacy `nudge_24h` name so already-sent rows still dedupe after
 * the upgrade; any other lead time gets `nudge_<n>h`.
 */
export function reminderKind(hoursBefore: number): string {
  return `nudge_${hoursBefore}h`
}

/** All enabled lead times for a coach, longest first (so we look ahead far
 *  enough in the cron's window). */
export function enabledLeadHours(settings: ReminderSettings): number[] {
  return settings.reminders
    .filter((r) => r.enabled)
    .map((r) => r.hoursBefore)
    .sort((a, b) => b - a)
}

// ----- Timezone option list (shared by the settings + scheduler UIs) -------

/** A curated US-first shortlist; the full IANA list follows in the pickers. */
export const COMMON_TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
]

/** The full IANA zone list when the runtime supports it, else the shortlist. */
export function allTimeZones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
    if (typeof fn === 'function') return fn('timeZone')
  } catch {
    /* ignore */
  }
  return COMMON_TIMEZONES
}

/** The shortlist first, then everything else alphabetically — for a <select>. */
export function orderedTimeZones(): string[] {
  const full = allTimeZones()
  const rest = full.filter((z) => !COMMON_TIMEZONES.includes(z)).sort()
  return [...COMMON_TIMEZONES.filter((z) => full.includes(z) || z === 'UTC'), ...rest]
}
