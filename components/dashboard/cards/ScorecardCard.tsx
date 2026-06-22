'use client'
/** Coach Scorecard card — wraps the existing ScorecardSummary (self-headed, self-fetching). */
import { CARD_META } from '@/lib/dashboard/cards'
import { ScorecardSummary } from '@/app/(authenticated)/dashboard/ScorecardSummary'
import type { DashboardCard } from '@/lib/dashboard/types'

export const scorecardCard: DashboardCard<null> = {
  ...CARD_META['scorecard'],
  useData: () => null,
  render: () => <ScorecardSummary />,
}
