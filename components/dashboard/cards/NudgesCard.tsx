'use client'
/**
 * Nudges card — the coach's SENT nudges (history), across all clients. Read-only:
 * clicking a row opens the full nudge in a detail modal that REUSES the Nudge
 * page's NudgeItem rendering (sent nudges render read-only there). Sizes (§5):
 *   compact   → count sent
 *   standard  → count + last ~4 (type · client · subject)
 *   expanded  → full list; click → nudge detail
 * The send path may not be producing records yet, so the empty state is clean.
 */
import { useState } from 'react'
import { CARD_META } from '@/lib/dashboard/cards'
import { useNudgesData, type NudgesData } from '@/lib/dashboard/useNudgesData'
import { NudgeItem, type NudgeRow } from '@/app/(authenticated)/nudges/NudgeItem'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'

const TYPE_LABEL: Record<string, string> = {
  action_checkin: 'Action check-in',
  insight: 'Insight',
  framework: 'Framework',
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

function label(n: NudgeRow): string {
  if (n.draft_subject && n.draft_subject.trim()) return n.draft_subject
  return TYPE_LABEL[n.type] || n.type
}

function Row({ n, onOpen }: { n: NudgeRow; onOpen: (n: NudgeRow) => void }) {
  return (
    <button
      onClick={() => onOpen(n)}
      className="block w-full rounded-tlw-lg px-2 py-1.5 text-left transition-colors hover:bg-tlw-canvas"
    >
      <p className="flex items-center gap-2">
        <span className="shrink-0 rounded-full bg-tlw-navy-rich/10 px-1.5 py-[1px] text-[10px] font-medium text-tlw-navy-rich">
          {TYPE_LABEL[n.type] || n.type}
        </span>
        <span className="min-w-0 truncate text-[13px] text-tlw-navy-deep">{label(n)}</span>
      </p>
      <p className="mt-0.5 truncate text-[12px] text-tlw-warm-gray">
        {n.client_name ? `${n.client_name} · ` : ''}
        {relTime(n.sent_at)}
      </p>
    </button>
  )
}

function Count({ n }: { n: number }) {
  return (
    <div>
      <p className="text-[30px] font-medium leading-none text-tlw-navy-deep">{n}</p>
      <p className="mt-2 text-[11px] text-tlw-warm-gray">nudges sent</p>
    </div>
  )
}

function Empty() {
  return (
    <div className="flex h-full min-h-[80px] flex-col items-center justify-center text-center">
      <p className="text-[13px] text-tlw-warm-gray">No nudges sent yet.</p>
      <p className="mt-1 text-[12px] text-tlw-warm-gray">Drafted nudges you send will appear here.</p>
    </div>
  )
}

function DetailModal({ nudge, onClose }: { nudge: NudgeRow; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tlw-navy-deep/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-tlw-2xl bg-tlw-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Sent nudge</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-1.5 py-1 text-[14px] leading-none text-tlw-warm-gray transition-colors hover:bg-tlw-warm-gray/15 hover:text-tlw-espresso"
          >
            ✕
          </button>
        </div>
        {/* Reuse the Nudge page rendering; sent nudges render read-only there. */}
        <NudgeItem nudge={nudge} showClient onChanged={() => {}} />
      </div>
    </div>
  )
}

function Nudges({ size, data }: { size: CardSize; data: NudgesData }) {
  const [open, setOpen] = useState<NudgeRow | null>(null)

  if (data.loading) return <div className="h-16 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
  if (data.error || !data.nudges) return <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load nudges.</p>

  const { count, items } = data.nudges

  if (size === 'compact') return <Count n={count} />

  const detail = open && <DetailModal nudge={open} onClose={() => setOpen(null)} />

  if (items.length === 0) {
    return (
      <div>
        <Count n={count} />
        <div className="mt-3 border-t border-tlw-warm-gray/15 pt-3">
          <Empty />
        </div>
      </div>
    )
  }

  const list = size === 'standard' ? items.slice(0, 4) : items
  return (
    <div className="flex h-full flex-col">
      <Count n={count} />
      <div
        className={`mt-3 space-y-0.5 border-t border-tlw-warm-gray/15 pt-2 ${
          size === 'expanded' ? 'max-h-72 overflow-y-auto pr-1' : ''
        }`}
      >
        {list.map((n) => (
          <Row key={n.id} n={n} onOpen={setOpen} />
        ))}
      </div>
      {detail}
    </div>
  )
}

export const nudgesCard: DashboardCard<NudgesData> = {
  ...CARD_META['nudges'],
  useData: useNudgesData,
  render: ({ size, data }) => <Nudges size={size} data={data} />,
}
