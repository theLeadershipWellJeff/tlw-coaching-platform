'use client'
/**
 * The chrome around every dashboard card: an optional title, a size toggle (only
 * the sizes a card supports), a remove control, and — in Arrange mode — a drag
 * handle. Self-headed cards (wrapped legacy panels) pass `selfHeader` so the
 * frame suppresses its title and the panel's own header shows instead.
 */
import type { ReactNode } from 'react'
import type { CardSize } from '@/lib/dashboard/types'

const SIZE_LABEL: Record<CardSize, string> = { compact: 'S', standard: 'M', expanded: 'L' }
const SIZE_TITLE: Record<CardSize, string> = { compact: 'Compact', standard: 'Standard', expanded: 'Expanded' }

function SizeToggle({
  size,
  supportedSizes,
  onResize,
}: {
  size: CardSize
  supportedSizes: CardSize[]
  onResize: (size: CardSize) => void
}) {
  if (supportedSizes.length < 2) return null
  return (
    <div className="flex items-center rounded-tlw-md border border-tlw-warm-gray/25 p-0.5">
      {supportedSizes.map((s) => {
        const active = s === size
        return (
          <button
            key={s}
            onClick={() => onResize(s)}
            title={SIZE_TITLE[s]}
            aria-label={`${SIZE_TITLE[s]} size`}
            aria-pressed={active}
            className={`rounded-tlw-sm px-1.5 py-0.5 text-[11px] font-medium leading-none transition-colors ${
              active ? 'bg-tlw-navy-rich text-white' : 'text-tlw-warm-gray hover:bg-tlw-canvas hover:text-tlw-espresso'
            }`}
          >
            {SIZE_LABEL[s]}
          </button>
        )
      })}
    </div>
  )
}

function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </svg>
  )
}

export function CardFrame({
  title,
  icon,
  selfHeader = false,
  size,
  supportedSizes,
  onResize,
  onRemove,
  arranging = false,
  children,
}: {
  title: string
  icon?: string
  selfHeader?: boolean
  size: CardSize
  supportedSizes: CardSize[]
  onResize: (size: CardSize) => void
  onRemove: () => void
  arranging?: boolean
  children: ReactNode
}) {
  return (
    <section className="flex h-full flex-col rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {arranging && (
            <span className="cursor-grab text-tlw-warm-gray active:cursor-grabbing" title="Drag to reorder">
              <GripIcon />
            </span>
          )}
          {!selfHeader && (
            <p className="min-w-0 truncate text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
              {icon ? `${icon} ` : ''}
              {title}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <SizeToggle size={size} supportedSizes={supportedSizes} onResize={onResize} />
          <button
            onClick={onRemove}
            title={`Remove ${title}`}
            aria-label={`Remove ${title}`}
            className="rounded-md px-1.5 py-1 text-[13px] leading-none text-tlw-warm-gray transition-colors hover:bg-tlw-warm-gray/15 hover:text-tlw-espresso"
          >
            ✕
          </button>
        </div>
      </header>
      {/* In Arrange mode the body is inert so the whole card is a drag target. */}
      <div className={`min-h-0 flex-1 ${arranging ? 'pointer-events-none select-none' : ''}`}>{children}</div>
    </section>
  )
}
