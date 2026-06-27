/**
 * Workspace block metadata — the server-safe registry for the client_workspace
 * surface. Parallel to lib/dashboard/cards.ts (which backs the dashboard surface).
 *
 * Only metadata lives here (id/title/sizes) — never React or data hooks — so the
 * workspace layout API route can import this without pulling in client components.
 */
import type { CardSize } from './types'

export interface WorkspaceBlockMeta {
  id: string
  title: string
  icon?: string
  supportedSizes: CardSize[]
  defaultSize: CardSize
  selfHeader?: boolean
}

export const WORKSPACE_BLOCK_META: Record<string, WorkspaceBlockMeta> = {
  'ws-schedule': {
    id: 'ws-schedule',
    title: 'Sessions',
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
    selfHeader: true,
  },
  'ws-transcripts': {
    id: 'ws-transcripts',
    title: 'Transcripts',
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'compact',
    selfHeader: true,
  },
  'ws-notes': {
    id: 'ws-notes',
    title: 'Notes',
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'compact',
    selfHeader: true,
  },
  'ws-goals': {
    id: 'ws-goals',
    title: 'Coaching goals',
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
    selfHeader: true,
  },
  'ws-actions': {
    id: 'ws-actions',
    title: 'Actions',
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
    selfHeader: true,
  },
  'ws-nudges': {
    id: 'ws-nudges',
    title: 'Nudges',
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
    selfHeader: true,
  },
  'ws-communications': {
    id: 'ws-communications',
    title: 'Recent communication',
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
    selfHeader: true,
  },
  'ws-agreements': {
    id: 'ws-agreements',
    title: 'Agreement',
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
    selfHeader: true,
  },
  'ws-agenda': {
    id: 'ws-agenda',
    title: 'Agenda',
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'compact',
    selfHeader: true,
  },
  'ws-key-info': {
    id: 'ws-key-info',
    title: 'Key info',
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
    selfHeader: true,
  },
  'ws-billing': {
    id: 'ws-billing',
    title: 'Billing',
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
    selfHeader: true,
  },
}

/** Workspace blocks not already placed in the layout — feeds the add-card menu. */
export function workspaceBlocksAvailableToAdd(placedIds: Iterable<string>): WorkspaceBlockMeta[] {
  const placed = new Set(placedIds)
  return Object.values(WORKSPACE_BLOCK_META).filter((m) => !placed.has(m.id))
}
