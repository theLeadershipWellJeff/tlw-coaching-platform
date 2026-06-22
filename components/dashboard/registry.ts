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

export const DASHBOARD_CARDS: Record<string, DashboardCard<any>> = {
  'past-revenue': pastRevenueCard,
  'projected-revenue': projectedRevenueCard,
  'annual-revenue': annualRevenueCard,
}

export function getDashboardCard(id: string): DashboardCard<any> | undefined {
  return DASHBOARD_CARDS[id]
}
