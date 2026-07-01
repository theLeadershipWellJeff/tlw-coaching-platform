'use client'
import type { DashboardCard } from '@/lib/dashboard/types'
import { billingRunCard } from './cards/BillingRunCard'
import { outstandingARCard } from './cards/OutstandingARCard'
import { recentInvoicesCard } from './cards/RecentInvoicesCard'
import { accountsCard } from './cards/AccountsCard'
import { coachingHoursCard } from '@/components/dashboard/cards/CoachingHoursCard'

export const BUSINESS_CENTER_CARDS: Record<string, DashboardCard<any>> = {
  'bc-billing-run': billingRunCard,
  'bc-outstanding-ar': outstandingARCard,
  'bc-recent-invoices': recentInvoicesCard,
  'bc-accounts': accountsCard,
  'coaching-hours': coachingHoursCard,
}

export function getBusinessCenterCard(id: string): DashboardCard<any> | undefined {
  return BUSINESS_CENTER_CARDS[id]
}
