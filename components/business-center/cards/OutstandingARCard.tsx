'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CARD_META } from '@/lib/dashboard/cards'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'

type ARData = {
  openTotal: number
  overdueTotal: number
  openCount: number
  overdueCount: number
  remindersThisWeek: number
}

function useARData(): { loading: boolean; data: ARData | null; error: boolean } {
  const [state, setState] = useState<{ loading: boolean; data: ARData | null; error: boolean }>(
    { loading: true, data: null, error: false },
  )
  useEffect(() => {
    let active = true
    Promise.all([
      fetch('/api/billing/invoices?status=sent,overdue').then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch('/api/billing/reminders?status=scheduled&withinDays=7').then((r) => (r.ok ? r.json() : Promise.reject())).catch(() => ({ reminders: [] })),
    ])
      .then(([invData, remData]) => {
        if (!active) return
        const invoices: any[] = invData.invoices ?? []
        const open = invoices.filter((i: any) => i.status === 'sent')
        const overdue = invoices.filter((i: any) => i.status === 'overdue')
        setState({
          loading: false,
          error: false,
          data: {
            openTotal: open.reduce((s: number, i: any) => s + (i.total ?? 0), 0),
            overdueTotal: overdue.reduce((s: number, i: any) => s + (i.total ?? 0), 0),
            openCount: open.length,
            overdueCount: overdue.length,
            remindersThisWeek: (remData.reminders ?? []).length,
          },
        })
      })
      .catch(() => active && setState({ loading: false, data: null, error: true }))
    return () => { active = false }
  }, [])
  return state
}

function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function Body({ size, data, loading, error }: { size: CardSize; loading: boolean; data: ARData | null; error: boolean }) {
  if (loading) return <div className="h-16 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
  if (error || !data) return <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load AR data.</p>

  const { openTotal, overdueTotal, openCount, overdueCount, remindersThisWeek } = data
  const allClear = openCount === 0 && overdueCount === 0

  if (allClear) {
    return <p className="text-[13px] text-tlw-warm-gray">No outstanding invoices.</p>
  }

  return (
    <div className="space-y-2">
      {overdueCount > 0 && (
        <div className="flex items-center justify-between rounded-tlw-lg bg-red-50 px-3 py-2">
          <span className="text-[13px] font-medium text-red-700">
            {overdueCount} overdue
          </span>
          <span className="text-[13px] font-semibold text-red-700">{money(overdueTotal)}</span>
        </div>
      )}
      {openCount > 0 && (
        <div className="flex items-center justify-between rounded-tlw-lg bg-tlw-canvas px-3 py-2">
          <span className="text-[13px] text-tlw-espresso">{openCount} sent / awaiting payment</span>
          <span className="text-[13px] font-medium text-tlw-navy-deep">{money(openTotal)}</span>
        </div>
      )}
      {size !== 'compact' && remindersThisWeek > 0 && (
        <p className="text-[12px] text-tlw-warm-gray">
          {remindersThisWeek} reminder{remindersThisWeek === 1 ? '' : 's'} scheduled this week
        </p>
      )}
      {size === 'expanded' && (
        <Link href="/business-center/invoices" className="block pt-1 text-[12px] text-tlw-navy-deep underline-offset-2 hover:underline">
          View all invoices →
        </Link>
      )}
    </div>
  )
}

export const outstandingARCard: DashboardCard<ReturnType<typeof useARData>> = {
  ...CARD_META['bc-outstanding-ar'],
  useData: useARData,
  render: ({ size, data }) => <Body size={size} {...data} />,
}
