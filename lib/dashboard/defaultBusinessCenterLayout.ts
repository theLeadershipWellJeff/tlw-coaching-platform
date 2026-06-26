import type { CardPlacement } from './types'

export const DEFAULT_BUSINESS_CENTER_LAYOUT: CardPlacement[] = [
  { blockId: 'bc-billing-run', size: 'standard', order: 0 },
  { blockId: 'bc-outstanding-ar', size: 'standard', order: 1 },
  { blockId: 'bc-recent-invoices', size: 'standard', order: 2 },
  { blockId: 'bc-accounts', size: 'standard', order: 3 },
]
