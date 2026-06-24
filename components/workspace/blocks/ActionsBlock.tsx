'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { ActionsCard } from '@/app/(authenticated)/clients/[id]/ActionsCard'

export function ActionsBlock({ size: _size }: { size: CardSize }) {
  const { clientId } = useWorkspaceCtx()
  return <ActionsCard clientId={clientId} />
}
