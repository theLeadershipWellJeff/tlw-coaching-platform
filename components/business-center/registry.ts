'use client'
import type { DashboardCard } from '@/lib/dashboard/types'
import { outstandingARCard } from './cards/OutstandingARCard'
import { recentInvoicesCard } from './cards/RecentInvoicesCard'
import { accountsCard } from './cards/AccountsCard'
import { coachingHoursCard } from '@/components/dashboard/cards/CoachingHoursCard'
import { pastRevenueCard } from '@/components/dashboard/cards/PastRevenueCard'
import { projectedRevenueCard } from '@/components/dashboard/cards/ProjectedRevenueCard'
import { annualRevenueCard } from '@/components/dashboard/cards/AnnualRevenueCard'

export const BUSINESS_CENTER_CARDS: Record<string, DashboardCard<any>> = {
  'bc-outstanding-ar': outstandingARCard,
  'bc-recent-invoices': recentInvoicesCard,
  'bc-accounts': accountsCard,
  'coaching-hours': coachingHoursCard,
  'past-revenue': pastRevenueCard,
  'projected-revenue': projectedRevenueCard,
  'annual-revenue': annualRevenueCard,
}

export function getBusinessCenterCard(id: string): DashboardCard<any> | undefined {
  return BUSINESS_CENTER_CARDS[id]
}
