/**
 * Garden access for the nudge pipeline (Phase B). Reads the derived index
 * (garden_notes + garden_edges) and, at draft time, the leaf's LIVE content from
 * the vault repo. The surfacing gate is enforced here: only `nudge_eligible` leaves
 * are ever loaded for a client-facing nudge — including related (edge) leaves, so a
 * non-surfaceable note can never leak into a draft.
 *
 * Note content is never stored; `loadFrameworkContext` pulls it fresh from GitHub.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { getVaultConfig, getContentByPath } from '@/lib/vault/client'

// What extraction needs to match a session against the coach's frameworks.
export type SurfaceableLeaf = {
  id: string
  title: string
  type: string | null
  themes: string[]
  summary: string | null
  aliases: string[]
}

// What drafting needs to write a framework nudge.
export type FrameworkDraftContext = {
  id: string
  title: string
  summary: string | null
  // Live note body pulled from the vault at draft time (null if unreadable).
  content: string | null
  // 1-hop related leaves, themselves surfaceable — light enrichment only.
  related: { title: string; summary: string | null }[]
}

/** The coach's client-surfaceable leaves (nudge_eligible = true). */
export async function loadSurfaceableLeaves(
  supabase: SupabaseClient<Database>,
  coachId: string
): Promise<SurfaceableLeaf[]> {
  const { data } = await supabase
    .from('garden_notes')
    .select('id, title, type, themes, summary, aliases')
    .eq('coach_id', coachId)
    .eq('nudge_eligible', true)
    .order('title', { ascending: true })
  return (data || []).map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    themes: r.themes || [],
    summary: r.summary,
    aliases: r.aliases || [],
  }))
}

/**
 * Full draft context for one surfaceable framework leaf: its summary, live content,
 * and surfaceable 1-hop neighbours. Returns null if the leaf isn't a surfaceable
 * leaf for this coach (defensive — the gate is enforced even on a manual pick).
 */
export async function loadFrameworkContext(
  supabase: SupabaseClient<Database>,
  coachId: string,
  leafId: string
): Promise<FrameworkDraftContext | null> {
  const { data: leaf } = await supabase
    .from('garden_notes')
    .select('id, title, summary, vault_path, nudge_eligible')
    .eq('coach_id', coachId)
    .eq('id', leafId)
    .maybeSingle()
  if (!leaf || !leaf.nudge_eligible) return null

  // Live content (best-effort — drafting falls back to the summary if unreadable).
  let content: string | null = null
  const cfg = getVaultConfig()
  if (cfg && leaf.vault_path) {
    try {
      content = await getContentByPath(cfg, leaf.vault_path)
    } catch {
      content = null
    }
  }

  // 1-hop neighbours, filtered to surfaceable leaves only (the gate).
  const { data: edges } = await supabase
    .from('garden_edges')
    .select('target_id')
    .eq('coach_id', coachId)
    .eq('source_id', leafId)
  const targetIds = Array.from(new Set((edges || []).map((e) => e.target_id)))
  let related: { title: string; summary: string | null }[] = []
  if (targetIds.length) {
    const { data: neighbours } = await supabase
      .from('garden_notes')
      .select('title, summary')
      .eq('coach_id', coachId)
      .eq('nudge_eligible', true)
      .in('id', targetIds)
    related = (neighbours || []).map((n) => ({ title: n.title, summary: n.summary }))
  }

  return { id: leaf.id, title: leaf.title, summary: leaf.summary, content, related }
}
