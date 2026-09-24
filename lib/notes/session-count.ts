/**
 * Does a note count as a coaching session? (QA TLW-002)
 *
 * Coaching hours (the ICF log + PDF), the revenue tiles and billing-session
 * derivation all read sessions off `notes`. Before this rule every note counted
 * — including an empty one created by opening "+ New session notes" and walking
 * away — so each stray note became a paid 60-minute hour.
 *
 * A note counts when it has any text. A session logged by hand from the
 * Coaching hours widget has no prose, so it is written with
 * LOGGED_SESSION_CONTENT and counts by that.
 *
 * Pure and dependency-free. This is a counting rule, not a view filter: notes of
 * every status still flow to every other consumer unchanged.
 */

/** Body written for a session logged from the Coaching hours widget. */
export const LOGGED_SESSION_CONTENT = '<p><em>Session logged from Coaching hours.</em></p>'

/** Visible text of a note's HTML body (tags + entities + whitespace stripped). */
function visibleText(html: string | null | undefined): string {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function noteCountsAsSession(note: { content?: string | null }): boolean {
  return visibleText(note.content).length > 0
}

/**
 * Collapse notes that record the SAME calendar session (same Google event id)
 * to one — the first in the given order wins. Notes with no event id are kept
 * as-is: two notes on one date can be two real sessions.
 */
export function dedupeByCalendarEvent<T extends { calendar_event_id?: string | null }>(notes: T[]): T[] {
  const seen = new Set<string>()
  return notes.filter((n) => {
    const key = n.calendar_event_id?.trim()
    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
