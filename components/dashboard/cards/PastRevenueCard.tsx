'use client'
/**
 * Past Revenue card — prior week's realized revenue, from the existing revenue
 * service (no new math). Progressive disclosure across three sizes (brief §5):
 *   compact   → $ + ▲/▼ vs the week before
 *   standard  → $ + comparison + a mini two-week bar + basis line
 *   expanded  → standard + a per-session breakdown (client · amount)
 */
import { CARD_META } from '@/lib/dashboard/cards'
import { useRevenueData, type RevenueData } from '@/lib/dashboard/useRevenueData'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function Skeleton() {
  return <div className="h-16 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
}

function ErrorState() {
  return <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load revenue.</p>
}

/** ▲/▼ vs the prior week. Deliberately not Signal Orange (one-accent rule). */
function Delta({ now, prev }: { now: number; prev: number }) {
  const diff = now - prev
  if (prev <= 0 && now <= 0) {
    return <span className="text-[12px] text-tlw-warm-gray">no prior-week revenue to compare</span>
  }
  if (diff === 0) {
    return <span className="text-[12px] text-tlw-warm-gray">even with last week</span>
  }
  const up = diff > 0
  return (
    <span className="text-[12px] text-tlw-espresso">
      <span className="font-medium">{up ? '▲' : '▼'}</span> {money(Math.abs(diff))}{' '}
      <span className="text-tlw-warm-gray">vs prior week</span>
    </span>
  )
}

/** Two-bar mini chart comparing the prior week and last week. */
function MiniBar({ prior, last }: { prior: number; last: number }) {
  const max = Math.max(prior, last, 1)
  const Bar = ({ label, value, strong }: { label: string; value: number; strong: boolean }) => (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] text-tlw-warm-gray">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-tlw-canvas">
        <div
          className="h-2 rounded-full"
          style={{ width: `${(value / max) * 100}%`, backgroundColor: strong ? '#0C1940' : '#8B8680' }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-[12px] text-tlw-espresso">{money(value)}</span>
    </div>
  )
  return (
    <div className="mt-3 space-y-1.5">
      <Bar label="prior wk" value={prior} strong={false} />
      <Bar label="last wk" value={last} strong />
    </div>
  )
}

function Basis({ sessions, hours }: { sessions: number; hours: number }) {
  return (
    <p className="mt-1.5 text-[11px] text-tlw-warm-gray">
      {sessions} logged session{sessions === 1 ? '' : 's'} · {hours} billed h
    </p>
  )
}

function PastRevenue({ size, data }: { size: CardSize; data: RevenueData }) {
  if (data.loading) return <Skeleton />
  if (data.error || !data.revenue) return <ErrorState />
  const { past, prior, pastSessions } = data.revenue

  const Amount = (
    <p className="text-[30px] font-medium leading-none text-tlw-navy-deep">{money(past.total)}</p>
  )

  if (size === 'compact') {
    return (
      <div>
        {Amount}
        <p className="mt-2">
          <Delta now={past.total} prev={prior.total} />
        </p>
      </div>
    )
  }

  if (size === 'standard') {
    return (
      <div>
        {Amount}
        <p className="mt-1.5">
          <Delta now={past.total} prev={prior.total} />
        </p>
        <MiniBar prior={prior.total} last={past.total} />
        <Basis sessions={past.sessions} hours={past.hours} />
      </div>
    )
  }

  // expanded
  return (
    <div>
      {Amount}
      <p className="mt-1.5">
        <Delta now={past.total} prev={prior.total} />
      </p>
      <MiniBar prior={prior.total} last={past.total} />
      <Basis sessions={past.sessions} hours={past.hours} />
      <div className="mt-4 border-t border-tlw-warm-gray/15 pt-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          Last week&apos;s sessions
        </p>
        {pastSessions.length === 0 ? (
          <p className="text-[13px] text-tlw-warm-gray">No logged sessions last week.</p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {pastSessions.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-tlw-espresso">{s.client}</span>
                <span className="shrink-0 text-tlw-warm-gray">
                  {s.minutes}m · <span className="text-tlw-espresso">{money(s.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export const pastRevenueCard: DashboardCard<RevenueData> = {
  ...CARD_META['past-revenue'],
  useData: useRevenueData,
  render: ({ size, data }) => <PastRevenue size={size} data={data} />,
}
