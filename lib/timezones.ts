/**
 * Timezone display + search helpers for the searchable timezone picker.
 *
 * Dependency-free (Intl only) so client components can import it. Builds on the
 * shared zone list in `./scheduling` and adds: a current GMT-offset label, a
 * city/region label, a curated city-alias map (so typing a major city that
 * isn't literally in the IANA name — "Dallas", "Seattle" — still resolves), and
 * a ranked search over all of it.
 */
import { allTimeZones } from './scheduling'

/** The city portion of an IANA zone — its last path segment, spaced out.
 *  e.g. "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function cityOf(zone: string): string {
  const seg = zone.split('/').pop() || zone
  return seg.replace(/_/g, ' ')
}

/** The region portion — the first path segment. e.g. "America/New_York" → "America". */
export function regionOf(zone: string): string {
  return (zone.split('/')[0] || '').replace(/_/g, ' ')
}

/** Current offset of `zone` from UTC, in minutes (DST-correct for `at`). */
function offsetMinutes(zone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
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
  return Math.round((asUTC - at.getTime()) / 60000)
}

/** A "GMT-06:00" / "GMT+05:30" / "GMT" label for `zone`, for the current date. */
export function gmtOffsetLabel(zone: string, at: Date = new Date()): string {
  let mins: number
  try {
    mins = offsetMinutes(zone, at)
  } catch {
    return 'GMT'
  }
  if (mins === 0) return 'GMT'
  const sign = mins > 0 ? '+' : '-'
  const abs = Math.abs(mins)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `GMT${sign}${hh}:${mm}`
}

/** "New York · America — GMT-04:00" — the option label in the dropdown. */
export function zoneLabel(zone: string, at: Date = new Date()): string {
  if (!zone) return ''
  return `${cityOf(zone)} · ${regionOf(zone)} — ${gmtOffsetLabel(zone, at)}`
}

/**
 * Common city names that don't appear in (or differ from) the IANA zone, mapped
 * to their zone — so the coach can type the city they think in. Keys are lower-
 * case. Not exhaustive; the IANA city names themselves are also matched directly.
 */
