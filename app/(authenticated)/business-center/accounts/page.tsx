'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/app/components/layout/PageHeader'
import type { BillingAccount } from '@/lib/billing/types'

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<BillingAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/billing/accounts')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setAccounts(d.accounts ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <PageHeader
        breadcrumb="Business Center"
        title="Accounts"
        actions={
          <Link
            href="/business-center"
            className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
          >
            ← Back
          </Link>
        }
      />

      {loading && <div className="h-24 animate-pulse rounded-tlw-2xl bg-tlw-surface/70" />}
      {error && <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load accounts.</p>}

      {!loading && !error && accounts.length === 0 && (
        <div className="rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-tlw-navy-deep">No billing accounts yet</p>
          <p className="mt-1 text-[13px] text-tlw-warm-gray">
            Accounts will appear here once added. Each account is a payer — a solo client or an enterprise with multiple coachees.
          </p>
        </div>
      )}

      {!loading && !error && accounts.length > 0 && (
        <div className="divide-y divide-tlw-warm-gray/10 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
          {accounts.map((acct) => (
            <Link
              key={acct.id}
              href={`/business-center/accounts/${acct.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-tlw-canvas"
            >
              <div>
                <p className="text-[14px] font-medium text-tlw-navy-deep">{acct.name}</p>
                <p className="text-[12px] text-tlw-warm-gray">{acct.billing_email}</p>
              </div>
              <span className="shrink-0 rounded-full bg-tlw-canvas px-2 py-0.5 text-[11px] font-medium capitalize text-tlw-warm-gray">
                {acct.type}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
