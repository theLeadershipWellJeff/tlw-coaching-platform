'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const DISMISS_KEY = 'tlw-welcome-dismissed'

type StepState = {
  timezone: boolean
  signature: boolean
  transcriptSource: boolean
  hasClients: boolean
}

/**
 * First-run setup checklist for a new coach. Shows on the dashboard until the
 * coach has at least one client (or dismisses it) — walks them through the
 * settings that make the app theirs: timezone/calendar, email signature,
 * transcript source, first client. Dismissal persists in localStorage, and is
 * auto-persisted once the roster has clients so established coaches pay for at
 * most ONE roster check ever.
 */
export function WelcomeChecklist() {
  const [visible, setVisible] = useState(false)
  const [steps, setSteps] = useState<StepState>({
    timezone: false,
    signature: false,
    transcriptSource: false,
    hasClients: false,
  })

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY)) return
    let cancelled = false
    async function load() {
      try {
        // Cheap gate first: an established coach short-circuits here and the
        // dismissal is persisted so this fetch never repeats.
        const clientsRes = await fetch('/api/clients')
        if (cancelled || !clientsRes.ok) return
        const clientsData = await clientsRes.json()
        const clientCount = Array.isArray(clientsData?.clients) ? clientsData.clients.length : 0
        if (clientCount > 0) {
          try {
            localStorage.setItem(DISMISS_KEY, '1')
          } catch {
            /* ignore */
          }
          return
        }

        const [coachRes, sigRes] = await Promise.all([fetch('/api/coach'), fetch('/api/email/signature')])
        if (cancelled) return
        const coach = coachRes.ok ? (await coachRes.json())?.coach : null
        const sig = sigRes.ok ? await sigRes.json() : null
        setSteps({
          timezone: !!coach?.timezone,
          signature: !!sig?.custom,
          transcriptSource: !!coach?.transcript_source,
          hasClients: false,
        })
        setVisible(true)
      } catch {
        /* stay hidden on any error */
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (!visible) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
  }

  const items: { done: boolean; label: string; href: string; cta: string }[] = [
    { done: steps.timezone, label: 'Set your timezone and pick your calendar', href: '/account', cta: 'Open Account' },
    { done: steps.signature, label: 'Build your email signature', href: '/account', cta: 'Open Account' },
    {
      done: steps.transcriptSource,
      label: 'Choose your transcript source (manual upload works today)',
      href: '/account',
      cta: 'Open Account',
    },
    { done: steps.hasClients, label: 'Add your first client', href: '/clients', cta: 'Open Clients' },
  ]

  return (
    <div className="mb-6 rounded-tlw-2xl border border-tlw-navy-deep/15 bg-tlw-surface p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Welcome</p>
          <h2 className="mt-1 text-[16px] font-semibold text-tlw-navy-deep">Set up your practice</h2>
          <p className="mt-1 text-[13px] text-tlw-warm-gray">
            A few one-time settings make every email, booking, and scorecard read as yours.
          </p>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 text-[12px] text-tlw-warm-gray hover:text-tlw-espresso"
          title="Hide this checklist"
        >
          dismiss
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-3 text-[13px]">
            <span
              aria-hidden
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                item.done
                  ? 'border-transparent bg-tlw-navy-deep text-white'
                  : 'border-tlw-warm-gray/40 text-transparent'
              }`}
            >
              ✓
            </span>
            <span className={item.done ? 'text-tlw-warm-gray line-through' : 'text-tlw-espresso'}>{item.label}</span>
            {!item.done && (
              <Link href={item.href} className="ml-auto shrink-0 text-[12px] font-medium text-tlw-navy-deep hover:underline">
                {item.cta} →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
