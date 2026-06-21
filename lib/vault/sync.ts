/**
 * Build/refresh the `frameworks` index for a coach from their vault folder.
 *
 * Flow: read the repo tree (one call) → keep only .md files UNDER the configured
 * folder (scope #1) → for each, skip unchanged files by blob SHA, otherwise fetch +
 * parse and keep only notes carrying the nudge tag (scope #2) → resolve wikilinks to
 * linked slugs → upsert, and prune index rows whose note is gone or no longer
 * tagged. Note bodies are never stored — pointers + the link graph only.
 *
 * Safe to run on a schedule and on demand. Returns a summary for the settings UI.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { normalizeNudgeSettings } from '@/lib/nudges/settings'
import { getVaultConfig, getTree, getBlob } from './client'
import { parseFrameworkNote, slugFromPath } from './parse'

export type SyncResult = {
  configured: boolean
  message: string
  indexed: number
  ignored: number
  removed: number
  errors: string[]
}

type StagedNote = {
  slug: string
  name: string
  aliases: string[]
  trigger_signals: string[]
  when_to_use: string | null
  vault_path: string
  blob_sha: string
  // New/changed notes carry link TITLES to resolve; carried-forward (unchanged)
  // notes carry their already-resolved linked_slugs verbatim.
  linkTitles?: string[]
  linkedSlugs?: string[]
}

export async function syncFrameworks(
  supabase: SupabaseClient<Database>,
  coachId: string
): Promise<SyncResult> {
  const cfg = getVaultConfig()
  if (!cfg) {
    return res(false, 'Vault not connected — set VAULT_GITHUB_TOKEN (and VAULT_REPO) in the environment.')
  }

  const { data: coach } = await supabase
    .from('coaches')
    .select('nudge_settings')
    .eq('id', coachId)
    .maybeSingle()
  const settings = normalizeNudgeSettings(coach?.nudge_settings)
  const folder = settings.vault_folder_path
  if (!folder) {
    return res(false, 'No vault folder set — choose the folder your frameworks live in, then sync.')
  }

  // Existing index, full rows (to skip unchanged blobs and prune the gone).
  const { data: existingRows } = await supabase
    .from('frameworks')
    .select('id, slug, name, aliases, trigger_signals, when_to_use, vault_path, linked_slugs, blob_sha')
    .eq('coach_id', coachId)
  const existing = existingRows || []
  const existingByPath = new Map(existing.map((r) => [r.vault_path, r]))

  let tree
  try {
    tree = await getTree(cfg)
  } catch (e: any) {
    return res(true, `Could not read the vault repo: ${e?.message || e}`)
  }

  const prefix = `${folder}/`
  const mdFiles = tree.entries.filter(
    (e) => e.type === 'blob' && e.path.toLowerCase().endsWith('.md') && e.path.startsWith(prefix)
  )

  const errors: string[] = []
  const staged: StagedNote[] = []
  let ignored = 0

  for (const file of mdFiles) {
    const prior = existingByPath.get(file.path)
    // Unchanged tagged file → carry the existing row forward verbatim (no blob fetch).
    if (prior && prior.blob_sha === file.sha) {
      staged.push({
        slug: prior.slug,
        name: prior.name,
        aliases: prior.aliases || [],
        trigger_signals: prior.trigger_signals || [],
        when_to_use: prior.when_to_use,
        vault_path: prior.vault_path,
        blob_sha: file.sha,
        linkedSlugs: prior.linked_slugs || [],
      })
      continue
    }
    let content: string
    try {
      content = await getBlob(cfg, file.sha)
    } catch (e: any) {
      errors.push(`${file.path}: ${e?.message || e}`)
      continue
    }
    const parsed = parseFrameworkNote(content, settings.framework_tag)
    if (!parsed.isFramework) {
      ignored++
      continue
    }
    staged.push({
      slug: parsed.slug || slugFromPath(file.path),
      name: parsed.name || slugFromPath(file.path),
      aliases: parsed.aliases,
      trigger_signals: parsed.trigger_signals,
      when_to_use: parsed.when_to_use,
      vault_path: file.path,
      blob_sha: file.sha,
      linkTitles: parsed.linkTitles,
    })
  }

  // De-dupe slugs (a collision keeps the first; flag the rest).
  const bySlug = new Map<string, StagedNote>()
  for (const note of staged) {
    if (bySlug.has(note.slug)) {
      errors.push(`Duplicate slug "${note.slug}" (${note.vault_path}) — skipped.`)
      continue
    }
    bySlug.set(note.slug, note)
  }

  // Resolve wikilink titles → slugs among the tagged set; unknown titles kept raw.
  const titleToSlug = new Map<string, string>()
  for (const note of Array.from(bySlug.values())) {
    titleToSlug.set(note.name.toLowerCase(), note.slug)
    titleToSlug.set(note.slug.toLowerCase(), note.slug)
    for (const a of note.aliases) titleToSlug.set(a.toLowerCase(), note.slug)
  }

  const now = new Date().toISOString()
  const upserts: Database['public']['Tables']['frameworks']['Insert'][] = Array.from(
    bySlug.values()
  ).map((note) => ({
    coach_id: coachId,
    slug: note.slug,
    name: note.name,
    aliases: note.aliases,
    trigger_signals: note.trigger_signals,
    when_to_use: note.when_to_use,
    vault_path: note.vault_path,
    linked_slugs:
      note.linkedSlugs ??
      Array.from(new Set((note.linkTitles || []).map((t) => titleToSlug.get(t.toLowerCase()) || t))),
    blob_sha: note.blob_sha,
    last_synced_at: now,
    updated_at: now,
  }))

  if (upserts.length) {
    const { error } = await supabase
      .from('frameworks')
      .upsert(upserts, { onConflict: 'coach_id,slug' })
    if (error) return res(true, `Index write failed: ${error.message}`, 0, ignored, 0, errors)
  }

  // Prune: index rows whose slug is no longer in the tagged set.
  const keepSlugs = new Set(Array.from(bySlug.keys()))
  const toRemove = existing.filter((r) => !keepSlugs.has(r.slug))
  let removed = 0
  if (toRemove.length) {
    const { error } = await supabase
      .from('frameworks')
      .delete()
      .in('id', toRemove.map((r) => r.id))
    if (!error) removed = toRemove.length
  }

  return res(
    true,
    `Indexed ${upserts.length} framework${upserts.length === 1 ? '' : 's'} from ${folder}.`,
    upserts.length,
    ignored,
    removed,
    errors
  )
}

function res(
  configured: boolean,
  message: string,
  indexed = 0,
  ignored = 0,
  removed = 0,
  errors: string[] = []
): SyncResult {
  return { configured, message, indexed, ignored, removed, errors }
}
