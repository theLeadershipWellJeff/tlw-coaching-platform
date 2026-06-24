'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { GoalsCard } from '@/app/(authenticated)/clients/[id]/GoalsCard'

export function GoalsBlock({ size: _size }: { size: CardSize }) {
  const { client, setClient } = useWorkspaceCtx()
  if (!client) return null
  return <GoalsCard client={client} onUpdated={setClient} />
}
