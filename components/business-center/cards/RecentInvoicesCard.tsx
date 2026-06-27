'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CARD_META } from '@/lib/dashboard/cards'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'
import type { InvoiceStatus } from '@/lib/billing/types'

type RecentInvoice = {
  id: string
  accountName: string
  total: number
  status: InvoiceStatus
  period_end: string | null
  sent_at: string | null
}

function useRecentInvoices(): { loading: boolean; invoices: RecentInvoice[]; error: boolean } {
  const [state, setState] = useState<{ loading: boolean; invoices: RecentInvoice[]; error: boolean }>(
    { loading: true, invoices: [], error: false },
  )
  useEffect(() => {
    let active = true
    fetch('/api/billing/invoices?limit=8')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!active) return
        const mapped: RecentInvoice[] = (d.invoices ?? []).map((inv: any) => ({
          id: inv.id,
          accountName: inv.billing_accounts?.name ?? '—',
          total: inv.total ?? 0,
          status: inv.status,
          period_end: inv.period_end,
          sent_at: inv.sent_at,
        }))
        setState({ loading: false, invoices: mapped, error: false })
      })
      .catch(() => active && setState({ loading: false, invoices: [], error: true }))
    return () => { active = false }
  }, [])
  return state
}

const STATUS_STYLES: Record<string, string> = {
  draft:    'bg-tlw-canvas text-tlw-warm-gray',
  approved: 'bg-blue-50 text-blue-700',
  sent:     'bg-amber-50 text-amber-700',
  paid:     'bg-green-50 text-green-700',
  overdue:  'bg-red-50 text-red-700',
  failed:   'bg-red-100 text-red-800',
  void:     'bg-tlw-canvas text-tlw-warm-gray line-through',
}

function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function Body({ size, loading, invoices, error }: { size: CardSize; loading: boolean; invoices: RecentInvoice[]; error: boolean }) {
  if (loading) return <div className="h-24 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
  if (error) return <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load invoices.</p>
  if (invoices.length === 0) return <p className="text-[13px] text-tlw-warm-gray">No invoices yet.</p>

  const shown = size === 'compact' ? invoices.slice(0, 3) : invoices.slice(0, 6)

  return (
    <div className="space-y-1.5">
      {shown.map((inv) => (
        <Link
          key={inv.id}
          href={`/business-center/invoices/${inv.id}`}
          className="flex items-center justify-between gap-3 rounded-tlw-lg px-2 py-1.5 transition-colors hover:bg-tlw-canvas"
        >
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-tlw-navy-deep">{inv.accountName}</p>
            {size !== 'compact' && inv.period_end && (
              <p className="text-[11px] text-tlw-warm-gray">
                {new Date(inv.period_end).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[inv.status] ?? STATUS_STYLES.draft}`}>
              {inv.status}
            </span>
            <span className="text-[13px] font-medium text-tlw-navy-deep">{money(inv.total)}</span>
          </div>
        </Link>
      ))}
      {size === 'expanded' && invoices.length > 6 && (
        <Link href="/business-center/invoices" className="block pt-1 text-[12px] text-tlw-navy-deep underline-offset-2 hover:underline">
          View all invoices →
        </Link>
      )}
    </div>
  )
}

export const recentInvoicesCard: DashboardCard<ReturnType<typeof useRecentInvoices>> = {
  ...CARD_META['bc-recent-invoices'],
  useData: useRecentInvoices,
  render: ({ size, data }) => <Body size={size} {...data} />,
}
