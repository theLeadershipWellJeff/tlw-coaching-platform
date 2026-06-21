/**
 * Timezone display + search helpers for the searchable timezone picker.
 *
 * Dependency-free (Intl only) so client components can import it. Searches a
 * combined index of curated major world cities (`./city-timezones`) plus every
 * IANA zone, so typing a city the coach thinks of ("Mumbai", "Dubai", "Dallas")
 * surfaces that city — mapped to the correct zone — even though the IANA database
 * only names one representative city per zone. Selecting an option stores the
 * IANA zone string.
 */
import { allTimeZones } from './scheduling'
import { MAJOR_CITIES } from './city-timezones'

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

/** "New York · America — GMT-04:00" — a one-line label for a zone. */
export function zoneLabel(zone: string, at: Date = new Date()): string {
  if (!zone) return ''
  return `${cityOf(zone)} · ${regionOf(zone)} — ${gmtOffsetLabel(zone, at)}`
}

/** A display option in the picker: a city/zone label, a context sub-label, and
 *  the IANA zone it resolves to. */
export type TzOption = { label: string; sublabel: string; zone: string }

/** Build a single search index: curated cities first (so their richer label
 *  wins), then every IANA zone by its representative city. De-duped on
 *  (label, zone) so a curated city doesn't double up with its IANA twin. */
let INDEX: TzOption[] | null = null
function getIndex(): TzOption[] {
  if (INDEX) return INDEX
  const out: TzOption[] = []
  const seen = new Set<string>()
  const push = (label: string, sublabel: string, zone: string) => {
    const key = `${label.toLowerCase()}|${zone}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ label, sublabel, zone })
  }
  for (const c of MAJOR_CITIES) push(c.city, c.sublabel, c.zone)
  for (const zone of allTimeZones()) push(cityOf(zone), regionOf(zone), zone)
  INDEX = out
  return out
}

/** A picker option for a known zone (used for favorites / the current value),
 *  preferring the curated city label when one exists for that zone. */
export function optionForZone(zone: string): TzOption {
  const curated = MAJOR_CITIES.find((c) => c.zone === zone)
  if (curated) return { label: curated.city, sublabel: curated.sublabel, zone }
  return { label: cityOf(zone), sublabel: regionOf(zone), zone }
}

/** Lowercase and strip diacritics, so "bogota" matches "Bogotá", "sao" → "São". */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Ranked search over the combined city + zone index. Matches the city label,
 * the context sub-label (country/state), the raw zone path, and the GMT offset.
 * Empty query → []. Returns best-match first, de-duped by resolved zone so the
 * list isn't crowded with multiple cities pointing at the same zone.
 */
export function searchTimezoneOptions(query: string, limit = 60): TzOption[] {
  const q = fold(query.trim())
  if (!q) return []
  const now = new Date()

  const scored: { opt: TzOption; score: number }[] = []
  for (const opt of getIndex()) {
    const city = fold(opt.label)
    const sub = fold(opt.sublabel)
    const zonePath = fold(opt.zone.replace(/_/g, ' '))
    let score = Infinity
    if (city === q) score = 0
    else if (city.startsWith(q)) score = 1
    else if (city.includes(q)) score = 2
    else if (sub.includes(q)) score = 3
    else if (zonePath.includes(q)) score = 4
    else if (gmtOffsetLabel(opt.zone, now).toLowerCase().includes(q)) score = 5
    if (score !== Infinity) scored.push({ opt, score })
  }
  scored.sort((a, b) => a.score - b.score || a.opt.label.localeCompare(b.opt.label))

  // Keep the best option per zone so one zone doesn't fill the list.
  const out: TzOption[] = []
  const zonesSeen = new Set<string>()
  for (const { opt } of scored) {
    if (zonesSeen.has(opt.zone)) continue
    zonesSeen.add(opt.zone)
    out.push(opt)
    if (out.length >= limit) break
  }
  return out
}
