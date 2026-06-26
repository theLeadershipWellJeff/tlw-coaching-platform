'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CARD_META } from '@/lib/dashboard/cards'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'

type RunSummary = {
  draftCount: number
  draftTotal: number
  currency: string
}

function useRunData(): { loading: boolean; data: RunSummary | null; error: boolean } {
  const [state, setState] = useState<{ loading: boolean; data: RunSummary | null; error: boolean }>(
    { loading: true, data: null, error: false },
  )
  useEffect(() => {
    let active = true
    fetch('/api/billing/invoices?status=draft')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!active) return
        const invoices: any[] = d.invoices ?? []
        const draftTotal = invoices.reduce((s: number, inv: any) => s + (inv.total ?? 0), 0)
        setState({ loading: false, data: { draftCount: invoices.length, draftTotal, currency: 'usd' }, error: false })
      })
      .catch(() => active && setState({ loading: false, data: null, error: true }))
    return () => { active = false }
  }, [])
  return state
}

function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function Body({ size, data, loading, error }: { size: CardSize; loading: boolean; data: RunSummary | null; error: boolean }) {
  const router = useRouter()
  if (loading) return <div className="h-16 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
  if (error || !data) return <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load billing run.</p>

  const { draftCount, draftTotal } = data
  const ready = draftCount > 0

  return (
    <div className="space-y-3">
      {ready ? (
        <>
          <div>
            <p className="text-2xl font-semibold text-tlw-navy-deep">{money(draftTotal)}</p>
            <p className="mt-0.5 text-[13px] text-tlw-warm-gray">
              {draftCount} draft {draftCount === 1 ? 'invoice' : 'invoices'} ready to review
            </p>
          </div>
          {size !== 'compact' && (
            <button
              onClick={() => router.push('/business-center/run')}
              className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich"
            >
              Review &amp; approve
            </button>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-tlw-warm-gray">No drafts assembled yet.</p>
          {size !== 'compact' && (
            <button
              onClick={() => router.push('/business-center/run')}
              className="w-fit rounded-tlw-lg border border-tlw-warm-gray/30 px-4 py-2 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
            >
              Start billing run
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export const billingRunCard: DashboardCard<ReturnType<typeof useRunData>> = {
  ...CARD_META['bc-billing-run'],
  useData: useRunData,
  render: ({ size, data }) => <Body size={size} {...data} />,
}
