'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CARD_META } from '@/lib/dashboard/cards'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'
import { invoiceHref } from '@/lib/billing/invoice-links'

// Money owed: sent and unpaid, past due, or a failed card charge.
const AR_STATUSES = ['sent', 'overdue', 'failed'] as const
type ARStatus = (typeof AR_STATUSES)[number]

type ARInvoice = {
  id: string
  accountName: string
  total: number
  status: ARStatus
  sentAt: string | null
}

type ARState = { loading: boolean; error: boolean; total: number; invoices: ARInvoice[] }

const STATUS_STYLES: Record<ARStatus, string> = {
  sent: 'bg-amber-50 text-amber-700',
  overdue: 'bg-red-50 text-red-700',
  failed: 'bg-red-100 text-red-800',
}

const RANK: Record<ARStatus, number> = { overdue: 0, failed: 1, sent: 2 }

function useAR(): ARState {
  const [state, setState] = useState<ARState>({ loading: true, error: false, total: 0, invoices: [] })
  useEffect(() => {
    let active = true
    fetch(`/api/billing/invoices?status=${AR_STATUSES.join(',')}&limit=200`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!active) return
        const invoices: ARInvoice[] = (d.invoices ?? []).map((i: any) => ({
          id: i.id,
          accountName: i.billing_accounts?.name ?? 'Account',
          total: i.total ?? 0,
          status: i.status as ARStatus,
          sentAt: i.sent_at ?? null,
        }))
        // Most urgent first, then oldest sent first (longest outstanding).
        invoices.sort((a, b) =>
          RANK[a.status] - RANK[b.status] || (a.sentAt ?? '').localeCompare(b.sentAt ?? ''))
        setState({
          loading: false,
          error: false,
          total: invoices.reduce((s, i) => s + i.total, 0),
          invoices,
        })
      })
      .catch(() => active && setState({ loading: false, error: true, total: 0, invoices: [] }))
    return () => { active = false }
  }, [])
  return state
}

function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function daysOut(sentAt: string | null): string | null {
  if (!sentAt) return null
  const days = Math.floor((Date.now() - new Date(sentAt).getTime()) / 86_400_000)
  return days <= 0 ? 'sent today' : `${days}d out`
}

function Body({ size, loading, error, total, invoices }: ARState & { size: CardSize }) {
  if (loading) return <div className="h-16 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
  if (error) return <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load receivables.</p>

  const count = invoices.length
  const headline = (
    <div>
      <p className="text-3xl font-semibold leading-none text-tlw-navy-deep">{money(total)}</p>
      <p className="mt-1 text-[12px] text-tlw-warm-gray">
        {count === 0 ? 'Nothing outstanding' : `outstanding · ${count} invoice${count === 1 ? '' : 's'}`}
      </p>
    </div>
  )

  if (size === 'compact' || count === 0) return headline

  return (
    <div className="space-y-3">
      {headline}
      <div className={`${size === 'expanded' ? 'max-h-[420px]' : 'max-h-[248px]'} space-y-1 overflow-y-auto pr-1`}>
        {invoices.map((inv) => (
          <Link
            key={inv.id}
            href={invoiceHref(inv.id, '/business-center')}
            className="flex items-center justify-between gap-3 rounded-tlw-lg px-2 py-1.5 transition-colors hover:bg-tlw-canvas"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLES[inv.status]}`}>
                {inv.status}
              </span>
              <span className="truncate text-[13px] text-tlw-espresso">{inv.accountName}</span>
              {size === 'expanded' && daysOut(inv.sentAt) && (
                <span className="shrink-0 text-[11px] text-tlw-warm-gray">{daysOut(inv.sentAt)}</span>
              )}
            </div>
            <span className="shrink-0 text-[13px] font-medium text-tlw-navy-deep">{money(inv.total)}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export const accountsReceivableCard: DashboardCard<ARState> = {
  ...CARD_META['bc-accounts-receivable'],
  useData: useAR,
  render: ({ size, data }) => <Body size={size} {...data} />,
}
