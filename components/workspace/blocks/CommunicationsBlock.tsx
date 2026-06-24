'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { ClientHistoryCard } from '@/app/(authenticated)/clients/[id]/ClientHistoryCard'
import { useCompactFetch, CompactSkeleton, CompactEmpty, CompactLine } from '../CompactCard'

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.round(diff / 86400000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function CommunicationsCompact({ clientId }: { clientId: string }) {
  const data = useCompactFetch<{
    history: { kind: string; subject?: string | null; sent_at: string }[]
  }>(`/api/clients/${clientId}/history`)
  if (!data) return <CompactSkeleton />
  const first = data.history?.[0]
  if (!first) return <CompactEmpty label="No communications yet" />
  const label = first.kind === 'nudge' ? 'Nudge' : first.kind === 'note' ? 'Note' : 'Email'
  return (
    <CompactLine
      primary={first.subject || label}
      sub={relTime(first.sent_at)}
    />
  )
}

export function CommunicationsBlock({ size }: { size: CardSize }) {
  const { clientId, commReload } = useWorkspaceCtx()
  if (size === 'compact') return <CommunicationsCompact clientId={clientId} />
  return <ClientHistoryCard clientId={clientId} reloadKey={commReload} />
}
