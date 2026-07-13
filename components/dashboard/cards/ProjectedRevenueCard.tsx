'use client'
/**
 * Projected Revenue card — this week's projected revenue from the calendar, with
 * a forward look at the rest of the year. All figures come from the existing
 * revenue service (no new math). Sizes (brief §5):
 *   compact   → $ projected
 *   standard  → $ + basis (scheduled sessions on the calendar)
 *   expanded  → $ + basis + a forward projection chart (remaining months)
 */
import { useState } from 'react'
import { CARD_META } from '@/lib/dashboard/cards'
import { useRevenueData, type RevenueData } from '@/lib/dashboard/useRevenueData'
import { RevenueBreakdownModal } from '@/components/dashboard/RevenueBreakdownModal'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function Basis({ data }: { data: RevenueData }) {
  const r = data.revenue!
  if (!r.calendarConnected) {
    return <p className="mt-1.5 text-[11px] text-tlw-warm-gray">connect Google Calendar to project</p>
  }
  return (
    <p className="mt-1.5 text-[11px] text-tlw-warm-gray">
      {r.projected.sessions} scheduled session{r.projected.sessions === 1 ? '' : 's'} · {r.projected.hours} billed h
    </p>
  )
}

/** Forward projection: remaining months (first projected month → December). */
function ForwardChart({ data }: { data: RevenueData }) {
  const months = data.revenue!.annual.monthly
  const first = months.find((m) => m.projected > 0)?.month
  if (!first) {
    return <p className="text-[13px] text-tlw-warm-gray">No upcoming sessions on the calendar.</p>
  }
  const shown = months.filter((m) => m.month >= first)
  const max = Math.max(...shown.map((m) => m.projected), 1)
  return (
    <div className="flex items-end gap-1.5">
      {shown.map((m) => (
        <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-24 w-full items-end">
            <div
              className="w-full rounded-t-sm bg-tlw-navy-rich"
              style={{ height: `${Math.max((m.projected / max) * 100, m.projected > 0 ? 4 : 0)}%` }}
              title={`${MONTHS[m.month - 1]}: ${money(m.projected)}`}
            />
          </div>
          <span className="text-[10px] text-tlw-warm-gray">{MONTHS[m.month - 1][0]}</span>
        </div>
      ))}
    </div>
  )
}

function ProjectedRevenue({ size, data }: { size: CardSize; data: RevenueData }) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  if (data.loading) return <div className="h-16 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
  if (data.error || !data.revenue) return <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load revenue.</p>

  const { projected, byClient } = data.revenue

  const modal = showBreakdown && (
    <RevenueBreakdownModal
      title="Projected revenue · by client"
      subtitle={`This week's scheduled sessions — each slice is one client's share of ${money(projected.total)}`}
      total={projected.total}
      items={byClient?.projected ?? []}
      onClose={() => setShowBreakdown(false)}
    />
  )

  const Amount = (
    <button
      onClick={() => setShowBreakdown(true)}
      title="See the by-client breakdown"
      className="block text-left"
    >
      <p className="text-[30px] font-medium leading-none text-tlw-navy-deep transition-colors hover:text-tlw-navy-rich hover:underline">
        {money(projected.total)}
      </p>
    </button>
  )

  const ByClient = (
    <button
      onClick={() => setShowBreakdown(true)}
      className="mt-1.5 text-[12px] font-medium text-tlw-signal-orange hover:underline"
    >
      By client →
    </button>
  )

  if (size === 'compact') {
    return (
      <div>
        {Amount}
        <p className="mt-2 text-[11px] text-tlw-warm-gray">this week projected</p>
        {ByClient}
        {modal}
      </div>
    )
  }

  if (size === 'standard') {
    return (
      <div>
        {Amount}
        <Basis data={data} />
        {ByClient}
        {modal}
      </div>
    )
  }

  // expanded
  return (
    <div>
      {Amount}
      <Basis data={data} />
      {ByClient}
      <div className="mt-4 border-t border-tlw-warm-gray/15 pt-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          Projected through year-end
        </p>
        <ForwardChart data={data} />
      </div>
      {modal}
    </div>
  )
}

export const projectedRevenueCard: DashboardCard<RevenueData> = {
  ...CARD_META['projected-revenue'],
  useData: useRevenueData,
  render: ({ size, data }) => <ProjectedRevenue size={size} data={data} />,
}
