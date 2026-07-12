'use client'
/**
 * Client workspace block registry — maps blockId to its React component.
 *
 * Each component receives `size` and reads the rest of its per-client data from
 * WorkspaceContext (via useWorkspaceCtx). The layout (which blocks, order, size)
 * is coach-global and comes from the layout API; clientId never touches it.
 */
import type { ComponentType } from 'react'
import type { CardSize } from '@/lib/dashboard/types'
import { ScheduleBlock } from './blocks/ScheduleBlock'
import { TranscriptsBlock } from './blocks/TranscriptsBlock'
import { NotesBlock } from './blocks/NotesBlock'
import { GoalsBlock } from './blocks/GoalsBlock'
import { ActionsBlock } from './blocks/ActionsBlock'
import { NudgesBlock } from './blocks/NudgesBlock'
import { CommunicationsBlock } from './blocks/CommunicationsBlock'
import { AgendaBlock } from './blocks/AgendaBlock'
import { AgreementsBlock } from './blocks/AgreementsBlock'
import { KeyInfoBlock } from './blocks/KeyInfoBlock'
import { BillingBlock } from './blocks/BillingBlock'
import { CoachingMapBlock } from './blocks/CoachingMapBlock'

export type WorkspaceBlockComponent = ComponentType<{ size: CardSize }>

export const WORKSPACE_REGISTRY: Record<string, WorkspaceBlockComponent> = {
  'ws-schedule': ScheduleBlock,
  'ws-transcripts': TranscriptsBlock,
  'ws-notes': NotesBlock,
  'ws-goals': GoalsBlock,
  'ws-actions': ActionsBlock,
  'ws-nudges': NudgesBlock,
  'ws-communications': CommunicationsBlock,
  'ws-agenda': AgendaBlock,
  'ws-agreements': AgreementsBlock,
  'ws-key-info': KeyInfoBlock,
  'ws-billing': BillingBlock,
  'ws-coaching-map': CoachingMapBlock,
}

export function getWorkspaceBlock(id: string): WorkspaceBlockComponent | undefined {
  return WORKSPACE_REGISTRY[id]
}
