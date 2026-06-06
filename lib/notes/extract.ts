/**
 * Parse a note's plain text for inline ACTION: / INSIGHT: captures.
 *
 * The note itself is the single source of truth — actions and insights are
 * derived from what the coach types, not stored separately. Any line whose
 * first word is ACTION or INSIGHT (any case, optional colon) is captured, with
 * the tag word stripped from the displayed text.
 *
 * Examples that match:
 *   ACTION: follow up on the board deck
 *   action - book 1:1 with their CFO
 *   INSIGHT: they avoid conflict when tired
 */
export interface CapturedItem {
  text: string
  /** 0-based line index in the source text, for stable ordering. */
  line: number
}

export interface NoteCaptures {
  actions: CapturedItem[]
  insights: CapturedItem[]
}

const TAG_RE = /^\s*(action|insight)s?\b\s*[:.\-–—)]*\s*/i

export function extractCaptures(plainText: string): NoteCaptures {
  const actions: CapturedItem[] = []
  const insights: CapturedItem[] = []
  if (!plainText) return { actions, insights }

  const lines = plainText.split('\n')
  lines.forEach((raw, i) => {
    const m = raw.match(TAG_RE)
    if (!m) return
    const text = raw.slice(m[0].length).trim()
    if (!text) return
    const item: CapturedItem = { text, line: i }
    if (m[1].toLowerCase() === 'action') actions.push(item)
    else insights.push(item)
  })

  return { actions, insights }
}
