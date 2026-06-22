'use client'
/**
 * The chrome around every dashboard card: title, a size toggle (only the sizes a
 * card supports), and a remove control. Generic so all cards share one frame.
 */
import type { ReactNode } from 'react'
import type { CardSize } from '@/lib/dashboard/types'

const SIZE_LABEL: Record<CardSize, string> = {
  compact: 'S',
  standard: 'M',
  expanded: 'L',
}
const SIZE_TITLE: Record<CardSize, string> = {
  compact: 'Compact',
  standard: 'Standard',
  expanded: 'Expanded',
}

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
              active
                ? 'bg-tlw-navy-rich text-white'
                : 'text-tlw-warm-gray hover:bg-tlw-canvas hover:text-tlw-espresso'
            }`}
          >
            {SIZE_LABEL[s]}
          </button>
        )
      })}
    </div>
  )
}

export function CardFrame({
  title,
  icon,
  size,
  supportedSizes,
  onResize,
  onRemove,
  children,
}: {
  title: string
  icon?: string
  size: CardSize
  supportedSizes: CardSize[]
  onResize: (size: CardSize) => void
  onRemove: () => void
  children: ReactNode
}) {
  return (
    <section className="flex h-full flex-col rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          {icon ? `${icon} ` : ''}
          {title}
        </p>
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
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}
