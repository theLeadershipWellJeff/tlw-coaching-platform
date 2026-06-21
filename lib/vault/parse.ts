/**
 * Parse a vault markdown note into the bits the garden index needs.
 *
 * Two jobs:
 *  1. Read the YAML frontmatter (gray-matter) → id/title/type/themes/summary/
 *     nudge_eligible/aliases, and whether the note is an indexable LEAF.
 *  2. Collect link titles for the association graph — from the `parent:` and
 *     `frameworks:` frontmatter fields and from inline body `[[wikilinks]]` (each
 *     tagged with its relation; resolved to ids later, once the leaf set is known).
 *
 * Leaf gate: a note is indexable iff its frontmatter carries `nudge_eligible`
 * (equivalently, a `themes` array) — NOT a `type` value, because client-facing
 * leaves are deliberately heterogeneous in type.
 *
 * Body content is parsed but NEVER stored — the index keeps pointers only.
 */
import matter from 'gray-matter'

export type LinkRef = { title: string; relation: 'parent' | 'framework' | 'link' }

export type ParsedLeaf = {
  isLeaf: boolean
  id: string | null
  title: string | null
  type: string | null
  themes: string[]
  summary: string | null
  nudgeEligible: boolean
  aliases: string[]
  links: LinkRef[]
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === 'string' && v.trim()) return [v.trim()]
  return []
}

function truthy(v: unknown): boolean {
  return v === true || v === 'true' || v === 1
}

// [[Target]] or [[Target|alias]] or [[Target#heading]] → "Target".
const WIKILINK_RE = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g

export function extractWikilinkTitles(body: string): string[] {
  const out = new Set<string>()
  let m: RegExpExecArray | null
  WIKILINK_RE.lastIndex = 0
  while ((m = WIKILINK_RE.exec(body || '')) !== null) {
    const title = m[1].trim()
    if (title) out.add(title)
  }
  return Array.from(out)
}

/**
 * Pull link titles from a frontmatter field that may hold wikilinks. Handles a
 * string ("[[Hope]]") or a list (["[[Hope]]", "Clarity"]); a plain (non-wikilink)
 * value is taken verbatim as a title so `parent: Hope` works too.
 */
function fieldLinkTitles(value: unknown): string[] {
  const raws: string[] = Array.isArray(value)
    ? value.map((x) => String(x))
    : value != null && value !== ''
      ? [String(value)]
      : []
  const out: string[] = []
  for (const raw of raws) {
    const wl = extractWikilinkTitles(raw)
    if (wl.length) out.push(...wl)
    else if (raw.trim()) out.push(raw.trim())
  }
  return out
}

export function parseGardenNote(raw: string): ParsedLeaf {
  let data: Record<string, any> = {}
  let body = raw
  try {
    const parsed = matter(raw)
    data = (parsed.data || {}) as Record<string, any>
    body = parsed.content || ''
  } catch {
    // Malformed frontmatter → treat as non-leaf (ignored), never throw the sync.
    return empty()
  }

  // Leaf gate: nudge_eligible present, or a themes array present.
  const isLeaf = 'nudge_eligible' in data || Array.isArray(data.themes)
  if (!isLeaf) return empty()

  const id = typeof data.id === 'string' ? data.id.trim().toLowerCase() : null
  const title = typeof data.title === 'string' ? data.title.trim() : null

  const links: LinkRef[] = [
    ...fieldLinkTitles(data.parent).map((title) => ({ title, relation: 'parent' as const })),
    ...fieldLinkTitles(data.frameworks).map((title) => ({ title, relation: 'framework' as const })),
    ...extractWikilinkTitles(body).map((title) => ({ title, relation: 'link' as const })),
  ]

  return {
    isLeaf: true,
    id: id || null,
    title: title || null,
    type: typeof data.type === 'string' ? data.type.trim() : null,
    themes: toStringArray(data.themes),
    summary: typeof data.summary === 'string' ? data.summary.trim() : null,
    nudgeEligible: truthy(data.nudge_eligible),
    aliases: toStringArray(data.aliases),
    links,
  }
}

function empty(): ParsedLeaf {
  return {
    isLeaf: false,
    id: null,
    title: null,
    type: null,
    themes: [],
    summary: null,
    nudgeEligible: false,
    aliases: [],
    links: [],
  }
}

/** Derive an id from a file path when frontmatter omits one (basename, kebab). */
export function idFromPath(path: string): string {
  const base = path.split('/').pop() || path
  return base
    .replace(/\.md$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
