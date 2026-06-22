'use client'
/** Suggested nudges card — wraps SuggestedNudgesPanel (self-headed, self-fetching). */
import { CARD_META } from '@/lib/dashboard/cards'
import { useCoachTimezone } from '@/lib/dashboard/useCoachTimezone'
import { SuggestedNudgesPanel } from '@/app/(authenticated)/dashboard/SuggestedNudgesPanel'
import type { DashboardCard } from '@/lib/dashboard/types'

function SuggestedNudgesBody() {
  const timeZone = useCoachTimezone()
  return <SuggestedNudgesPanel timeZone={timeZone} />
}

export const suggestedNudgesCard: DashboardCard<null> = {
  ...CARD_META['suggested-nudges'],
  useData: () => null,
  render: () => <SuggestedNudgesBody />,
}
