'use client'
import { useState } from 'react'
import { COACH_PRICING } from '@/lib/access'

type Interval = 'month' | 'year'

export function JoinForm({ intervals }: { intervals: Interval[] }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [interval, setInterval] = useState<Interval>(intervals.includes('year') ? 'year' : 'month')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (intervals.length === 0) {
    return (
      <p className="text-[13px] text-tlw-warm-gray">
        Sign-ups are not open just yet. Email us and we will set you up by hand.
      </p>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await fetch('/api/join/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, interval }),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.url) {
      window.location.href = d.url
      return
    }
    setBusy(false)
    setError(d.error ?? 'Something went wrong. Please try again.')
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="font-serif text-2xl font-light text-tlw-navy-deep">Start your free trial</h2>
      <div>
        <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Your name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dr. Jane Smith"
          className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[14px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
        />
      </div>
      <div>
        <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Email (your Google account)</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@example.com"
          className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[14px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
        />
        <p className="mt-1 text-[11px] text-tlw-warm-gray">This is the account you will sign in with.</p>
      </div>
      {intervals.length > 1 && (
        <div>
          <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Plan</label>
          <div className="grid grid-cols-2 gap-2">
            {intervals.includes('month') && (
              <IntervalButton active={interval === 'month'} onClick={() => setInterval('month')} title="Monthly" sub={`$${COACH_PRICING.monthlyUsd}/mo`} />
            )}
            {intervals.includes('year') && (
              <IntervalButton active={interval === 'year'} onClick={() => setInterval('year')} title="Annual" sub={`$${COACH_PRICING.annualUsd}/yr · 2 months free`} />
            )}
          </div>
        </div>
      )}
      {error && <p className="text-[12px] text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-tlw-lg bg-tlw-navy-deep px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Opening secure checkout…' : `Start ${COACH_PRICING.trialDays}-day free trial`}
      </button>
      <p className="text-center text-[11px] text-tlw-warm-gray">
        Card required · nothing is charged until the trial ends · cancel any time · discount codes on the next page
      </p>
    </form>
  )
}

function IntervalButton({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-tlw-lg border px-3 py-2 text-left transition-colors ${
        active ? 'border-tlw-navy-deep bg-tlw-navy-deep text-white' : 'border-tlw-warm-gray/30 text-tlw-espresso hover:bg-tlw-canvas'
      }`}
    >
      <p className="text-[13px] font-medium">{title}</p>
      <p className={`text-[11px] ${active ? 'text-tlw-cream/80' : 'text-tlw-warm-gray'}`}>{sub}</p>
    </button>
  )
}
