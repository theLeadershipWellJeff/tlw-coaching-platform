'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { AgreementsCard } from '@/app/(authenticated)/clients/[id]/AgreementsCard'

export function AgreementsBlock({ size: _size }: { size: CardSize }) {
  const { client, agrReload, onIssueAgreement } = useWorkspaceCtx()
  if (!client) return null
  return <AgreementsCard client={client} reloadKey={agrReload} onIssue={onIssueAgreement} />
}
