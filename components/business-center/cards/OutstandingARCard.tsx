'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CARD_META } from '@/lib/dashboard/cards'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'

type InvoiceRow = {
  id: string
  accountName: string
  total: number
  status: 'sent' | 'overdue'
  period_end: string | null
}

type ARData = {
  outstandingTotal: number
  overdueCount: number
  sentCount: number
  invoices: InvoiceRow[]
}

function useARData(): { loading: boolean; data: ARData | null; error: boolean } {
  const [state, setState] = useState<{ loading: boolean; data: ARData | null; error: boolean }>(
    { loading: true, data: null, error: false },
  )
  useEffect(() => {
    let active = true
    fetch('/api/billing/invoices?status=sent,overdue')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((invData) => {
        if (!active) return
        const raw: any[] = invData.invoices ?? []
        const invoices: InvoiceRow[] = raw.map((i: any) => ({
          id: i.id,
          accountName: i.billing_accounts?.name ?? 'Account',
          total: i.total ?? 0,
          status: i.status === 'overdue' ? 'overdue' : 'sent',
          period_end: i.period_end ?? null,
        }))
        // Overdue first, then most recent period.
        invoices.sort((a, b) => {
          if (a.status !== b.status) return a.status === 'overdue' ? -1 : 1
          return (b.period_end ?? '').localeCompare(a.period_end ?? '')
        })
        setState({
          loading: false,
          error: false,
          data: {
            outstandingTotal: invoices.reduce((s, i) => s + i.total, 0),
            overdueCount: invoices.filter((i) => i.status === 'overdue').length,
            sentCount: invoices.filter((i) => i.status === 'sent').length,
            invoices,
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
  if (loading) return <div className="h-20 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
  if (error || !data) return <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load invoices.</p>

  const { outstandingTotal, overdueCount, sentCount, invoices } = data

  if (invoices.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-3xl font-semibold leading-none text-tlw-navy-deep">{money(0)}</p>
        <p className="text-[13px] text-tlw-warm-gray">No outstanding invoices.</p>
      </div>
    )
  }

  const listMaxH = size === 'compact' ? 'max-h-[168px]' : 'max-h-[248px]'

  return (
    <div className="space-y-3">
      {/* Big outstanding number → the full invoices list */}
      <Link href="/business-center/invoices" className="block transition-opacity hover:opacity-80">
        <span className="text-3xl font-semibold leading-none text-tlw-navy-deep">{money(outstandingTotal)}</span>
        <span className="mt-1 block text-[12px] text-tlw-warm-gray">
          outstanding ·{' '}
          {overdueCount > 0 && <span className="font-medium text-red-600">{overdueCount} overdue</span>}
          {overdueCount > 0 && sentCount > 0 && ' · '}
          {sentCount > 0 && `${sentCount} sent`}
        </span>
      </Link>

      {/* Scrolling list of sent / overdue invoices */}
      <div className={`${listMaxH} space-y-1 overflow-y-auto pr-1`}>
        {invoices.map((inv) => (
          <Link
            key={inv.id}
            href={`/business-center/invoices/${inv.id}`}
            className="flex items-center justify-between gap-3 rounded-tlw-lg px-2 py-1.5 transition-colors hover:bg-tlw-canvas"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                  inv.status === 'overdue' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                }`}
              >
                {inv.status}
              </span>
              <span className="truncate text-[13px] text-tlw-espresso">{inv.accountName}</span>
            </div>
            <span className="shrink-0 text-[13px] font-medium text-tlw-navy-deep">{money(inv.total)}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export const outstandingARCard: DashboardCard<ReturnType<typeof useARData>> = {
  ...CARD_META['bc-outstanding-ar'],
  useData: useARData,
  render: ({ size, data }) => <Body size={size} {...data} />,
}
