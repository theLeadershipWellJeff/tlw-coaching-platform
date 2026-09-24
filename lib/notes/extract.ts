/**
 * Parse a note's plain text for inline ACTION: / INSIGHT: / NEXT TIME captures.
 *
 * The note itself is the single source of truth — actions, insights, and
 * next-session flags are derived from what the coach types, not stored
 * separately. Any line whose first word(s) are ACTION, INSIGHT, or NEXT
 * TIME / NEXT SESSION (any case, optional colon) is captured, with the tag
 * stripped from the displayed text.
 *
 * Examples that match:
 *   ACTION: follow up on the board deck
 *   action - book 1:1 with their CFO
 *   INSIGHT: they avoid conflict when tired
 *   NEXT TIME: revisit the delegation map
 *   next session — check in on the CFO conversation
 */
export interface CapturedItem {
  text: string
  /** 0-based line index in the source text, for stable ordering. */
  line: number
}

export interface NoteCaptures {
  actions: CapturedItem[]
  insights: CapturedItem[]
  /** "NEXT TIME" / "NEXT SESSION" flags the coach left for the next session. */
  nextSession: CapturedItem[]
}

const TAG_RE = /^\s*(action|insight)s?\b\s*[:.\-–—)]*\s*/i
// "NEXT TIME" / "NEXT SESSION" (also a bare "NEXT:") — a note-to-self for the
// coming session. "next time/session" matches with or without a delimiter; a
// bare "next" needs an explicit delimiter so ordinary prose ("Next we discussed
// …") isn't captured. Checked before TAG_RE (distinct prefixes; order-harmless).
const NEXT_RE = /^\s*next(?:\s+(?:time|session)\b\s*[:.\-–—)]*|\s*[:.\-–—)]+)\s*/i

/**
 * Canonical form of a captured line: every whitespace run (incl. the
 * non-breaking spaces a browser's textContent keeps but a regex HTML strip
 * turns into plain spaces) collapsed to one space, trimmed. Action rows are
 * matched to note lines BY THIS STRING — the editor, the server-side sync and
 * the send path must all agree, or a sync deletes an emailed action and its
 * link stops working (QA TLW-004).
 */
export function normalizeCaptureText(s: string): string {
  return String(s || '').replace(/\s+/g, ' ').trim()
}

export function extractCaptures(plainText: string): NoteCaptures {
  const actions: CapturedItem[] = []
  const insights: CapturedItem[] = []
  const nextSession: CapturedItem[] = []
  if (!plainText) return { actions, insights, nextSession }

  const lines = plainText.split('\n')
  lines.forEach((raw, i) => {
    const nextM = raw.match(NEXT_RE)
    if (nextM) {
      const text = normalizeCaptureText(raw.slice(nextM[0].length))
      if (text) nextSession.push({ text, line: i })
      return
    }
    const m = raw.match(TAG_RE)
    if (!m) return
    const text = normalizeCaptureText(raw.slice(m[0].length))
    if (!text) return
    const item: CapturedItem = { text, line: i }
    if (m[1].toLowerCase() === 'action') actions.push(item)
    else insights.push(item)
  })

  return { actions, insights, nextSession }
}
