'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { NotesCard } from '@/app/(authenticated)/clients/[id]/SummaryCards'
import { useCompactFetch, CompactSkeleton, CompactEmpty, CompactStat } from '../CompactCard'

function NotesCompact({ clientId }: { clientId: string }) {
  const data = useCompactFetch<{ notes: { title: string | null }[] }>(
    `/api/clients/${clientId}/notes`
  )
  if (!data) return <CompactSkeleton />
  const list = data.notes || []
  if (list.length === 0) return <CompactEmpty label="No notes yet" />
  const firstTitle = list[0]?.title?.trim() || 'Untitled note'
  return (
    <CompactStat
      count={list.length}
      label={list.length === 1 ? 'note' : 'notes'}
      sub={firstTitle}
    />
  )
}

export function NotesBlock({ size }: { size: CardSize }) {
  const { clientId } = useWorkspaceCtx()
  if (size === 'compact') return <NotesCompact clientId={clientId} />
  return <NotesCard clientId={clientId} />
}
