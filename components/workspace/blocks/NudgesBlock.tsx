'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { NudgesCard } from '@/app/(authenticated)/clients/[id]/NudgesCard'

export function NudgesBlock({ size: _size }: { size: CardSize }) {
  const { clientId, client } = useWorkspaceCtx()
  if (!client) return null
  return <NudgesCard clientId={clientId} clientName={client.name} />
}
