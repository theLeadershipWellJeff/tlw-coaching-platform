/**
 * Parse a Plaud.ai transcript markdown file.
 *
 * Per the build decision, the client name + date live in BOTH the md front
 * matter and the filename, but their format, spelling, and order may shift. So
 * we read both sources tolerantly: a leading `--- ... ---` front-matter block
 * (keys normalized to lowercase alphanumerics) with the filename as fallback.
 * Nothing here guesses the client — it just extracts the raw signal that the
 * matcher (see match.ts) scores against the roster.
 */

export interface ParsedTranscript {
  clientNameRaw: string | null
  clientInitials: string | null
  sessionDate: string | null // YYYY-MM-DD
  sessionTime: string | null // HH:MM(:SS), local wall-clock if present
  sessionType: string | null
  sessionNumber: number | null
  engagementTotal: number | null
  titleRaw: string | null // Plaud's own summary title from front matter, if any
  // Absolute ISO instant when the timestamp carried an explicit zone (a trailing
  // `Z` or `±HH:MM` — e.g. Plaud's UTC "create time"). When set, the caller uses
  // it directly instead of re-interpreting the time in the coach's timezone.
  sessionInstant: string | null
  body: string // transcript text with front matter stripped
  isSpeakerSeparated: boolean
}

/** Normalize a front-matter key: lowercase, strip everything but a-z0-9. */
function normKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseFrontMatter(md: string): { fields: Record<string, string>; body: string } {
  const m = md.match(/^﻿?\s*---\s*\n([\s\S]*?)\n---\s*\n?/)
  if (!m) return { fields: {}, body: md }
  const fields: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = normKey(line.slice(0, idx))
    const val = line
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
    if (key && val) fields[key] = val
  }
  return { fields, body: md.slice(m[0].length) }
}

/** Pull the first value present among several candidate normalized keys. */
function pick(fields: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    if (fields[k]) return fields[k]
  }
  return null
}

/** Best-effort date normalization to YYYY-MM-DD from common formats. */
export function normalizeDate(raw: string | null): string | null {
  if (!raw) return null
  const s = raw.trim()
  // ISO-ish: 2026-05-26 (optionally with time)
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  // US: 5/26/2026 or 05-26-26
  m = s.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (m) {
    let [, mo, d, y] = m
    if (y.length === 2) y = `20${y}`
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // Month name: May 26, 2026 / 26 May 2026. Read the local calendar parts rather
  // than toISOString(), which would shift the date into UTC.
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear()
    const mo = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    return `${y}-${mo}-${d}`
  }
  return null
}

/** Derive privacy-preserving initials (spec §3), e.g. "Michel W." -> "M.W." */
export function deriveInitials(name: string | null): string | null {
  if (!name) return null
  // Already initials like "M.W." or "M.W"
  if (/^([A-Za-z]\.?){1,3}$/.test(name.replace(/\s/g, ''))) {
    const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase().split('')
    return letters.map((l) => `${l}.`).join('')
  }
  const tokens = name.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null
  return tokens.map((t) => `${t[0].toUpperCase()}.`).join('')
}

/**
 * If a timestamp carries an explicit zone — a trailing `Z` or a `±HH:MM` offset —
 * it names an absolute instant, not a local wall-clock. Return its ISO instant so
 * the caller uses it directly instead of re-interpreting it in the coach's zone.
 * (Plaud's "create time" arrives as UTC, e.g. "2026-06-05T13:37:22Z"; read as a
 * local wall-clock it would land the calendar lookup hours off.)
 */
