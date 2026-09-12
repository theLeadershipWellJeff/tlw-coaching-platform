'use client'
import { useEffect, useState } from 'react'
import { PlanPicker } from '@/app/components/subscription/PlanPicker'

type Status = {
  plan: 'beta' | 'paying' | 'lapsed'
  locked: boolean
  reason: string
  planNote: string | null
  subscriptionStatus: string | null
  hasCustomer: boolean
  subscription: {
    status: string
    trialEnd: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
    interval: 'month' | 'year' | null
  } | null
  intervals: ('month' | 'year')[]
}

function fmt(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Account → Subscription: the coach's own plan state, the Stripe billing
 * portal (card / invoices / cancel), a "start a subscription" picker for beta
 * coaches converting themselves, and "Download my data" — always available.
 */
export function SubscriptionSettings() {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/subscription/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStatus(d))
      .catch(() => {})
  }, [])

  async function openPortal() {
    setBusy(true)
    setError('')
    const res = await fetch('/api/subscription/portal', { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok && d.url) window.location.href = d.url
    else setError(d.error ?? 'Could not open the billing portal.')
  }

  const sub = status?.subscription
  let line = 'Loading…'
  if (status) {
    if (status.reason === 'supervisor') line = 'Firm account — no subscription needed.'
    else if (status.plan === 'beta') line = `Beta plan — free while the beta runs.${status.planNote ? ` (${status.planNote})` : ''}`
    else if (status.plan === 'paying') {
      if (sub?.status === 'trialing' && sub.trialEnd) line = `Free trial — your ${sub.interval === 'year' ? 'annual' : 'monthly'} plan starts ${fmt(sub.trialEnd)}.`
      else if (sub?.cancelAtPeriodEnd && sub.currentPeriodEnd) line = `Subscription ends ${fmt(sub.currentPeriodEnd)} (cancelled — you keep access until then).`
      else if (sub?.status === 'past_due') line = 'Payment past due — please update your card to keep access.'
      else if (sub?.currentPeriodEnd) line = `${sub.interval === 'year' ? 'Annual' : 'Monthly'} plan — renews ${fmt(sub.currentPeriodEnd)}.`
      else line = `Paying plan.${status.planNote ? ` (${status.planNote})` : ''}`
    } else line = 'No active subscription.'
  }

  const showPicker = status && status.reason !== 'supervisor' && (status.plan === 'beta' || status.plan === 'lapsed') && !(sub && ['active', 'trialing', 'past_due'].includes(sub.status))

  return (
    <div className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Subscription</p>
      <p className="text-[13px] text-tlw-espresso">{line}</p>

      {showPicker && (
        <div className="mt-4">
          {status?.plan === 'beta' && (
            <p className="mb-3 text-[12px] text-tlw-warm-gray">
              Ready to move off the beta plan? Choose a plan below — your account and every client stay exactly as they are.
            </p>
          )}
          <PlanPicker context="account" />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {status?.hasCustomer && (
          <button
            onClick={openPortal}
            disabled={busy}
            className="rounded-tlw-md border border-tlw-warm-gray/30 px-3 py-1.5 text-[12px] font-medium text-tlw-espresso transition-colors hover:bg-tlw-warm-gray/[0.08] disabled:opacity-50"
          >
            {busy ? 'Opening…' : 'Manage billing (card, invoices, cancel)'}
          </button>
        )}
        <a
          href="/api/subscription/export"
          className="rounded-tlw-md border border-tlw-warm-gray/30 px-3 py-1.5 text-[12px] font-medium text-tlw-espresso transition-colors hover:bg-tlw-warm-gray/[0.08]"
        >
          Download my data (.zip)
        </a>
      </div>
      <p className="mt-2 text-[11px] text-tlw-warm-gray">
        The download holds every client, session note, transcript, scorecard, action, appointment, and message as plain files — yours to keep, whatever you decide about the platform.
      </p>
      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
    </div>
  )
}
