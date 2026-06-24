'use client'
/**
 * Key info block — wraps the private coach-only KeyInfoCard.
 *
 * The data wall is enforced at the KeyInfoCard + API level: clients.key_info is
 * never fed to any client-facing generation (session prep, nudges, send-to-client).
 * Moving or removing this card from the workspace layout is a display-only change
 * and has no effect on that wall.
 */
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { KeyInfoCard } from '@/app/(authenticated)/clients/[id]/KeyInfoCard'

export function KeyInfoBlock({ size: _size }: { size: CardSize }) {
  const { client, setClient } = useWorkspaceCtx()
  if (!client) return null
  return <KeyInfoCard client={client} onUpdated={setClient} />
}
