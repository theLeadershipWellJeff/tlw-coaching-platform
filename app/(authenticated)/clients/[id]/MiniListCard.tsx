'use client'
import Link from 'next/link'

export interface MiniItem {
  id: string
  label: string
  sub?: string
}

/** A small "title + three most recent" card that links to a fuller list page. */
export function MiniListCard({
  title,
  href,
  items,
  loading,
  emptyText,
}: {
  title: string
  href: string
  items: MiniItem[]
  loading: boolean
  emptyText: string
}) {
  return (
    <Link
      href={href}
      className="block rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5 transition-colors duration-tlw-base hover:border-tlw-warm-gray/30"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">{title}</p>
        <span className="text-[12px] font-medium text-tlw-signal-orange">view all →</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-tlw-md bg-tlw-canvas" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-2 text-[13px] text-tlw-warm-gray">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 3).map((it) => (
            <li key={it.id} className="flex items-baseline justify-between gap-3 border-b border-tlw-warm-gray/10 pb-2 last:border-b-0 last:pb-0">
              <span className="min-w-0 truncate text-[13px] text-tlw-espresso">{it.label}</span>
              {it.sub && <span className="shrink-0 text-[11px] text-tlw-warm-gray">{it.sub}</span>}
            </li>
          ))}
        </ul>
      )}
    </Link>
  )
}
