'use client'
/**
 * Nudges card — the coach's SENT nudges (history), across all clients.
 * Sizes:
 *   compact   → count sent + "View all" link
 *   standard  → count + last ~4 rows; each row navigates to the client's
 *               workspace NudgesCard
 *   expanded  → full scrollable list, same click behavior
 *
 * "View all" opens a modal listing every sent nudge. Clicking a row navigates to
 * the client workspace where the NudgesCard shows the full nudge with send/edit.
 */
import { useState } from 'react'
import Link from 'next/link'
import { CARD_META } from '@/lib/dashboard/cards'
import { useNudgesData, type NudgesData } from '@/lib/dashboard/useNudgesData'
import type { NudgeRow } from '@/app/(authenticated)/nudges/NudgeItem'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'

const TYPE_LABEL: Record<string, string> = {
  action_checkin: 'Action check-in',
  insight: 'Insight',
  framework: 'Framework',
  goals: 'Goals',
  reengagement: 'Re-engagement',
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min${min === 1 ? '' : 's'} ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function nudgeLabel(n: NudgeRow): string {
  if (n.draft_subject && n.draft_subject.trim()) return n.draft_subject
  return TYPE_LABEL[n.type] || n.type
}

/** A single nudge row. Clicking navigates to the client workspace NudgesCard. */
function Row({ n, onClick }: { n: NudgeRow; onClick?: () => void }) {
  const inner = (
    <div className="flex items-start gap-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="shrink-0 rounded-full bg-tlw-navy-rich/10 px-1.5 py-[1px] text-[10px] font-medium text-tlw-navy-rich">
            {TYPE_LABEL[n.type] || n.type}
          </span>
          <span className="min-w-0 truncate text-[13px] text-tlw-navy-deep">{nudgeLabel(n)}</span>
        </p>
        <p className="mt-0.5 truncate text-[12px] text-tlw-warm-gray">
          {n.client_name ? `${n.client_name} · ` : ''}
          {relTime(n.sent_at)}
        </p>
      </div>
    </div>
  )

  if (n.client_id) {
    return (
      <Link
        href={`/clients/${n.client_id}`}
        onClick={onClick}
        className="block rounded-tlw-lg px-2 py-1.5 transition-colors hover:bg-tlw-canvas"
      >
        {inner}
      </Link>
    )
  }
  return <div className="rounded-tlw-lg px-2 py-1.5">{inner}</div>
}

/** Full-list modal — all sent nudges, each navigating to the client workspace. */
function ListModal({ items, onClose }: { items: NudgeRow[]; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tlw-navy-deep/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="All sent nudges"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-tlw-2xl bg-tlw-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-tlw-warm-gray/15 px-5 py-4">
          <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Sent nudges</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-1.5 py-1 text-[14px] leading-none text-tlw-warm-gray transition-colors hover:bg-tlw-warm-gray/15 hover:text-tlw-espresso"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-3 py-3">
          {items.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-tlw-warm-gray">No nudges sent yet.</p>
          ) : (
            <div className="space-y-0.5">
              {items.map((n) => (
                <Row key={n.id} n={n} onClick={onClose} />
              ))}
            </div>
          )}
        </div>
        <p className="border-t border-tlw-warm-gray/15 px-5 py-3 text-[11px] text-tlw-warm-gray">
          Click a row to open that client&apos;s workspace
        </p>
      </div>
    </div>
  )
}

function Count({ n, onViewAll }: { n: number; onViewAll: () => void }) {
  return (
    <div>
      <p className="text-[30px] font-medium leading-none text-tlw-navy-deep">{n}</p>
      <p className="mt-2 text-[11px] text-tlw-warm-gray">nudges sent</p>
      <button
        onClick={onViewAll}
        className="mt-2 text-[12px] font-medium text-tlw-signal-orange hover:underline"
      >
        View all →
      </button>
    </div>
  )
}

function Nudges({ size, data }: { size: CardSize; data: NudgesData }) {
  const [showModal, setShowModal] = useState(false)

  if (data.loading) return <div className="h-16 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
  if (data.error || !data.nudges) return <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load nudges.</p>

  const { count, items } = data.nudges

  const modal = showModal && (
    <ListModal items={items} onClose={() => setShowModal(false)} />
  )

  if (size === 'compact') {
    return (
      <>
        <Count n={count} onViewAll={() => setShowModal(true)} />
        {modal}
      </>
    )
  }

  if (items.length === 0) {
    return (
      <>
        <Count n={count} onViewAll={() => setShowModal(true)} />
        <div className="mt-3 flex min-h-[80px] flex-col items-center justify-center border-t border-tlw-warm-gray/15 pt-3 text-center">
          <p className="text-[13px] text-tlw-warm-gray">No nudges sent yet.</p>
          <p className="mt-1 text-[12px] text-tlw-warm-gray">Drafted nudges you send will appear here.</p>
        </div>
        {modal}
      </>
    )
  }

  if (size === 'standard') {
    return (
      <>
        <div>
          <Count n={count} onViewAll={() => setShowModal(true)} />
          <div className="mt-3 space-y-0.5 border-t border-tlw-warm-gray/15 pt-2">
            {items.slice(0, 4).map((n) => (
              <Row key={n.id} n={n} />
            ))}
            {items.length > 4 && (
              <button
                onClick={() => setShowModal(true)}
                className="mt-1 px-2 text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
              >
                +{items.length - 4} more
              </button>
            )}
          </div>
        </div>
        {modal}
      </>
    )
  }

  // expanded
  return (
    <>
      <div className="flex h-full flex-col">
        <Count n={count} onViewAll={() => setShowModal(true)} />
        <div className="mt-3 max-h-72 space-y-0.5 overflow-y-auto border-t border-tlw-warm-gray/15 pt-2 pr-1">
          {items.map((n) => (
            <Row key={n.id} n={n} />
          ))}
        </div>
      </div>
      {modal}
    </>
  )
}

export const nudgesCard: DashboardCard<NudgesData> = {
  ...CARD_META['nudges'],
  useData: useNudgesData,
  render: ({ size, data }) => <Nudges size={size} data={data} />,
}
