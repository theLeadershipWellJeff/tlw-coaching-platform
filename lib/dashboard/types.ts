/**
 * Customizable dashboard ("legos") — the card/block contract.
 *
 * This is the first run-time arrangement layer on top of the block/slot idea: a
 * coach assembles their dashboard from cards, each of which renders differently
 * at three sizes. The contract intentionally mirrors the Block Registry spec
 * (id, title, surfaces, a single data hook, a size-aware render) so the future
 * client-workspace registry can converge on it rather than fork from it.
 *
 * This module is pure types + no React/server imports, so it is safe to import
 * from both the API route (validation) and client components (rendering).
 */
import type { ReactNode } from 'react'

export type CardSize = 'compact' | 'standard' | 'expanded'

/** The only surface in this build. Kept as a union so cards stay surface-aware. */
export type DashboardSurfaceId = 'dashboard'

/**
 * Server-safe card metadata — everything the registry/validator need to know
 * about a card without pulling in its (client-only) data hook or renderer. This
 * is the single source of truth for a card's identity and size support.
 */
export interface CardMeta {
  id: string
  title: string
  icon?: string
  surfaces: DashboardSurfaceId[]
  supportedSizes: CardSize[]
  defaultSize: CardSize
  // true = the card's body renders its own header (e.g. a wrapped legacy panel),
  // so the CardFrame suppresses its title to avoid a double header.
  selfHeader?: boolean
}

export interface CardRenderArgs<TData> {
  size: CardSize
  data: TData
}

/**
 * A full dashboard card: its metadata plus the one data hook (shared across all
 * sizes — resizing must never refetch) and the size-aware renderer.
 */
export interface DashboardCard<TData = unknown> extends CardMeta {
  /** Called once per placed card instance, regardless of size. */
  useData: () => TData
  render: (args: CardRenderArgs<TData>) => ReactNode
}

/** A card placed on the dashboard. This is exactly what we persist (jsonb). */
export interface CardPlacement {
  blockId: string
  size: CardSize
  order: number
}
