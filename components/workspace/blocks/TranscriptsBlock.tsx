'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { TranscriptsCard } from '@/app/(authenticated)/clients/[id]/SummaryCards'
import { useCompactFetch, CompactSkeleton, CompactEmpty, CompactStat } from '../CompactCard'

function fmtDate(d: string | null): string {
  if (!d) return ''
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function TranscriptsCompact({ clientId }: { clientId: string }) {
  const data = useCompactFetch<{ transcripts: { session_date: string | null }[] }>(
    `/api/clients/${clientId}/transcripts`
  )
  if (!data) return <CompactSkeleton />
  const list = data.transcripts || []
  if (list.length === 0) return <CompactEmpty label="No transcripts yet" />
  const latest = list[0]?.session_date
  return (
    <CompactStat
      count={list.length}
      label={list.length === 1 ? 'transcript' : 'transcripts'}
      sub={latest ? `Latest ${fmtDate(latest)}` : undefined}
    />
  )
}

export function TranscriptsBlock({ size }: { size: CardSize }) {
  const { clientId, client, txReload, bumpTxReload } = useWorkspaceCtx()
  if (size === 'compact') return <TranscriptsCompact clientId={clientId} />
  return (
    <TranscriptsCard
      clientId={clientId}
      clientName={client?.name}
      reloadKey={txReload}
      onImported={bumpTxReload}
    />
  )
}
