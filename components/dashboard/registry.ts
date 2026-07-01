'use client'
/**
 * Client-side dashboard card registry — maps a card id to its full definition
 * (metadata + the data hook + the renderer). The server-safe metadata lives in
 * lib/dashboard/cards.ts and is the single source of truth for identity/sizes;
 * here we attach the React pieces. Register a card by adding its definition.
 */
import type { DashboardCard } from '@/lib/dashboard/types'
import { pastRevenueCard } from './cards/PastRevenueCard'
import { projectedRevenueCard } from './cards/ProjectedRevenueCard'
import { annualRevenueCard } from './cards/AnnualRevenueCard'
import { emailsSentCard } from './cards/EmailsSentCard'
import { calendarHeatmapCard } from './cards/CalendarHeatmapCard'
import { nudgesCard } from './cards/NudgesCard'
import { rosterCard } from './cards/RosterCard'
import { upNextCard } from './cards/UpNextCard'
import { scorecardCard } from './cards/ScorecardCard'
import { unmatchedBookingsCard } from './cards/UnmatchedBookingsCard'
import { suggestedNudgesCard } from './cards/SuggestedNudgesCard'
import { coachingHoursCard } from './cards/CoachingHoursCard'

export const DASHBOARD_CARDS: Record<string, DashboardCard<any>> = {
  'past-revenue': pastRevenueCard,
  'projected-revenue': projectedRevenueCard,
  'annual-revenue': annualRevenueCard,
  'emails-sent': emailsSentCard,
  calendar: calendarHeatmapCard,
  nudges: nudgesCard,
  roster: rosterCard,
  'up-next': upNextCard,
  scorecard: scorecardCard,
  'unmatched-bookings': unmatchedBookingsCard,
  'suggested-nudges': suggestedNudgesCard,
  'coaching-hours': coachingHoursCard,
}

export function getDashboardCard(id: string): DashboardCard<any> | undefined {
  return DASHBOARD_CARDS[id]
}
