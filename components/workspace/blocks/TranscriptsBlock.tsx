'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { TranscriptsCard } from '@/app/(authenticated)/clients/[id]/SummaryCards'

export function TranscriptsBlock({ size: _size }: { size: CardSize }) {
  const { clientId, txReload } = useWorkspaceCtx()
  return <TranscriptsCard clientId={clientId} reloadKey={txReload} />
}
