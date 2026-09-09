/**
 * The cached client narrative (`notes.generated_narrative`) is stored as one
 * text blob: an optional `SUBJECT: …` first line, a blank line, then the body.
 * Kept as a single column so the draft streams straight into the cache; this
 * module is the one place that splits/joins it (shared by server + client).
 */
export const SUBJECT_PREFIX = 'SUBJECT:'

export function splitNarrative(text: string | null | undefined): { subject: string; body: string } {
  const raw = (text || '').replace(/\r\n/g, '\n')
  const m = raw.match(/^\s*SUBJECT:[ \t]*(.*)\n+/)
  if (!m) return { subject: '', body: raw.trim() }
  return { subject: m[1].trim(), body: raw.slice(m[0].length).trim() }
}

export function joinNarrative(subject: string, body: string): string {
  const s = (subject || '').trim()
  const b = (body || '').trim()
  return s ? `${SUBJECT_PREFIX} ${s}\n\n${b}` : b
}

/** Default subject when the model gives none / the coach composes from blank. */
export function defaultSubject(firstName: string): string {
  return `A note from our session, ${firstName || 'there'}`
}
