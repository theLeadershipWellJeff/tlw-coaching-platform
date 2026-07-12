/**
 * Default client workspace layout for a coach who has never customized it.
 * Shows the most-used panels first; the coach can add, remove, reorder, and
 * resize via the workspace's Arrange mode. This is coach-global — one layout
 * applies across every client's workspace.
 */
import type { CardPlacement } from './types'

export const DEFAULT_WORKSPACE_LAYOUT: CardPlacement[] = [
  { blockId: 'ws-schedule', size: 'standard', order: 0 },
  { blockId: 'ws-transcripts', size: 'compact', order: 1 },
  { blockId: 'ws-notes', size: 'compact', order: 2 },
  { blockId: 'ws-goals', size: 'standard', order: 3 },
  { blockId: 'ws-actions', size: 'standard', order: 4 },
  { blockId: 'ws-nudges', size: 'standard', order: 5 },
  { blockId: 'ws-communications', size: 'standard', order: 6 },
  { blockId: 'ws-agreements', size: 'standard', order: 7 },
  { blockId: 'ws-agenda', size: 'compact', order: 8 },
  { blockId: 'ws-key-info', size: 'standard', order: 9 },
  { blockId: 'ws-billing', size: 'standard', order: 10 },
  { blockId: 'ws-coaching-map', size: 'standard', order: 11 },
]