export const CITY_ALIASES: Record<string, string> = {
  // US — Eastern
  nyc: 'America/New_York',
  'new york city': 'America/New_York',
  manhattan: 'America/New_York',
  brooklyn: 'America/New_York',
  boston: 'America/New_York',
  philadelphia: 'America/New_York',
  philly: 'America/New_York',
  atlanta: 'America/New_York',
  miami: 'America/New_York',
  orlando: 'America/New_York',
  tampa: 'America/New_York',
  'washington dc': 'America/New_York',
  washington: 'America/New_York',
  dc: 'America/New_York',
  charlotte: 'America/New_York',
  raleigh: 'America/New_York',
  cincinnati: 'America/New_York',
  columbus: 'America/New_York',
  cleveland: 'America/New_York',
  pittsburgh: 'America/New_York',
  baltimore: 'America/New_York',
  // US — Central
  chicago: 'America/Chicago',
  dallas: 'America/Chicago',
  'fort worth': 'America/Chicago',
  houston: 'America/Chicago',
  austin: 'America/Chicago',
  'san antonio': 'America/Chicago',
  'new orleans': 'America/Chicago',
  'kansas city': 'America/Chicago',
  minneapolis: 'America/Chicago',
  'st paul': 'America/Chicago',
  milwaukee: 'America/Chicago',
  memphis: 'America/Chicago',
  nashville: 'America/Chicago',
  'st louis': 'America/Chicago',
  'oklahoma city': 'America/Chicago',
  tulsa: 'America/Chicago',
  // US — Mountain
  denver: 'America/Denver',
  'salt lake city': 'America/Denver',
  albuquerque: 'America/Denver',
  boise: 'America/Denver',
  // US — Mountain (no DST)
  phoenix: 'America/Phoenix',
  tucson: 'America/Phoenix',
  mesa: 'America/Phoenix',
  scottsdale: 'America/Phoenix',
  // US — Pacific
  'los angeles': 'America/Los_Angeles',
  la: 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles',
  sf: 'America/Los_Angeles',
  'san diego': 'America/Los_Angeles',
  'san jose': 'America/Los_Angeles',
  seattle: 'America/Los_Angeles',
  portland: 'America/Los_Angeles',
  sacramento: 'America/Los_Angeles',
  oakland: 'America/Los_Angeles',
  'las vegas': 'America/Los_Angeles',
  // US — other
  anchorage: 'America/Anchorage',
  hawaii: 'Pacific/Honolulu',
  honolulu: 'Pacific/Honolulu',
  // Canada / Mexico
  toronto: 'America/Toronto',
  ottawa: 'America/Toronto',
  montreal: 'America/Toronto',
  vancouver: 'America/Vancouver',
  calgary: 'America/Edmonton',
  'mexico city': 'America/Mexico_City',
  // Europe
  london: 'Europe/London',
  dublin: 'Europe/Dublin',
  paris: 'Europe/Paris',
  berlin: 'Europe/Berlin',
  munich: 'Europe/Berlin',
  frankfurt: 'Europe/Berlin',
  madrid: 'Europe/Madrid',
  barcelona: 'Europe/Madrid',
  rome: 'Europe/Rome',
  milan: 'Europe/Rome',
  amsterdam: 'Europe/Amsterdam',
  zurich: 'Europe/Zurich',
  geneva: 'Europe/Zurich',
  stockholm: 'Europe/Stockholm',
  // Middle East / Asia / Pacific
  dubai: 'Asia/Dubai',
  'abu dhabi': 'Asia/Dubai',
  'tel aviv': 'Asia/Jerusalem',
  mumbai: 'Asia/Kolkata',
  delhi: 'Asia/Kolkata',
  bangalore: 'Asia/Kolkata',
  bengaluru: 'Asia/Kolkata',
  singapore: 'Asia/Singapore',
  'hong kong': 'Asia/Hong_Kong',
  tokyo: 'Asia/Tokyo',
  beijing: 'Asia/Shanghai',
  shanghai: 'Asia/Shanghai',
  seoul: 'Asia/Seoul',
  sydney: 'Australia/Sydney',
  melbourne: 'Australia/Melbourne',
  auckland: 'Pacific/Auckland',
  // South America
  'sao paulo': 'America/Sao_Paulo',
  'são paulo': 'America/Sao_Paulo',
  'buenos aires': 'America/Argentina/Buenos_Aires',
  bogota: 'America/Bogota',
  lima: 'America/Lima',
}

/**
 * Ranked timezone search. Matches a typed city/zone/region/offset (and the
 * curated aliases) and returns zones best-match first. Empty query → [].
 */
export function searchTimezones(query: string, zones: string[] = allTimeZones()): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const now = new Date()

  // Zones an alias city points at, when the typed text matches that city.
  const aliasTargets = new Set<string>()
  for (const [city, zone] of Object.entries(CITY_ALIASES)) {
    if (city.includes(q)) aliasTargets.add(zone)
  }

  const scored: { zone: string; score: number; city: string }[] = []
  for (const zone of zones) {
    const city = cityOf(zone).toLowerCase()
    const region = regionOf(zone).toLowerCase()
    const full = zone.toLowerCase().replace(/_/g, ' ')
    const offset = gmtOffsetLabel(zone, now).toLowerCase()

    let score = Infinity
    if (city === q) score = 0
    else if (city.startsWith(q)) score = 1
    else if (aliasTargets.has(zone)) score = 1.5
    else if (city.includes(q)) score = 2
    else if (full.includes(q)) score = 3
    else if (region.includes(q)) score = 4
    else if (offset.includes(q)) score = 5

    if (score !== Infinity) scored.push({ zone, score, city })
  }
  scored.sort((a, b) => a.score - b.score || a.city.localeCompare(b.city))
  return scored.map((s) => s.zone)
}
