'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { PageHeader } from '@/app/components/layout/PageHeader'
import type { AccountWithEngagements } from '@/lib/billing/types'

const MODE_LABEL: Record<string, string> = {
  arrears: 'Arrears',
  subscription: 'Subscription',
  per_engagement: 'Per engagement',
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-50 text-green-700',
  paused: 'bg-amber-50 text-amber-700',
  ended: 'bg-tlw-canvas text-tlw-warm-gray',
}

function money(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [account, setAccount] = useState<AccountWithEngagements | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`/api/billing/accounts/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setAccount(d.account))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <>
      <PageHeader
        breadcrumb="Business Center / Accounts"
        title={account?.name ?? 'Account'}
        subtitle={account?.billing_email}
        actions={
          <Link
            href="/business-center/accounts"
            className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
          >
            ← Accounts
          </Link>
        }
      />

      {loading && <div className="h-32 animate-pulse rounded-tlw-2xl bg-tlw-surface/70" />}
      {error && <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load account.</p>}

      {account && (
        <div className="space-y-6">
          {/* Engagements */}
          <section>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-tlw-warm-gray">
              Engagements
            </h2>
            {(!account.engagements || account.engagements.length === 0) ? (
              <div className="rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 py-8 text-center">
                <p className="text-[13px] text-tlw-warm-gray">No engagements on this account yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-tlw-warm-gray/10 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
                {account.engagements.map((eng) => (
                  <div key={eng.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[14px] font-medium text-tlw-navy-deep">
                          {(eng.coachee as any)?.client?.name ?? '—'}
                        </p>
                        <p className="text-[12px] text-tlw-warm-gray">
                          {MODE_LABEL[eng.billing_mode] ?? eng.billing_mode}
                          {eng.billing_mode === 'arrears' && eng.rate_hourly
                            ? ` · ${money(eng.rate_hourly)}/hr`
                            : ''}
                          {eng.billing_mode === 'subscription' && eng.monthly_amount
                            ? ` · ${money(eng.monthly_amount)}/mo`
                            : ''}
                          {eng.billing_mode === 'per_engagement' && eng.engagement_total
                            ? ` · ${money(eng.engagement_total)} total`
                            : ''}
                        </p>
                        <p className="mt-0.5 text-[11px] text-tlw-warm-gray">
                          Owner: {eng.billing_owner}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[eng.status] ?? ''}`}>
                        {eng.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Invoices for this account */}
          <section>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-tlw-warm-gray">
              Invoices
            </h2>
            <AccountInvoices accountId={id} />
          </section>
        </div>
      )}
    </>
  )
}

function AccountInvoices({ accountId }: { accountId: string }) {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/billing/invoices?accountId=${accountId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setInvoices(d.invoices ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [accountId])

  if (loading) return <div className="h-16 animate-pulse rounded-tlw-2xl bg-tlw-surface/70" />
  if (invoices.length === 0) return <p className="text-[13px] text-tlw-warm-gray">No invoices yet.</p>

  const STATUS_STYLES: Record<string, string> = {
    draft: 'bg-tlw-canvas text-tlw-warm-gray',
    approved: 'bg-blue-50 text-blue-700',
    sent: 'bg-amber-50 text-amber-700',
    paid: 'bg-green-50 text-green-700',
    overdue: 'bg-red-50 text-red-700',
    failed: 'bg-red-100 text-red-800',
    void: 'bg-tlw-canvas text-tlw-warm-gray',
  }

  return (
    <div className="divide-y divide-tlw-warm-gray/10 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
      {invoices.map((inv: any) => (
        <Link
          key={inv.id}
          href={`/business-center/invoices/${inv.id}`}
          className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-tlw-canvas"
        >
          <div>
            <p className="text-[13px] font-medium text-tlw-navy-deep">
              {inv.period_end
                ? new Date(inv.period_end).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                : 'No period'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[inv.status] ?? ''}`}>
              {inv.status}
            </span>
            <span className="text-[13px] font-medium text-tlw-navy-deep">
              {(inv.total ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}
