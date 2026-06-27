/**
 * Dashboard card metadata — the server-safe registry.
 *
 * This holds only the metadata (id/title/sizes), never the React data hook or
 * renderer, so it can be imported by the layout API route and the placement
 * validator without dragging client components into a server handler. The
 * client-side component registry (components/dashboard/registry.ts) composes
 * this metadata with each card's `useData`/`render`.
 *
 * Cards are added here as each build phase ships its component. Only cards that
 * have a real component should appear — an entry here makes the card addable.
 */
import type { CardMeta } from './types'

export const CARD_META: Record<string, CardMeta> = {
  'past-revenue': {
    id: 'past-revenue',
    title: 'Past revenue',
    surfaces: ['dashboard'],
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
  },
  'projected-revenue': {
    id: 'projected-revenue',
    title: 'Projected revenue',
    surfaces: ['dashboard'],
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
  },
  'annual-revenue': {
    id: 'annual-revenue',
    title: 'Annual revenue',
    surfaces: ['dashboard'],
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
  },
  'emails-sent': {
    id: 'emails-sent',
    title: 'Emails sent',
    surfaces: ['dashboard'],
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
  },
  calendar: {
    id: 'calendar',
    title: 'Calendar',
    surfaces: ['dashboard'],
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
  },
  nudges: {
    id: 'nudges',
    title: 'Nudges',
    surfaces: ['dashboard'],
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
  },
  // Wrapped legacy panels — they render their own header, so selfHeader=true.
  roster: {
    id: 'roster',
    title: 'Clients',
    surfaces: ['dashboard'],
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
    selfHeader: true,
    fixedSpan: 'lg:col-span-2',
  },
  'up-next': {
    id: 'up-next',
    title: 'Up next',
    surfaces: ['dashboard'],
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
    selfHeader: true,
    fixedSpan: 'lg:col-span-2',
  },
  scorecard: {
    id: 'scorecard',
    title: 'Coach scorecard',
    surfaces: ['dashboard'],
    supportedSizes: ['standard', 'expanded'],
    defaultSize: 'standard',
    selfHeader: true,
  },
  'unmatched-bookings': {
    id: 'unmatched-bookings',
    title: 'Unmatched bookings',
    surfaces: ['dashboard'],
    supportedSizes: ['standard', 'expanded'],
    defaultSize: 'standard',
    selfHeader: true,
  },
  'suggested-nudges': {
    id: 'suggested-nudges',
    title: 'Suggested nudges',
    surfaces: ['dashboard'],
    supportedSizes: ['standard', 'expanded'],
    defaultSize: 'standard',
    selfHeader: true,
  },
  // ── Business Center cards ────────────────────────────────────────────────
  'bc-billing-run': {
    id: 'bc-billing-run',
    title: 'Billing run',
    surfaces: ['business-center'],
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
  },
  'bc-outstanding-ar': {
    id: 'bc-outstanding-ar',
    title: 'Outstanding / AR',
    surfaces: ['business-center'],
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
  },
  'bc-recent-invoices': {
    id: 'bc-recent-invoices',
    title: 'Recent invoices',
    surfaces: ['business-center'],
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
  },
  'bc-accounts': {
    id: 'bc-accounts',
    title: 'Accounts',
    titleHref: '/business-center/accounts',
    surfaces: ['business-center'],
    supportedSizes: ['compact', 'standard', 'expanded'],
    defaultSize: 'standard',
  },
}

/** Cards eligible for a given surface. */
export function cardMetaForSurface(surface: import('./types').DashboardSurfaceId): CardMeta[] {
  return Object.values(CARD_META).filter((m) => m.surfaces.includes(surface))
}

/** Cards eligible for the dashboard surface. */
export function dashboardCardMeta(): CardMeta[] {
  return cardMetaForSurface('dashboard')
}

/** Surface-eligible cards not already placed — feeds the "Add card" menu. */
export function availableToAdd(
  placedIds: Iterable<string>,
  surface: import('./types').DashboardSurfaceId = 'dashboard',
): CardMeta[] {
  const placed = new Set(placedIds)
  return cardMetaForSurface(surface).filter((m) => !placed.has(m.id))
}
