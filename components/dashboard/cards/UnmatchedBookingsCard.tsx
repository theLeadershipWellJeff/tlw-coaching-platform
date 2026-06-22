'use client'
/** Unmatched bookings card — wraps UnmatchedBookingsPanel (self-headed). */
import { CARD_META } from '@/lib/dashboard/cards'
import { useClients } from '@/lib/dashboard/useClients'
import { useCoachTimezone } from '@/lib/dashboard/useCoachTimezone'
import { UnmatchedBookingsPanel } from '@/app/(authenticated)/dashboard/UnmatchedBookingsPanel'
import type { DashboardCard } from '@/lib/dashboard/types'

function UnmatchedBody() {
  const { clients } = useClients()
  const timeZone = useCoachTimezone()
  return <UnmatchedBookingsPanel clients={clients} timeZone={timeZone} />
}

export const unmatchedBookingsCard: DashboardCard<null> = {
  ...CARD_META['unmatched-bookings'],
  useData: () => null,
  render: () => <UnmatchedBody />,
}
