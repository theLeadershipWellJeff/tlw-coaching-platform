'use client'
/** Roster card — the client list, wrapping the existing RosterPanel (self-headed). */
import { CARD_META } from '@/lib/dashboard/cards'
import { useClients } from '@/lib/dashboard/useClients'
import { RosterPanel } from '@/app/(authenticated)/dashboard/RosterPanel'
import type { DashboardCard } from '@/lib/dashboard/types'

function RosterBody() {
  const { clients, loading, error } = useClients()
  return <RosterPanel clients={clients} loading={loading} error={error} />
}

export const rosterCard: DashboardCard<null> = {
  ...CARD_META['roster'],
  useData: () => null,
  render: () => <RosterBody />,
}
