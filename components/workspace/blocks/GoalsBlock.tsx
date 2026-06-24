'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { GoalsCard } from '@/app/(authenticated)/clients/[id]/GoalsCard'
import { CompactEmpty, CompactStat } from '../CompactCard'

function GoalsCompact() {
  // coaching_goals is already on the client object — no extra fetch needed.
  const { client } = useWorkspaceCtx()
  const goals = client?.coaching_goals || []
  if (goals.length === 0) return <CompactEmpty label="No goals set" />
  return (
    <CompactStat
      count={goals.length}
      label={goals.length === 1 ? 'goal' : 'goals'}
      sub={goals[0].title || undefined}
    />
  )
}

export function GoalsBlock({ size }: { size: CardSize }) {
  const { client, setClient } = useWorkspaceCtx()
  if (size === 'compact') return <GoalsCompact />
  if (!client) return null
  return <GoalsCard client={client} onUpdated={setClient} />
}
