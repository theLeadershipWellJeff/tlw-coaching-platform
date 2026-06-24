'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { AgendaCard } from '@/app/(authenticated)/clients/[id]/AgendaCard'
import { useCompactFetch, CompactSkeleton, CompactEmpty, CompactStatus } from '../CompactCard'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function AgendaCompact({ clientId }: { clientId: string }) {
  const data = useCompactFetch<{
    agenda: { status: string; submitted_at: string | null } | null
  }>(`/api/clients/${clientId}/agenda`)
  if (!data) return <CompactSkeleton />
  const ag = data.agenda
  if (!ag) return <CompactEmpty label="No agenda request sent" />
  if (ag.status === 'submitted') {
    return (
      <CompactStatus
        value="Agenda submitted"
        tone="positive"
        sub={ag.submitted_at ? fmtDate(ag.submitted_at) : undefined}
      />
    )
  }
  return <CompactStatus value="Awaiting response" tone="pending" />
}

export function AgendaBlock({ size }: { size: CardSize }) {
  const { clientId } = useWorkspaceCtx()
  if (size === 'compact') return <AgendaCompact clientId={clientId} />
  return <AgendaCard clientId={clientId} />
}
