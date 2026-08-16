'use client'
import { useEffect, useState } from 'react'

type Step = { title: string; body: string; icon: string }

/**
 * The steps mirror the home page's cards, in the order they appear, so the tour
 * reads as a walk through what's on screen rather than a generic pitch.
 */
const STEPS: Step[] = [
  {
    icon: '📅',
    title: 'Book your next session',
    body: 'The button at the top opens your coach’s calendar. Pick any open time — it lands on their schedule and shows up here as your next session.',
  },
  {
    icon: '🔎',
    title: 'Search everything',
    body: 'The search box looks across every session and every set of notes your coach sent you. Use it when you half-remember something and want the exact words back — most people come here to find something to pass on to their team.',
  },
  {
    icon: '💬',
    title: 'Chat with your assistant',
    body: 'An assistant that has read your goals, your sessions, and your notes. Ask it what themes keep coming up, how to prepare for next time, or to think through a decision with you.',
  },
  {
    icon: '🎯',
    title: 'Your goals and sessions',
    body: 'Your coaching goals, a record of every session, and the notes your coach sent after each one. Open any of them to read in full.',
  },
  {
    icon: '✉️',
    title: 'Reach your coach',
    body: 'Send your coach a note straight from here any time — no need to switch to email.',
  },
  {
    icon: 'ⓘ',
    title: 'Tips are always there',
    body: 'Every card has a small ⓘ button explaining what it holds and a few ways to use it. Nothing here is hidden — take the tour again any time from the link at the bottom of the page.',
  },
]

/**
 * First-visit walkthrough. The "taken" flag lives on the client record (migration
 * 053) rather than localStorage, so it does not re-fire on every new device and
 * can be replayed deliberately from the home page.
 */
export function PortalTour({
  onboarded,
  openSignal = 0,
}: {
  onboarded: boolean
  /** Bump to reopen the tour on demand ("take the tour again"). */
  openSignal?: number
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!onboarded) setOpen(true)
  }, [onboarded])

  useEffect(() => {
    if (openSignal > 0) {
      setStep(0)
      setOpen(true)
    }
  }, [openSignal])

  async function finish() {
    setOpen(false)
    setStep(0)
    try {
      await fetch('/api/portal/onboarded', { method: 'POST' })
    } catch {
      /* the tour simply shows again next visit */
    }
  }

  if (!open) return null
  const s = STEPS[step]
  const last = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tlw-navy-deep/40 p-4">
      <div className="w-full max-w-md rounded-tlw-2xl bg-tlw-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
            Step {step + 1} of {STEPS.length}
          </p>
          <button
            onClick={finish}
            className="text-[12px] text-tlw-warm-gray hover:text-tlw-espresso"
            aria-label="Skip the tour"
          >
            Skip
          </button>
        </div>

        <div className="mt-4 flex items-start gap-3">
          <span className="text-[22px] leading-none" aria-hidden>
            {s.icon}
          </span>
          <div>
            <h2 className="text-[17px] font-medium text-tlw-navy-deep">{s.title}</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-tlw-espresso">{s.body}</p>
          </div>
        </div>

        {/* Progress dots double as direct navigation. */}
        <div className="mt-5 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-5 bg-tlw-signal-orange' : 'w-1.5 bg-tlw-warm-gray/30'
              }`}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={() => setStep((v) => Math.max(0, v - 1))}
            disabled={step === 0}
            className="text-[13px] font-medium text-tlw-warm-gray hover:text-tlw-espresso disabled:opacity-30"
          >
            ← Back
          </button>
          <button
            onClick={() => (last ? finish() : setStep((v) => v + 1))}
            className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-tlw-navy-rich"
          >
            {last ? 'Start exploring' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** The replay link, rendered at the foot of the portal home. */
export function TourReplayLink({ onReplay }: { onReplay: () => void }) {
  return (
    <button
      onClick={onReplay}
      className="text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
    >
      Take the tour again
    </button>
  )
}
