'use client'
/** Roster card — the client list, wrapping the existing RosterPanel (self-headed). */
import { CARD_META } from '@/lib/dashboard/cards'
import { useClients } from '@/lib/dashboard/useClients'
import { RosterPanel } from '@/app/(authenticated)/dashboard/RosterPanel'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'

function RosterBody({ size }: { size: CardSize }) {
  const { clients, loading, error } = useClients()
  return <RosterPanel clients={clients} loading={loading} error={error} size={size} />
}

export const rosterCard: DashboardCard<null> = {
  ...CARD_META['roster'],
  useData: () => null,
  render: ({ size }) => <RosterBody size={size} />,
}
