'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { NotesCard } from '@/app/(authenticated)/clients/[id]/SummaryCards'

export function NotesBlock({ size: _size }: { size: CardSize }) {
  const { clientId } = useWorkspaceCtx()
  return <NotesCard clientId={clientId} />
}
