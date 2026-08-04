/**
 * Prep Sheet Pipeline settings — canonical shape + defaults, read defensively
 * from coaches.reminder_settings.prep_sheets. Dependency-free (mirrors
 * lib/scheduling.ts and lib/nudges/settings.ts) so the settings UI, the cron,
 * and throwaway tests can all import it. An absent/partial block means defaults.
 */

export type PrepSheetSettings = {
  enabled: boolean
  generate_lead_days: number
  review_hour: number
  delivery_lead_days: number
  delivery_hour: number
  cutoff_hours_before: number
  history_window_days: number
}

export const DEFAULT_PREP_SHEET_SETTINGS: PrepSheetSettings = {
  enabled: true,
  generate_lead_days: 4,
  review_hour: 7,
  delivery_lead_days: 2,
  delivery_hour: 8,
  cutoff_hours_before: 12,
  history_window_days: 90,
}

function intInRange(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n) || n < min || n > max) return fallback
  return n
}

/**
 * Coerce the stored `reminder_settings.prep_sheets` block into a valid shape.
 * `raw` is the whole reminder_settings object (or null) — we pull `.prep_sheets`
 * off it. Ranges are clamped so a bad value never breaks the scheduler math:
 * delivery must lead by at least a day and by no more than the generate lead.
 */
export function normalizePrepSheetSettings(raw: unknown): PrepSheetSettings {
  const d = DEFAULT_PREP_SHEET_SETTINGS
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...d }
  const block = (raw as Record<string, unknown>).prep_sheets
  if (!block || typeof block !== 'object' || Array.isArray(block)) return { ...d }
  const src = block as Record<string, unknown>

  const generate_lead_days = intInRange(src.generate_lead_days, 1, 14, d.generate_lead_days)
  // Delivery must land before generation's lead runs out — cap it at the
  // generate lead so a misconfiguration can't schedule delivery before drafting.
  const delivery_lead_days = intInRange(src.delivery_lead_days, 1, generate_lead_days, d.delivery_lead_days)

  return {
    enabled: src.enabled === undefined ? d.enabled : Boolean(src.enabled),
    generate_lead_days,
    review_hour: intInRange(src.review_hour, 0, 23, d.review_hour),
    delivery_lead_days,
    delivery_hour: intInRange(src.delivery_hour, 0, 23, d.delivery_hour),
    cutoff_hours_before: intInRange(src.cutoff_hours_before, 1, 72, d.cutoff_hours_before),
    history_window_days: intInRange(src.history_window_days, 1, 365, d.history_window_days),
  }
}
