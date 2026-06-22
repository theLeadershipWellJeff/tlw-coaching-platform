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
}

/** Cards eligible for the dashboard surface (all of them, today). */
export function dashboardCardMeta(): CardMeta[] {
  return Object.values(CARD_META).filter((m) => m.surfaces.includes('dashboard'))
}

/** Dashboard-eligible cards not already placed — feeds the "Add card" menu. */
export function availableToAdd(placedIds: Iterable<string>): CardMeta[] {
  const placed = new Set(placedIds)
  return dashboardCardMeta().filter((m) => !placed.has(m.id))
}
