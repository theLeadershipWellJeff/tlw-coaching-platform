'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CARD_META } from '@/lib/dashboard/cards'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'
import type { BillingAccountType } from '@/lib/billing/types'

type AccountSummary = {
  id: string
  name: string
  type: BillingAccountType
  coacheeCount: number
  activeEngagements: number
}

function useAccountsData(): { loading: boolean; accounts: AccountSummary[]; error: boolean } {
  const [state, setState] = useState<{ loading: boolean; accounts: AccountSummary[]; error: boolean }>(
    { loading: true, accounts: [], error: false },
  )
  useEffect(() => {
    let active = true
    fetch('/api/billing/accounts?withSummary=1')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!active) return
        setState({ loading: false, accounts: d.accounts ?? [], error: false })
      })
      .catch(() => active && setState({ loading: false, accounts: [], error: true }))
    return () => { active = false }
  }, [])
  return state
}

function Body({ size, loading, accounts, error }: { size: CardSize; loading: boolean; accounts: AccountSummary[]; error: boolean }) {
  if (loading) return <div className="h-20 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
  if (error) return <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load accounts.</p>
  if (accounts.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-tlw-warm-gray">No billing accounts yet.</p>
        <Link
          href="/business-center/accounts"
          className="inline-block rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
        >
          Add account
        </Link>
      </div>
    )
  }

  const shown = size === 'compact' ? accounts.slice(0, 3) : accounts

  return (
    <div className="space-y-1.5">
      {shown.map((acct) => (
        <Link
          key={acct.id}
          href={`/business-center/accounts/${acct.id}`}
          className="flex items-center justify-between gap-3 rounded-tlw-lg px-2 py-1.5 transition-colors hover:bg-tlw-canvas"
        >
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-tlw-navy-deep">{acct.name}</p>
            {size !== 'compact' && (
              <p className="text-[11px] text-tlw-warm-gray">
                {acct.coacheeCount} {acct.coacheeCount === 1 ? 'coachee' : 'coachees'} · {acct.activeEngagements} active
              </p>
            )}
          </div>
          <span className="shrink-0 rounded-full bg-tlw-canvas px-2 py-0.5 text-[11px] font-medium capitalize text-tlw-warm-gray">
            {acct.type}
          </span>
        </Link>
      ))}
      {size === 'expanded' && (
        <Link href="/business-center/accounts" className="block pt-1 text-[12px] text-tlw-navy-deep underline-offset-2 hover:underline">
          Manage accounts →
        </Link>
      )}
    </div>
  )
}

export const accountsCard: DashboardCard<ReturnType<typeof useAccountsData>> = {
  ...CARD_META['bc-accounts'],
  useData: useAccountsData,
  render: ({ size, data }) => <Body size={size} {...data} />,
}
