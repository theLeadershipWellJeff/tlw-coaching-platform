'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { CoachingMapCard } from '@/app/(authenticated)/clients/[id]/CoachingMapCard'
import { CompactEmpty, CompactStatus } from '../CompactCard'

function MapCompact() {
  // coaching_map is on the client object — no extra fetch needed.
  const { client } = useWorkspaceCtx()
  const name = client?.coaching_map
  if (!name) return <CompactEmpty label="No map assigned" />
  return <CompactStatus value={name} tone="positive" sub="Assigned coaching map" />
}

export function CoachingMapBlock({ size }: { size: CardSize }) {
  const { client, setClient } = useWorkspaceCtx()
  if (size === 'compact') return <MapCompact />
  if (!client) return null
  // The same card as the session-notes rail (structure pop-up, vault-live
  // content, send-to-client), in workspace-card chrome.
  return <CoachingMapCard client={client} onUpdated={setClient} chrome="card" />
}
