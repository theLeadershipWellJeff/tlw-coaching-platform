/**
 * Default dashboard for a coach who has never customized it (no stored row).
 * The everyday cockpit — roster + Up next (session prep) up top, then Past
 * Revenue + Calendar. Everything else is opt-in via the Add-card menu, and any
 * card can be resized and dragged to reorder.
 */
import type { CardPlacement } from './types'

export const DEFAULT_DASHBOARD_LAYOUT: CardPlacement[] = [
  { blockId: 'roster', size: 'standard', order: 0 },
  { blockId: 'up-next', size: 'standard', order: 1 },
  { blockId: 'past-revenue', size: 'standard', order: 2 },
  { blockId: 'calendar', size: 'standard', order: 3 },
]
