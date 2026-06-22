/**
 * Default dashboard for a coach who has never customized it (no stored row).
 * Brief §8.3: Past Revenue (standard) + Calendar (standard); all other cards are
 * opt-in via the Add-card menu.
 */
import type { CardPlacement } from './types'

export const DEFAULT_DASHBOARD_LAYOUT: CardPlacement[] = [
  { blockId: 'past-revenue', size: 'standard', order: 0 },
  { blockId: 'calendar', size: 'standard', order: 1 },
]
