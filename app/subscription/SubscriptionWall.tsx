'use client'
import { useState } from 'react'
import { TLWLogo } from '@/app/components/TLWLogo'
import { PlanPicker } from '@/app/components/subscription/PlanPicker'

export function SubscriptionWall({
  name,
  email,
  subscriptionStatus,
  hasCustomer,
}: {
  name: string
  email: string
  subscriptionStatus: string | null
  hasCustomer: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function openPortal() {
    setBusy(true)
    setError('')
    const res = await fetch('/api/subscription/portal', { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok && d.url) window.location.href = d.url
    else setError(d.error ?? 'Could not open the billing portal.')
  }

  const why =
    subscriptionStatus === 'past_due' || subscriptionStatus === 'unpaid'
      ? 'Your last payment did not go through, so access is paused.'
      : subscriptionStatus === 'canceled'
        ? 'Your subscription has ended.'
        : 'Your access to the platform has ended.'

  return (
    <div className="min-h-screen bg-tlw-navy-deep text-tlw-cream">
      <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-16">
        <TLWLogo size={56} light />
        <p className="mt-4 text-xs uppercase tracking-[5px] text-tlw-warm-gray">theLeadershipWell</p>
        <h1 className="mt-6 text-center font-serif text-3xl font-light">Your subscription</h1>
        <p className="mt-3 max-w-md text-center text-sm text-tlw-warm-gray">
          Hi {name.split(' ')[0]}. {why} Everything you built here is kept exactly as you left it and is yours to download below. Subscribe to pick up where you left off.
        </p>

        <div className="mt-10 w-full rounded-tlw-2xl bg-tlw-surface p-6 text-tlw-espresso shadow-xl">
          <PlanPicker context="wall" />
          {hasCustomer && (
            <p className="mt-4 text-center text-[12px] text-tlw-warm-gray">
              Already have a card on file with us?{' '}
              <button onClick={openPortal} disabled={busy} className="font-medium text-tlw-navy-deep underline disabled:opacity-50">
                Update your card or reactivate in the billing portal
              </button>
            </p>
          )}
          {error && <p className="mt-2 text-center text-[12px] text-red-600">{error}</p>}
        </div>

        <div className="mt-6 w-full rounded-tlw-2xl border border-tlw-warm-gray/30 p-6">
          <h2 className="text-[13px] font-semibold uppercase tracking-[2px] text-tlw-warm-gray">Your data</h2>
          <p className="mt-2 text-sm text-tlw-cream/90">
            Download everything — clients, session notes, transcripts, scorecards, actions, appointments, communications — as one ZIP of plain files you can read anywhere.
          </p>
          <a
            href="/api/subscription/export"
            className="mt-4 inline-flex items-center rounded-tlw-lg border border-tlw-cream/40 px-4 py-2 text-[13px] font-medium text-tlw-cream transition-colors hover:bg-tlw-cream/10"
          >
            Download my data (.zip)
          </a>
        </div>

        <p className="mt-10 text-[12px] text-tlw-warm-gray">
          Signed in as {email} ·{' '}
          <a href="/api/auth/signout" className="underline hover:text-tlw-cream">
            Sign out
          </a>
        </p>
      </div>
    </div>
  )
}
