/**
 * Live coaching-map content from the vault repo.
 *
 * The coaching maps are authored as normal Obsidian notes in a `Maps/` folder in
 * TheLeadershipWell-Vault (currently `06-Wissensgarten-Knowledge-Base/Maps/`,
 * files named "Map N - Title.md" with the display title + aliases in
 * frontmatter). The vault is the source of truth: the app LISTS the maps from
 * that folder (so adding/removing/renaming a map note updates the pulldown) and
 * parses each note's body structure:
 *
 *   ## The 6 Components            ← optional display title / blurb intro
 *   ### 01 · Vision                ← one section per component (number optional)
 *   description paragraphs…
 *   > [!question] Coaching question
 *   > How clear … ?                ← the component's coaching question
 *
 * Content is fetched live (never stored), same posture as framework nudges. A
 * short in-memory cache keeps repeat opens from hammering the GitHub API. The
 * caller falls back to the built-in copy when the vault is unconfigured, the
 * note is missing, or parsing yields no components — a vault hiccup never blanks
 * the card.
 */
import matter from 'gray-matter'
import { getVaultConfig, getTree, getBlob, type VaultConfig, type TreeEntry } from './client'

export type VaultMapComponent = { name: string; description: string; question?: string }
export type VaultMap = { name: string; blurb?: string; components: VaultMapComponent[] }

type VaultMapEntry = {
  map: VaultMap | null
  /** Every name this note answers to: frontmatter title, aliases, filename (with
   *  and without the "Map N - " prefix) — all normalized. */
  names: string[]
  displayName: string
  mapNumber: number
}

const CACHE_TTL_MS = 5 * 60_000
const cache = new Map<string, { at: number; value: VaultMap | null }>()
let listCache: { at: number; value: VaultMapEntry[] | null } | null = null

/** Stored map names that predate the vault notes' current titles. */
const LEGACY_NAME_MAP: Record<string, string> = {
  'who i am becoming': 'who you are becoming',
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** "Map 2 - The Airplane Model" → "The Airplane Model" (the series prefix off). */
function stripSeriesPrefix(s: string): string {
  return s.replace(/^map\s*\d+\s*[·.\-–—:)]\s*/i, '').trim()
}

