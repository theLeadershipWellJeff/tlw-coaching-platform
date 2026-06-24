'use client'
/**
 * WorkspaceContext — provides per-client data and reload triggers to workspace
 * blocks. The layout itself (which blocks, what size, what order) is coach-global
 * and lives in the layout API; this context carries the client-specific state that
 * block renderers need.
 *
 * Provided by ClientDetail; consumed by workspace block components via
 * useWorkspaceCtx(). clientId must never flow into the layout read/write path —
 * it belongs here, in the data layer only.
 */
import { createContext, useContext } from 'react'
import type { Client } from '@/lib/supabase/types'

export interface WorkspaceCtxValue {
  clientId: string
  client: Client | null
  setClient: (c: Client) => void
  coachTimezone: string | undefined
  apptReload: number
  txReload: number
  commReload: number
  agrReload: number
  bumpApptReload: () => void
  bumpTxReload: () => void
  bumpCommReload: () => void
  bumpAgrReload: () => void
  onIssueAgreement: () => void
}

const WorkspaceContext = createContext<WorkspaceCtxValue | null>(null)

export const WorkspaceProvider = WorkspaceContext.Provider

export function useWorkspaceCtx(): WorkspaceCtxValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspaceCtx must be used inside WorkspaceProvider')
  return ctx
}
