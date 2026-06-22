'use client'
/**
 * Annual Revenue card — full-year revenue (brief §8.2): actuals YTD (logged
 * notes) + projected remainder (calendar), straight from the existing revenue
 * service (no new math). Sizes (brief §5):
 *   compact   → $ (full-year)
 *   standard  → $ + YTD-vs-projected split
 *   expanded  → $ + monthly trend (actual vs projected) + split
 */
import { CARD_META } from '@/lib/dashboard/cards'
import { useRevenueData, type RevenueData } from '@/lib/dashboard/useRevenueData'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

/** YTD actuals vs projected remainder, as a split bar + two labelled figures. */
function Split({ data }: { data: RevenueData }) {
  const a = data.revenue!.annual
  const total = Math.max(a.total, 1)
  return (
    <div className="mt-3">
      <div className="flex h-2 overflow-hidden rounded-full bg-tlw-canvas">
        <div className="h-2 bg-tlw-navy-rich" style={{ width: `${(a.actualsYtd / total) * 100}%` }} />
        <div className="h-2 bg-tlw-warm-gray" style={{ width: `${(a.projectedRemainder / total) * 100}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[12px]">
        <span className="text-tlw-espresso">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-tlw-navy-rich align-middle" />
          {money(a.actualsYtd)} <span className="text-tlw-warm-gray">actual YTD</span>
        </span>
        <span className="text-tlw-espresso">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-tlw-warm-gray align-middle" />
          {money(a.projectedRemainder)} <span className="text-tlw-warm-gray">projected</span>
        </span>
      </div>
    </div>
  )
}

/** 12-month trend: each month stacks actual (navy) over projected (gray). */
function MonthlyTrend({ data }: { data: RevenueData }) {
  const months = data.revenue!.annual.monthly
  const max = Math.max(...months.map((m) => m.actual + m.projected), 1)
  return (
    <div className="flex items-end gap-1">
      {months.map((m) => {
        const total = m.actual + m.projected
        return (
          <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="flex h-28 w-full flex-col justify-end"
              title={`${MONTHS[m.month - 1]}: ${money(m.actual)} actual + ${money(m.projected)} projected`}
            >
              <div className="w-full bg-tlw-warm-gray" style={{ height: `${(m.projected / max) * 100}%` }} />
              <div
                className="w-full rounded-t-sm bg-tlw-navy-rich"
                style={{ height: `${Math.max((m.actual / max) * 100, total > 0 && m.actual > 0 ? 3 : 0)}%` }}
              />
            </div>
            <span className="text-[10px] text-tlw-warm-gray">{MONTHS[m.month - 1][0]}</span>
          </div>
        )
      })}
    </div>
  )
}

function AnnualRevenue({ size, data }: { size: CardSize; data: RevenueData }) {
  if (data.loading) return <div className="h-16 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
  if (data.error || !data.revenue) return <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load revenue.</p>

  const a = data.revenue.annual
  const Amount = (
    <div>
      <p className="text-[30px] font-medium leading-none text-tlw-navy-deep">{money(a.total)}</p>
      <p className="mt-2 text-[11px] text-tlw-warm-gray">{a.year} full-year</p>
    </div>
  )

  if (size === 'compact') return Amount

  if (size === 'standard') {
    return (
      <div>
        {Amount}
        <Split data={data} />
      </div>
    )
  }

  // expanded
  return (
    <div>
      {Amount}
      <Split data={data} />
      <div className="mt-4 border-t border-tlw-warm-gray/15 pt-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Monthly trend</p>
        <MonthlyTrend data={data} />
      </div>
    </div>
  )
}

export const annualRevenueCard: DashboardCard<RevenueData> = {
  ...CARD_META['annual-revenue'],
  useData: useRevenueData,
  render: ({ size, data }) => <AnnualRevenue size={size} data={data} />,
}
