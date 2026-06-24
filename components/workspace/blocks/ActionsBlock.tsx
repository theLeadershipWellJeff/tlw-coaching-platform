'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { ActionsCard } from '@/app/(authenticated)/clients/[id]/ActionsCard'
import { useCompactFetch, CompactSkeleton, CompactEmpty, CompactDualStat } from '../CompactCard'

function ActionsCompact({ clientId }: { clientId: string }) {
  const data = useCompactFetch<{ actions: { status: string }[] }>(
    `/api/clients/${clientId}/actions`
  )
  if (!data) return <CompactSkeleton />
  const list = data.actions || []
  if (list.length === 0) return <CompactEmpty label="No actions yet" />
  const open = list.filter((a) => a.status === 'open').length
  const done = list.filter((a) => a.status === 'done').length
  return <CompactDualStat a={open} aLabel="open" b={done} bLabel="done" />
}

export function ActionsBlock({ size }: { size: CardSize }) {
  const { clientId } = useWorkspaceCtx()
  if (size === 'compact') return <ActionsCompact clientId={clientId} />
  return <ActionsCard clientId={clientId} />
}
