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
  sessionType: string | null
  sessionNumber: number | null
  engagementTotal: number | null
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
  // Month name: May 26, 2026 / 26 May 2026
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
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

/** Pull a name + date out of a filename like "acme-jane-d-2026-06-10.md". */
function parseFilename(filename: string | null): { name: string | null; date: string | null } {
  if (!filename) return { name: null, date: null }
  const base = filename.replace(/\.[a-z0-9]+$/i, '')
  const dateMatch = base.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/)
  const date = dateMatch ? normalizeDate(dateMatch[0]) : null
  let namePart = base
  if (dateMatch) namePart = base.replace(dateMatch[0], ' ')
  const name = namePart
    .replace(/[_\-]+/g, ' ')
    .replace(/\b(transcript|session|coaching|plaud|notes?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { name: name || null, date }
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

  const sessionDate =
    normalizeDate(pick(fields, ['date', 'sessiondate', 'sessiondatetime', 'recordeddate'])) ||
    fromFile.date

  const { number, total } = parseSessionNumber(fields)

  return {
    clientNameRaw,
    clientInitials,
    sessionDate,
    sessionType: pick(fields, ['type', 'sessiontype', 'engagementtype']),
    sessionNumber: number,
    engagementTotal: total,
    body,
    isSpeakerSeparated: detectSpeakerSeparation(body),
  }
}
