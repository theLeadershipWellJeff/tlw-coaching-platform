/**
 * Default dashboard for a coach who has never customized it (no stored row).
 *
 * Brief §8.3: the resolved new-coach default is Past Revenue (standard) +
 * Calendar (standard). The Calendar card ships in Phase 4 — it joins this list
 * the moment its component is registered. For Phase 1 the default is Past
 * Revenue alone, which keeps the default honest (we never default to a card that
 * can't render).
 */
import type { CardPlacement } from './types'

export const DEFAULT_DASHBOARD_LAYOUT: CardPlacement[] = [
  { blockId: 'past-revenue', size: 'standard', order: 0 },
]
