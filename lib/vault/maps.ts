/**
 * Live coaching-map content from the vault repo.
 *
 * A coaching map (e.g. "The 6 Components") is authored as a normal Obsidian note
 * in TheLeadershipWell-Vault. The app finds the note by TITLE (its filename,
 * anywhere in the repo), and parses the body's structure:
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
import { getVaultConfig, getTree, getBlob, type VaultConfig } from './client'

export type VaultMapComponent = { name: string; description: string; question?: string }
export type VaultMap = { name: string; blurb?: string; components: VaultMapComponent[] }

const CACHE_TTL_MS = 5 * 60_000
const cache = new Map<string, { at: number; value: VaultMap | null }>()

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Strip inline markdown down to plain text (bold/italic/highlight/links/code). */
function stripInlineMarkdown(s: string): string {
  return s
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
    const h3 = line.match(/^###\s+(.+?)\s*$/)
    if (h3) {
      flush()
      current = { name: componentName(h3[1]), desc: [], question: [], inQuestion: false }
      continue
    }
    const h12 = line.match(/^#{1,2}\s+(.+?)\s*$/)
    if (h12) {
      flush() // a new top-level heading ends any open component section
      if (!title) title = stripInlineMarkdown(h12[1])
      continue
    }

    if (!current) {
      // Preamble between the title and the first component → the map blurb.
      if (line.trim() && !line.trim().startsWith('>') && !line.trim().startsWith('![')) {
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
  const blurb = stripInlineMarkdown(blurbLines.join(' '))
  return {
    name: title || fallbackName,
    ...(blurb ? { blurb } : {}),
    components,
  }
}

/** Find the vault .md file whose filename matches the map title (anywhere in the repo). */
async function findMapPath(cfg: VaultConfig, name: string): Promise<{ path: string; sha: string } | null> {
  const want = normalizeTitle(name)
  const { entries } = await getTree(cfg)
  const matches = entries.filter(
    (e) =>
      e.type === 'blob' &&
      /\.md$/i.test(e.path) &&
      normalizeTitle((e.path.split('/').pop() || '').replace(/\.md$/i, '')) === want
  )
  if (!matches.length) return null
  // Duplicate titles across folders: prefer the shallowest path (top-level wins).
  matches.sort((a, b) => a.path.split('/').length - b.path.split('/').length)
  return { path: matches[0].path, sha: matches[0].sha }
}

/**
 * Fetch + parse a map's live content from the vault by title. Returns null when
 * the vault is unconfigured, the note is missing, or it has no component
 * sections. Never throws — a vault error degrades to the built-in copy.
 */
export async function getMapFromVault(name: string): Promise<VaultMap | null> {
  const key = normalizeTitle(name)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value

  let value: VaultMap | null = null
  try {
    const cfg = getVaultConfig()
    if (cfg) {
      const file = await findMapPath(cfg, name)
      if (file) value = parseMapMarkdown(await getBlob(cfg, file.sha), name)
    }
  } catch {
    value = null
  }
  cache.set(key, { at: Date.now(), value })
  return value
}
