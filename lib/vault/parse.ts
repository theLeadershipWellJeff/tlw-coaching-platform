/**
 * Parse a vault markdown note into the bits the framework index needs.
 *
 * Two jobs:
 *  1. Read the YAML frontmatter (gray-matter) → slug/name/aliases/trigger_signals/
 *     when_to_use, and whether the configured nudge tag is present + true.
 *  2. Extract `[[wikilinks]]` from the body → link titles (resolved to slugs later,
 *     once the full tagged set is known).
 *
 * Body content is parsed but NEVER stored — the index keeps pointers only.
 */
import matter from 'gray-matter'

export type ParsedFramework = {
  isFramework: boolean
  slug: string | null
  name: string | null
  aliases: string[]
  trigger_signals: string[]
  when_to_use: string | null
  linkTitles: string[]
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === 'string' && v.trim()) return [v.trim()]
  return []
}

// [[Target]] or [[Target|alias]] or [[Target#heading]] → "Target".
const WIKILINK_RE = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g

export function extractWikilinkTitles(body: string): string[] {
  const out = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = WIKILINK_RE.exec(body || '')) !== null) {
    const title = m[1].trim()
    if (title) out.add(title)
  }
  return Array.from(out)
}

/**
 * Parse one note. `tag` is the frontmatter key that marks a note nudgeable
 * (default "framework"); a note counts only when that key is present and truthy.
 */
export function parseFrameworkNote(raw: string, tag = 'framework'): ParsedFramework {
  let data: Record<string, any> = {}
  let body = raw
  try {
    const parsed = matter(raw)
    data = (parsed.data || {}) as Record<string, any>
    body = parsed.content || ''
  } catch {
    // Malformed frontmatter → treat as untagged (ignored), never throw the sync.
    return empty()
  }

  const tagVal = data[tag]
  const isFramework = tagVal === true || tagVal === 'true' || tagVal === 1
  if (!isFramework) return empty()

  const slug = typeof data.slug === 'string' ? data.slug.trim().toLowerCase() : null
  const name = typeof data.name === 'string' ? data.name.trim() : null

  return {
    isFramework: true,
    slug: slug || null,
    name: name || null,
    aliases: toStringArray(data.aliases),
    trigger_signals: toStringArray(data.trigger_signals),
    when_to_use: typeof data.when_to_use === 'string' ? data.when_to_use.trim() : null,
    linkTitles: extractWikilinkTitles(body),
  }
}

function empty(): ParsedFramework {
  return {
    isFramework: false,
    slug: null,
    name: null,
    aliases: [],
    trigger_signals: [],
    when_to_use: null,
    linkTitles: [],
  }
}

/** Derive a slug from a file path when frontmatter omits one (basename, kebab). */
export function slugFromPath(path: string): string {
  const base = path.split('/').pop() || path
  return base
    .replace(/\.md$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
