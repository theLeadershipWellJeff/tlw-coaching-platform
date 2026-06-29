'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { PageHeader } from '@/app/components/layout/PageHeader'

type Invoice = {
  id: string
  status: string
  period_start: string | null
  period_end: string | null
  total: number
  billing_accounts: {
    id: string
    name: string
    billing_email: string
  } | null
}

const STATUS_OPTIONS = ['all', 'outstanding', 'draft', 'approved', 'sent', 'paid', 'overdue', 'void'] as const
type StatusFilter = (typeof STATUS_OPTIONS)[number]

// Map filter values to the ?status= query the API accepts
const STATUS_API: Record<StatusFilter, string | null> = {
  all: null,
  outstanding: 'sent,overdue',
  draft: 'draft',
  approved: 'approved',
  sent: 'sent',
  paid: 'paid',
  overdue: 'overdue',
  void: 'void',
}

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'All statuses',
  outstanding: 'Outstanding (sent + overdue)',
  draft: 'Draft',
  approved: 'Approved',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-tlw-canvas text-tlw-warm-gray',
  approved: 'bg-blue-50 text-blue-700',
  sent: 'bg-amber-50 text-amber-700',
  paid: 'bg-green-50 text-green-700',
  overdue: 'bg-red-50 text-red-700',
  failed: 'bg-red-100 text-red-800',
  void: 'bg-tlw-canvas text-tlw-warm-gray',
}

function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return '—'
  const fmt = (d: string) =>
    new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  if (start && end) {
    const s = new Date(start + 'T12:00:00Z')
    const e = new Date(end + 'T12:00:00Z')
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) return fmt(end)
    return `${fmt(start)} – ${fmt(end)}`
  }
  return fmt((start ?? end)!)
}

export default function InvoicesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // Pre-filter from ?status= query param (e.g. from the AR card link).
  // 'sent,overdue' maps to the 'outstanding' filter option.
  const rawStatus = searchParams.get('status') ?? 'all'
  const initStatus: StatusFilter = rawStatus === 'sent,overdue' || rawStatus === 'sent%2Coverdue'
    ? 'outstanding'
    : STATUS_OPTIONS.includes(rawStatus as StatusFilter) ? (rawStatus as StatusFilter) : 'all'
  const [status, setStatus] = useState<StatusFilter>(initStatus)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')

  const loadInvoices = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '200' })
    const apiStatus = STATUS_API[status]
    if (apiStatus) params.set('status', apiStatus)
    if (periodStart) params.set('periodStart', periodStart)
    if (periodEnd) params.set('periodEnd', periodEnd)

    try {
      const res = await fetch(`/api/billing/invoices?${params}`)
      if (!res.ok) throw new Error()
      const d = await res.json()
      setInvoices(d.invoices ?? [])
    } catch {
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [status, periodStart, periodEnd])

  useEffect(() => { loadInvoices() }, [loadInvoices])

  const filtered = invoices.filter((inv) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (inv.billing_accounts?.name ?? '').toLowerCase().includes(q) ||
      (inv.billing_accounts?.billing_email ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <>
      <PageHeader
        breadcrumb="Business Center"
        title="Invoices"
        actions={
          <Link
            href="/business-center"
            className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
          >
            ← Back
          </Link>
        }
      />

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by account name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-surface px-3 py-1.5 text-[13px] text-tlw-espresso placeholder:text-tlw-warm-gray/60 focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-surface px-3 py-1.5 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-tlw-warm-gray">From</label>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-surface px-3 py-1.5 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
          />
          <label className="text-[12px] text-tlw-warm-gray">to</label>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-surface px-3 py-1.5 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
          />
        </div>
      </div>

      {loading && <div className="h-32 animate-pulse rounded-tlw-2xl bg-tlw-surface/70" />}

      {!loading && filtered.length === 0 && (
        <div className="rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-tlw-navy-deep">No invoices match your filters</p>
          <p className="mt-1 text-[13px] text-tlw-warm-gray">Try adjusting the search or filter settings above.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="divide-y divide-tlw-warm-gray/10 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
          {filtered.map((inv) => (
            <Link
              key={inv.id}
              href={`/business-center/invoices/${inv.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-tlw-canvas"
            >
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-tlw-navy-deep">
                  {inv.billing_accounts?.name ?? 'Unknown account'}
                </p>
                <p className="text-[12px] text-tlw-warm-gray">
                  {inv.billing_accounts?.billing_email ?? ''}
                  {inv.billing_accounts?.billing_email && ' · '}
                  {formatPeriod(inv.period_start, inv.period_end)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[inv.status] ?? 'bg-tlw-canvas text-tlw-warm-gray'}`}>
                  {inv.status}
                </span>
                <span className="text-[13px] font-medium text-tlw-navy-deep">
                  {(inv.total ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
