'use client'
/**
 * Key info block — wraps the private coach-only KeyInfoCard.
 *
 * KEY-INFO HARD WALL (confirmed here for Phase 3 checkpoint):
 *   clients.key_info is private to the coach. At every size this block reads
 *   key_info only from the WorkspaceContext `client` object, which is already
 *   loaded server-side by /api/clients/[id] (coach-only route, session-gated).
 *   The wall is enforced at the data layer — the column is never included in:
 *     - /api/notes/client-email  (send-to-client draft)
 *     - /api/generate            (session-prep email)
 *     - /api/clients/[id]/nudges/generate (nudge extraction)
 *   Moving or removing this card from the workspace layout is a display-only
 *   change and cannot weaken the wall, because the wall lives in those API
 *   routes, not in this component tree.
 */
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { KeyInfoCard } from '@/app/(authenticated)/clients/[id]/KeyInfoCard'
import { CompactEmpty, CompactLine } from '../CompactCard'

function KeyInfoCompact() {
  // key_info is already on the client object — no extra fetch needed.
  const { client } = useWorkspaceCtx()
  const text = client?.key_info?.trim()
  if (!text) return <CompactEmpty label="No key info yet" />
  // Show a short preview — never truncate mid-word if possible.
  const preview = text.length > 100 ? text.slice(0, 100).replace(/\s\S*$/, '') + '…' : text
  return <CompactLine primary={preview} />
}

export function KeyInfoBlock({ size }: { size: CardSize }) {
  const { client, setClient } = useWorkspaceCtx()
  if (size === 'compact') return <KeyInfoCompact />
  if (!client) return null
  return <KeyInfoCard client={client} onUpdated={setClient} />
}
