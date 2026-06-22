'use client'
/**
 * Projected Revenue card — this week's projected revenue from the calendar, with
 * a forward look at the rest of the year. All figures come from the existing
 * revenue service (no new math). Sizes (brief §5):
 *   compact   → $ projected
 *   standard  → $ + basis (scheduled sessions on the calendar)
 *   expanded  → $ + basis + a forward projection chart (remaining months)
 */
import { CARD_META } from '@/lib/dashboard/cards'
import { useRevenueData, type RevenueData } from '@/lib/dashboard/useRevenueData'
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
  if (data.loading) return <div className="h-16 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
  if (data.error || !data.revenue) return <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load revenue.</p>

  const Amount = (
    <p className="text-[30px] font-medium leading-none text-tlw-navy-deep">{money(data.revenue.projected.total)}</p>
  )

  if (size === 'compact') {
    return (
      <div>
        {Amount}
        <p className="mt-2 text-[11px] text-tlw-warm-gray">this week projected</p>
      </div>
    )
  }

  if (size === 'standard') {
    return (
      <div>
        {Amount}
        <Basis data={data} />
      </div>
    )
  }

  // expanded
  return (
    <div>
      {Amount}
      <Basis data={data} />
      <div className="mt-4 border-t border-tlw-warm-gray/15 pt-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          Projected through year-end
        </p>
        <ForwardChart data={data} />
      </div>
    </div>
  )
}

export const projectedRevenueCard: DashboardCard<RevenueData> = {
  ...CARD_META['projected-revenue'],
  useData: useRevenueData,
  render: ({ size, data }) => <ProjectedRevenue size={size} data={data} />,
}
