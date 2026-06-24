'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { AgendaCard } from '@/app/(authenticated)/clients/[id]/AgendaCard'

export function AgendaBlock({ size: _size }: { size: CardSize }) {
  const { clientId } = useWorkspaceCtx()
  return <AgendaCard clientId={clientId} />
}