function absoluteInstant(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?\s*(Z|[+-]\d{2}:?\d{2})/)
  if (!m) return null
  const zone = m[7] === 'Z' ? 'Z' : m[7].replace(/^([+-]\d{2}):?(\d{2})$/, '$1:$2')
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}${zone}`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Pull a wall-clock time "HH:MM(:SS)" from a string, or null. */
function extractTime(raw: string | null): string | null {
  if (!raw) return null
  // Require two digits after the colon so "1:1" (as in "1:1 coaching") is ignored.
  const m = raw.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/)
  if (!m) return null
  const hh = m[1].padStart(2, '0')
  return `${hh}:${m[2]}${m[3] ? `:${m[3]}` : ''}`
}

function parseIntOrNull(v: string | null): number | null {
  if (!v) return null
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

/** "session 3 of 12" -> { number: 3, total: 12 } */
function parseSessionNumber(fields: Record<string, string>): { number: number | null; total: number | null } {
  const sess = pick(fields, ['session', 'sessionnumber', 'sessionno', 'number'])
  // Prefer an "X of Y" / "X / Y" form wherever it appears — it carries both.
  if (sess) {
    const m = sess.match(/(\d+)\s*(?:of|\/)\s*(\d+)/i)
    if (m) return { number: parseInt(m[1], 10), total: parseInt(m[2], 10) }
  }
  return {
    number: parseIntOrNull(sess),
    total: parseIntOrNull(pick(fields, ['engagementtotal', 'totalsessions', 'sessions', 'of'])),
  }
}

/**
 * Pull name + date + time out of a filename/title. Handles both a bare Plaud
 * timestamp ("2026-06-12 16:05:41" — date+time, no name) and a named file
 * ("acme-jane-2026-06-10.md").
 */
function parseFilename(
  filename: string | null
): { name: string | null; date: string | null; time: string | null; instant: string | null } {
  if (!filename) return { name: null, date: null, time: null, instant: null }
  const base = filename.replace(/\.[a-z0-9]+$/i, '')

  // Full timestamp first: date + time together (Plaud's default title).
  const tsMatch = base.match(/(\d{4})-(\d{1,2})-(\d{1,2})[ T_]+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (tsMatch) {
    const date = normalizeDate(tsMatch[0])
    const time = extractTime(tsMatch[0])
    const namePart = base.replace(tsMatch[0], ' ')
    const name = cleanName(namePart)
    return { name: name || null, date, time, instant: absoluteInstant(base) }
  }

  const dateMatch = base.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/)
  const date = dateMatch ? normalizeDate(dateMatch[0]) : null
  let namePart = base
  if (dateMatch) namePart = base.replace(dateMatch[0], ' ')
  return { name: cleanName(namePart) || null, date, time: null, instant: null }
}

function cleanName(s: string): string {
  return s
    .replace(/[_\-]+/g, ' ')
    .replace(/\b(transcript|session|coaching|plaud|notes?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Heuristic: does this look like a speaker-separated verbatim transcript?
 * Required for the conversation metrics (spec §12). We look for repeated
 * "Speaker:" line starts (VTT cue names, "Coach:"/"Jeff:", or "Name:").
 */
function detectSpeakerSeparation(body: string): boolean {
  const lines = body.split('\n')
  let labeled = 0
  const speakers = new Set<string>()
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z][A-Za-z .'-]{1,30}|Speaker\s*\d+)\s*:/)
    if (m) {
      labeled++
      speakers.add(m[1].trim().toLowerCase())
    }
  }
  // Need a few labeled turns and at least two distinct speakers.
  return labeled >= 6 && speakers.size >= 2
}

export function parseTranscript(filename: string | null, md: string): ParsedTranscript {
  const { fields, body } = parseFrontMatter(md)
  const fromFile = parseFilename(filename)

  const clientNameRaw =
    pick(fields, ['client', 'clientname', 'name', 'coachee', 'participant']) || fromFile.name

  const explicitInitials = pick(fields, ['clientinitials', 'initials'])
  const clientInitials = explicitInitials
    ? deriveInitials(explicitInitials)
    : deriveInitials(clientNameRaw)

  const dateField = pick(fields, ['date', 'sessiondate', 'sessiondatetime', 'recordeddate'])
  const sessionDate = normalizeDate(dateField) || fromFile.date
  const sessionTime = extractTime(dateField) || fromFile.time
  const sessionInstant = absoluteInstant(dateField) || fromFile.instant

  const { number, total } = parseSessionNumber(fields)

  return {
    clientNameRaw,
    clientInitials,
    sessionDate,
    sessionTime,
    sessionType: pick(fields, ['type', 'sessiontype', 'engagementtype']),
    sessionNumber: number,
    engagementTotal: total,
    titleRaw: pick(fields, ['title', 'topic', 'subject', 'summary']),
    sessionInstant,
    body,
    isSpeakerSeparated: detectSpeakerSeparation(body),
  }
}

// ── Proposed transcript titles ────────────────────────────────────────────────

/** "2026-06-12" -> "Jun 12, 2026" (read the calendar parts, no TZ shift). */
export function formatSessionDate(date: string | null): string | null {
  if (!date) return null
  const m = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return null
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(dt.getTime())) return null
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Plaud's default filename is a bare timestamp ("2026-06-12 16:05:41") — not a
 *  real title, so we never surface it as one. */
function isTimestampName(filename: string): boolean {
  const base = filename.replace(/\.[a-z0-9]+$/i, '').trim()
  return /^\d{4}-\d{1,2}-\d{1,2}[ T_]+\d{1,2}:\d{2}(?::\d{2})?$/.test(base)
}

/** Light clean for using a filename as a title: drop the extension and turn
 *  separators into spaces. Keeps the words (unlike cleanName, which strips
 *  "session/coaching/…" for name-matching). */
function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const MAX_TITLE = 80

function clip(s: string): string {
  const t = s.trim()
  return t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE - 1).trimEnd()}…` : t
}

/**
 * Compose the best available human title for a transcript. Priority (the
 * calendar slot is the ideal source, per the coach):
 *   1. Matched client → "Client Name · Mon DD, YYYY" — the calendar/name match
 *      supplies the client; the date anchors it.
 *   2. Plaud's own summary title from the md front matter.
 *   3. A real filename (e.g. Plaud's Drive summary), when it isn't a bare timestamp.
 *   4. Date only → "Session · Mon DD, YYYY".
 *   5. null → the UI falls back to the filename / "Untitled recording".
 */
export function buildTranscriptTitle(opts: {
  clientName?: string | null
  sessionDate?: string | null
  summaryRaw?: string | null
  filename?: string | null
}): string | null {
  const dateLabel = formatSessionDate(opts.sessionDate ?? null)

  if (opts.clientName?.trim()) {
    const name = opts.clientName.trim()
    return dateLabel ? `${name} · ${dateLabel}` : name
  }
  if (opts.summaryRaw?.trim()) return clip(opts.summaryRaw)
  if (opts.filename && !isTimestampName(opts.filename)) {
    const cleaned = titleFromFilename(opts.filename)
    if (cleaned) return clip(cleaned)
  }
  if (dateLabel) return `Session · ${dateLabel}`
  return null
}
