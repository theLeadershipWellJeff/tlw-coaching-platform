/**
 * Placement validator — the dashboard's analog of the block registry's
 * `resolvePlacement`. Stored layouts are jsonb the coach controls indirectly, so
 * we never trust them: anything that doesn't resolve to a known card / supported
 * size is dropped or coerced rather than rendered. Run on both load and save.
 */
import { CARD_META } from './cards'
import type { CardPlacement, CardSize, DashboardSurfaceId } from './types'

/**
 * Coerce raw stored/posted blocks into a clean, ordered placement list:
 *  - drop entries that aren't objects or reference an unknown card for this surface
 *  - drop duplicates (one instance of each card per surface, v1)
 *  - fall back to the card's defaultSize if the stored size isn't supported
 *  - renumber `order` by final position
 */
export function normalizePlacements(
  raw: unknown,
  surface: DashboardSurfaceId = 'dashboard',
): CardPlacement[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: CardPlacement[] = []

  const items = [...raw].sort((a, b) => {
    const ao = typeof (a as any)?.order === 'number' ? (a as any).order : 0
    const bo = typeof (b as any)?.order === 'number' ? (b as any).order : 0
    return ao - bo
  })

  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const blockId = String((item as any).blockId ?? '')
    const meta = CARD_META[blockId]
    if (!meta || !meta.surfaces.includes(surface)) continue
    if (seen.has(blockId)) continue

    let size = (item as any).size as CardSize
    if (!meta.supportedSizes.includes(size)) size = meta.defaultSize

    seen.add(blockId)
    out.push({ blockId, size, order: out.length })
  }
  return out
}
