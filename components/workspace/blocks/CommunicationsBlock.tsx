'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { ClientHistoryCard } from '@/app/(authenticated)/clients/[id]/ClientHistoryCard'

export function CommunicationsBlock({ size: _size }: { size: CardSize }) {
  const { clientId, commReload } = useWorkspaceCtx()
  return <ClientHistoryCard clientId={clientId} reloadKey={commReload} />
}