/** Strip inline markdown down to plain text (bold/italic/highlight/links/code). */
function stripInlineMarkdown(s: string): string {
  return s
    .replace(/!\[\[[^\]]*\]\]/g, '') // ![[embeds]]
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, '$2') // [[X|alias]] → alias
    .replace(/\[\[([^\]|#]+)(?:#[^\]]*)?\]\]/g, '$1') // [[X]] → X
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [text](url) → text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "01 · Vision" / "3. Metrics" / "Vision" → "Vision" (drop a leading number). */
function componentName(heading: string): string {
  return stripInlineMarkdown(heading.replace(/^\d+\s*[·.\-)]\s*/, ''))
}

/**
 * Parse a vault note's markdown into a map structure. Returns null when the body
 * has no `###` component sections — the caller then falls back to built-ins.
 */
export function parseMapMarkdown(raw: string, fallbackName: string): VaultMap | null {
  let data: Record<string, any> = {}
  let body = raw
  try {
    const parsed = matter(raw)
    data = (parsed.data || {}) as Record<string, any>
    body = parsed.content || ''
  } catch {
    // Malformed frontmatter — parse the whole file as body.
  }

  const lines = body.split(/\r?\n/)
  let title: string | null = typeof data.title === 'string' ? data.title.trim() : null
  const blurbLines: string[] = []
  // The blurb is ONLY the preamble between the note title and the first section
  // heading — the rest of the note (When to use, Related frameworks, …) is
  // reference material, not card copy.
  let blurbOpen = true
  let inFence = false
  const components: VaultMapComponent[] = []
  let current: { name: string; desc: string[]; question: string[]; inQuestion: boolean } | null = null

  const flush = () => {
    if (!current) return
    const description = stripInlineMarkdown(current.desc.join(' '))
    const question = stripInlineMarkdown(current.question.join(' '))
    if (current.name) {
      components.push({ name: current.name, description, ...(question ? { question } : {}) })
    }
    current = null
  }

  for (const line of lines) {
    // Code fences (e.g. an ASCII diagram) never feed the blurb or a description.
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const h3 = line.match(/^###\s+(.+?)\s*$/)
    if (h3) {
      flush()
      blurbOpen = false
      current = { name: componentName(h3[1]), desc: [], question: [], inQuestion: false }
      continue
    }
    const h12 = line.match(/^#{1,2}\s+(.+?)\s*$/)
    if (h12) {
      flush() // a new top-level heading ends any open component section
      if (!title) {
        title = stripSeriesPrefix(stripInlineMarkdown(h12[1])) || stripInlineMarkdown(h12[1])
      } else {
        blurbOpen = false // second heading = the preamble is over
      }
      continue
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) continue // horizontal rules

    if (!current) {
      // Preamble between the title and the first component → the map blurb.
      if (blurbOpen && line.trim() && !line.trim().startsWith('>') && !line.trim().startsWith('![')) {
        blurbLines.push(line.trim())
      }
      continue
    }

    const quoted = line.match(/^>\s?(.*)$/)
    if (quoted) {
      const inner = quoted[1].trim()
      const callout = inner.match(/^\[!([a-z-]+)\]\s*(.*)$/i)
      if (callout) {
        // Only [!question] callouts feed the coaching question; others are skipped.
        current.inQuestion = callout[1].toLowerCase() === 'question'
        continue // the callout header line ("Coaching question") is a label, not content
      }
      if (current.inQuestion && inner) current.question.push(inner)
      continue
    }

    current.inQuestion = false
    if (line.trim()) current.desc.push(line.trim())
  }
  flush()

  if (!components.length) return null
  const blurb =
    stripInlineMarkdown(blurbLines.join(' ')) ||
    (typeof data.summary === 'string' ? stripInlineMarkdown(data.summary) : '')
  return {
    name: title || fallbackName,
    ...(blurb ? { blurb } : {}),
    components,
  }
}

function fileBaseName(path: string): string {
  return (path.split('/').pop() || '').replace(/\.md$/i, '')
}

/** All the normalized names a map note answers to. */
function noteNames(path: string, data: Record<string, any>): string[] {
  const base = fileBaseName(path)
  const names = new Set<string>()
  names.add(normalizeTitle(base))
  names.add(normalizeTitle(stripSeriesPrefix(base)))
  if (typeof data.title === 'string' && data.title.trim()) names.add(normalizeTitle(data.title))
  const aliases = Array.isArray(data.aliases) ? data.aliases : []
  for (const a of aliases) {
    if (typeof a === 'string' && a.trim()) names.add(normalizeTitle(a))
  }
  names.delete('')
  return Array.from(names)
}

/** The map notes = every .md file inside a `Maps/` folder, anywhere in the repo. */
function mapTreeEntries(entries: TreeEntry[]): TreeEntry[] {
  return entries.filter(
    (e) => e.type === 'blob' && /\.md$/i.test(e.path) && /(^|\/)maps\//i.test(e.path)
  )
}

/**
 * Fetch + parse the vault's map registry (the `Maps/` folder), ordered by
 * frontmatter `map-number` then title. Returns null when the vault is
 * unconfigured or unreachable — the callers then fall back to built-ins.
 * Never throws.
 */
async function loadVaultMapEntries(): Promise<VaultMapEntry[] | null> {
  if (listCache && Date.now() - listCache.at < CACHE_TTL_MS) return listCache.value

  let value: VaultMapEntry[] | null = null
  try {
    const cfg = getVaultConfig()
    if (cfg) {
      const { entries } = await getTree(cfg)
      const files = mapTreeEntries(entries)
      const loaded = await Promise.all(
        files.map(async (f): Promise<VaultMapEntry | null> => {
          try {
            const raw = await getBlob(cfg, f.sha)
            let data: Record<string, any> = {}
            try {
              data = (matter(raw).data || {}) as Record<string, any>
            } catch {
              // Malformed frontmatter — fall back to the filename for identity.
            }
            const displayName =
              (typeof data.title === 'string' && data.title.trim()) ||
              stripSeriesPrefix(fileBaseName(f.path)) ||
              fileBaseName(f.path)
            const mapNumber = Number(data['map-number'])
            return {
              map: parseMapMarkdown(raw, displayName),
              names: noteNames(f.path, data),
              displayName,
              mapNumber: Number.isFinite(mapNumber) ? mapNumber : Number.MAX_SAFE_INTEGER,
            }
          } catch {
            return null // one unreadable note never hides the rest
          }
        })
      )
      const maps = loaded.filter((m): m is VaultMapEntry => m !== null)
      maps.sort(
        (a, b) => a.mapNumber - b.mapNumber || a.displayName.localeCompare(b.displayName)
      )
      value = maps.length ? maps : null
    }
  } catch {
    value = null
  }
  listCache = { at: Date.now(), value }
  return value
}

/**
 * The vault's map registry as pulldown options, in map-number order. Null when
 * the vault is unconfigured/unreachable (callers use the built-in names).
 */
export async function listVaultMapNames(): Promise<string[] | null> {
  const entries = await loadVaultMapEntries()
  if (!entries) return null
  return entries.map((e) => e.displayName)
}

/** Fallback for maps that live outside the Maps/ folder: find a vault .md file
 *  whose filename (with or without a "Map N - " prefix) matches the title. */
async function findMapPath(cfg: VaultConfig, name: string): Promise<{ path: string; sha: string } | null> {
  const want = normalizeTitle(name)
  const { entries } = await getTree(cfg)
  const matches = entries.filter((e) => {
    if (e.type !== 'blob' || !/\.md$/i.test(e.path)) return false
    const base = fileBaseName(e.path)
    return normalizeTitle(base) === want || normalizeTitle(stripSeriesPrefix(base)) === want
  })
  if (!matches.length) return null
  // Duplicate titles across folders: prefer the shallowest path (top-level wins).
  matches.sort((a, b) => a.path.split('/').length - b.path.split('/').length)
  return { path: matches[0].path, sha: matches[0].sha }
}

/**
 * Fetch + parse a map's live content from the vault by name. The name is matched
 * against the Maps-folder registry first (frontmatter title, aliases, filename
 * with/without the "Map N - " prefix — plus the legacy-name remap, so a client
 * assigned under an old map name keeps rendering the live note), then against
 * any note title repo-wide. Returns null when the vault is unconfigured, the
 * note is missing, or it has no component sections. Never throws — a vault
 * error degrades to the built-in copy.
 */
export async function getMapFromVault(name: string): Promise<VaultMap | null> {
  let key = normalizeTitle(name)
  key = LEGACY_NAME_MAP[key] || key
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value

  let value: VaultMap | null = null
  try {
    const registry = await loadVaultMapEntries()
    const fromRegistry = registry?.find((e) => e.names.includes(key))
    if (fromRegistry) {
      value = fromRegistry.map
    } else {
      const cfg = getVaultConfig()
      if (cfg) {
        const file = await findMapPath(cfg, key)
        if (file) value = parseMapMarkdown(await getBlob(cfg, file.sha), name)
      }
    }
  } catch {
    value = null
  }
  cache.set(key, { at: Date.now(), value })
  return value
}
