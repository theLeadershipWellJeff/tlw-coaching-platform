/**
 * Nudge settings — canonical shape, defaults, and normalize. Dependency-free
 * (mirrors lib/scheduling.ts) so the settings UI, the generator, the send path,
 * and the cron all read one source of truth. A coach's `nudge_settings` column is
 * NULL until they change something, so these defaults govern every coach until then.
 */
import type { NudgeSettings } from '@/lib/supabase/types'

export const DEFAULT_NUDGE_SETTINGS: NudgeSettings = {
  // Spacing: never send a nudge if the client got any communication within this
  // many days (cross-cutting rule §3.4).
  nudge_spacing_days: 4,
  // Re-engagement cadence (Phase A.5) — first touch after this many days with no
  // booked session; stop after this many touches.
  reengagement_first_after_days: 10,
  reengagement_max_touches: 2,
  // Vault connection (migrations 023/024) — the one folder the garden indexer
  // reads. Empty path = not yet configured (the sync no-ops until the coach points
  // it at a folder). Leaves are detected structurally, so there is no tag.
  vault_folder_path: '',
}

/**
 * The most nudges to draft for one client per inter-session window (§3.3). Fixed,
 * not coach-configurable — restraint is a product guarantee, not a dial.
 */
export const MAX_NUDGES_PER_WINDOW = 2

/** Coerce a stored (possibly partial / NULL) settings blob to a complete shape. */
export function normalizeNudgeSettings(raw: unknown): NudgeSettings {
  const r = (raw ?? {}) as Partial<NudgeSettings>
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : fallback
  const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v.trim() : fallback)
  return {
    nudge_spacing_days: num(r.nudge_spacing_days, DEFAULT_NUDGE_SETTINGS.nudge_spacing_days),
    reengagement_first_after_days: num(
      r.reengagement_first_after_days,
      DEFAULT_NUDGE_SETTINGS.reengagement_first_after_days
    ),
    reengagement_max_touches: num(
      r.reengagement_max_touches,
      DEFAULT_NUDGE_SETTINGS.reengagement_max_touches
    ),
    // Normalize the folder path: trim, strip leading/trailing slashes (the GitHub
    // tree paths have no leading slash).
    vault_folder_path: str(r.vault_folder_path, DEFAULT_NUDGE_SETTINGS.vault_folder_path)
      .replace(/^\/+|\/+$/g, ''),
  }
}
