'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { AgreementsCard } from '@/app/(authenticated)/clients/[id]/AgreementsCard'
import { CompactStatus } from '../CompactCard'

function AgreementsCompact() {
  // Agreement status is already on the client object — no extra fetch needed.
  const { client } = useWorkspaceCtx()
  if (!client) return null

  // Derive compact status from the client record (same source as Gate 1 in scoring).
  // agreement_on_file = true means a signed agreement exists.
  if (client.agreement_on_file) {
    const recLabel = client.recording_authorized === false ? 'No recording auth' : undefined
    return <CompactStatus value="Agreement active" tone="positive" sub={recLabel} />
  }
  return <CompactStatus value="No agreement" tone="missing" />
}

export function AgreementsBlock({ size }: { size: CardSize }) {
  const { client, agrReload, onIssueAgreement } = useWorkspaceCtx()
  if (size === 'compact') return <AgreementsCompact />
  if (!client) return null
  return <AgreementsCard client={client} reloadKey={agrReload} onIssue={onIssueAgreement} />
}
