'use client'
import { useEffect, useState } from 'react'
import { COACH_PRICING } from '@/lib/access'

type Interval = 'month' | 'year'

/**
 * The two plan buttons (monthly / annual) shared by the paywall and the
 * Account → Subscription card. Calls POST /api/subscription/checkout for the
 * signed-in coach and follows the Stripe URL. Reads which intervals are
 * configured from /api/subscription/status so an unset annual price simply
 * doesn't show. Promotion codes are entered on Stripe's page.
 */
export function PlanPicker({ context }: { context: 'wall' | 'account' }) {
  const [intervals, setIntervals] = useState<Interval[] | null>(null)
  const [busy, setBusy] = useState<Interval | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    fetch('/api/subscription/status')
      .then((r) => r.json())
      .then((d) => { if (alive) setIntervals(Array.isArray(d.intervals) ? d.intervals : []) })
      .catch(() => { if (alive) setIntervals([]) })
    return () => { alive = false }
  }, [])

  async function start(interval: Interval) {
    setBusy(interval)
    setError('')
    const res = await fetch('/api/subscription/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interval }),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.url) {
      window.location.href = d.url
      return
    }
    setBusy(null)
    setError(d.error ?? 'Could not start checkout.')
  }

  if (intervals === null) return <p className="text-[12px] text-tlw-warm-gray">Loading plans…</p>
  if (intervals.length === 0) {
    return (
      <p className="text-[13px] text-tlw-warm-gray">
        Subscriptions are not open yet. Please contact us and we will set you up by hand.
      </p>
    )
  }

  return (
    <div>
      <div className={`grid gap-3 ${intervals.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {intervals.includes('month') && (
          <PlanCard
            title="Monthly"
            price={`$${COACH_PRICING.monthlyUsd}`}
            per="per month"
            note="Cancel any time."
            busy={busy === 'month'}
            disabled={busy !== null}
            onClick={() => start('month')}
          />
        )}
        {intervals.includes('year') && (
          <PlanCard
            title="Annual"
            price={`$${COACH_PRICING.annualUsd}`}
            per="per year"
            note="Two months free."
            highlight
            busy={busy === 'year'}
            disabled={busy !== null}
            onClick={() => start('year')}
          />
        )}
      </div>
      <p className="mt-3 text-center text-[11px] text-tlw-warm-gray">
        Have a discount code? Enter it on the payment page.{context === 'wall' ? ' Payment is handled securely by Stripe.' : ''}
      </p>
      {error && <p className="mt-2 text-center text-[12px] text-red-600">{error}</p>}
    </div>
  )
}

function PlanCard({ title, price, per, note, highlight, busy, disabled, onClick }: {
  title: string
  price: string
  per: string
  note: string
  highlight?: boolean
  busy: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-tlw-xl border p-4 text-left transition-colors disabled:opacity-60 ${
        highlight ? 'border-tlw-navy-deep bg-tlw-navy-deep text-white hover:bg-tlw-navy-deep/90' : 'border-tlw-warm-gray/30 bg-tlw-canvas text-tlw-espresso hover:bg-tlw-warm-gray/10'
      }`}
    >
      <p className={`text-[11px] font-semibold uppercase tracking-[2px] ${highlight ? 'text-tlw-cream/70' : 'text-tlw-warm-gray'}`}>{title}</p>
      <p className="mt-1 font-serif text-3xl font-light">{price}</p>
      <p className={`text-[12px] ${highlight ? 'text-tlw-cream/80' : 'text-tlw-warm-gray'}`}>{per} · {note}</p>
      <p className="mt-3 text-[13px] font-medium">{busy ? 'Opening checkout…' : `Choose ${title.toLowerCase()} →`}</p>
    </button>
  )
}
