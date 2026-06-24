'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { NudgesCard } from '@/app/(authenticated)/clients/[id]/NudgesCard'
import { useCompactFetch, CompactSkeleton, CompactEmpty, CompactStat } from '../CompactCard'

function NudgesCompact({ clientId }: { clientId: string }) {
  const data = useCompactFetch<{ nudges: { status: string }[] }>(
    `/api/clients/${clientId}/nudges`
  )
  if (!data) return <CompactSkeleton />
  const list = data.nudges || []
  const pending = list.filter((n) => n.status === 'draft' || n.status === 'scheduled').length
  if (pending === 0) return <CompactEmpty label="No pending nudges" />
  return (
    <CompactStat
      count={pending}
      label={pending === 1 ? 'nudge pending' : 'nudges pending'}
    />
  )
}

export function NudgesBlock({ size }: { size: CardSize }) {
  const { clientId, client } = useWorkspaceCtx()
  if (size === 'compact') return <NudgesCompact clientId={clientId} />
  if (!client) return null
  return <NudgesCard clientId={clientId} clientName={client.name} />
}
