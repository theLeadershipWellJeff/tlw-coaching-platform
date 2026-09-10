'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Per-browser belt-and-braces for the "taken" flag. The client record is the
 * source of truth (it follows the person to a new device), but this page's
 * server payload can be served from the router cache for a short while after
 * the flag is written, and a failed write must not turn into a tour that
 * greets someone on every visit. Either signal = don't auto-open.
 */
const LOCAL_KEY = 'tlw-portal-tour-done'
function localDone(): boolean {
  try {
    return window.localStorage.getItem(LOCAL_KEY) === '1'
  } catch {
    return false
  }
}
function rememberLocally() {
  try {
    window.localStorage.setItem(LOCAL_KEY, '1')
  } catch {
    /* private mode etc. — the server flag still covers it */
  }
}

type Step = {
  key: string
  title: string
  body: string
  icon: string
  /** Swapped in when nobody is coaching them (a standalone or enterprise participant). */
  noCoach?: { title: string; body: string }
}

export type TourContext = {
  /** Someone is coaching them — otherwise coach-only cards are not on the page. */
  hasCoach: boolean
  /** The 360 report card is mounted (portal_features.assessments). */
  assessmentsEnabled: boolean
  /** The "Schedule your next session" button is on the page (coach has a booking link). */
  hasBooking: boolean
}

/**
 * The steps mirror the home page top to bottom, so the tour reads as a walk
 * through what is actually on screen rather than a generic pitch. A step for
 * something the page does not render for this person (no booking button, no
 * 360 card, coach-only cards for a participant without a coach) is left out,
 * so the count and the dots always match what they can go and find.
 */
export function buildTourSteps(ctx: TourContext): Step[] {
  const steps: (Step & { when?: boolean })[] = [
    {
      key: 'booking',
      when: ctx.hasBooking,
      icon: '📅',
      title: 'Book your next session',
      body: 'The button at the top opens your coach’s calendar. Pick any open time and it lands on their schedule and shows up here under Upcoming sessions.',
      noCoach: {
        title: 'Book a conversation',
        body: 'The button at the top opens a theLeadershipWell coach’s calendar. Pick any open time if you want to work through your report with a person.',
      },
    },
    {
      key: 'assessment',
      when: ctx.assessmentsEnabled,
      icon: '📊',
      title: 'Your 360 report',
      body: 'Your feedback report lives at the top of the page, ready to view or download whenever you want it. The assistant has read it too, so you can ask what your raters saw, where you and they see things differently, and what to do with that.',
    },
    {
      key: 'chat',
      icon: '💬',
      title: 'Chat with your assistant',
      body: 'An assistant that has read your goals, your sessions, your notes, and any documents you add. Ask it what themes keep coming up, how to prepare for next time, or to think through a decision with you. When something lands, “Save as a goal” turns it into a goal on this page.',
      noCoach: {
        title: 'Chat with your thinking partner',
        body: 'An assistant that has read your report, your goals, and any documents you add. Ask it what stands out, where to start, or to think through a decision with you. When something lands, “Save as a goal” turns it into a goal on this page.',
      },
    },
    {
      key: 'week',
      icon: '🗓️',
      title: 'Plan your week',
      body: 'A short coaching conversation that ends in your Top 5 for the week. Save it and it appears in the “This week” card, where you tick things off as they get done and add a to-do without opening the chat. Next week the assistant knows what got done.',
    },
    {
      key: 'notes',
      icon: '📓',
      title: 'My notes',
      body: 'Your own space to think: projects, intentions, things you noticed between sessions. Nobody else can read it, your coach included. The assistant reads your newest notes so it can work with your current thinking.',
      noCoach: {
        title: 'My notes',
        body: 'Your own space to think: projects, intentions, things you noticed. Nobody else can read it. The assistant reads your newest notes so it can work with your current thinking.',
      },
    },
    {
      key: 'goals',
      icon: '🎯',
      title: 'Your goals, with progress you report',
      body: 'The goals you and your coach are working on, plus any you add yourself. Each one has a progress ring: drag it as you go, or mark it complete when you get there. Your coach sees your progress too.',
      noCoach: {
        title: 'Your goals, with progress you report',
        body: 'Goals you set for yourself, each with how you will know it is working. Add one from here or from the chat, then drag the progress ring as you go and mark it complete when you get there.',
      },
    },
    {
      key: 'sessions',
      when: ctx.hasCoach,
      icon: '📚',
      title: 'Sessions, transcripts, and notes',
      body: 'Your upcoming sessions, a transcript of every past one, the notes your coach sent afterwards, and their other messages. Open any of them to read in full. The search box up top looks across all of it, for when you half-remember something and want the exact words back.',
    },
    {
      key: 'documents',
      icon: '📄',
      title: 'Your documents',
      body: 'Add a 360 report, a personnel review, or any document you want the assistant to know about: a role description, a plan, feedback you received. A personnel review is private to you, and for the rest you choose what your coach can see. Download anything any time.',
      noCoach: {
        title: 'Your documents',
        body: 'Add a 360 report, a personnel review, or any document you want the assistant to know about: a role description, a plan, feedback you received. Everything here is private to you, and you can download it any time.',
      },
    },
    {
      key: 'contact',
      icon: '✉️',
      title: 'Reach your coach',
      body: 'Send your coach a note straight from the card at the bottom any time, no need to switch to email. Good for a quick question between sessions or something you want to flag before you next meet.',
      noCoach: {
        title: 'Talk to a theLeadershipWell coach',
        body: 'Want to work through your report with a person? Book a conversation with one of our coaches from the card at the bottom, or send us a note and someone will reply by email.',
      },
    },
    {
      key: 'settings',
      icon: '⚙️',
      title: 'Settings and reminders',
      body: 'Settings, top right, is where you set what we call you, your timezone, and an optional username and password if you would rather not wait for an emailed link. Email reminders live there too: a weekly nudge to plan your week, a quarterly goal check-in, and a note if you have been away a while. Each one is yours to switch off.',
    },
    {
      key: 'tips',
      icon: 'ⓘ',
      title: 'Tips are always there',
      body: 'Every card has a small ⓘ button explaining what it holds and a few ways to use it. Nothing here is hidden. Take the tour again any time from the link at the bottom of the page.',
    },
  ]
  return steps
    .filter((s) => s.when !== false)
    .map(({ when: _when, ...s }) => s)
}

/**
 * First-visit walkthrough. The "taken" flag lives on the client record (migration
 * 053) rather than localStorage, so it does not re-fire on every new device and
 * can be replayed deliberately from the home page.
 */
export function PortalTour({
  onboarded,
  openSignal = 0,
  hasCoach = true,
  assessmentsEnabled = false,
  hasBooking = true,
}: {
  onboarded: boolean
  /** Bump to reopen the tour on demand ("take the tour again"). */
  openSignal?: number
  /** Someone is coaching them — otherwise coach-only steps drop out and the rest re-word. */
  hasCoach?: boolean
  /** The 360 report card is on the page — adds its step. */
  assessmentsEnabled?: boolean
  /** The booking button is on the page — otherwise its step is left out. */
  hasBooking?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const router = useRouter()
  const steps = useMemo(
    () => buildTourSteps({ hasCoach, assessmentsEnabled, hasBooking }),
    [hasCoach, assessmentsEnabled, hasBooking]
  )

  useEffect(() => {
    if (!onboarded && !localDone()) setOpen(true)
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
    rememberLocally()
    try {
      const res = await fetch('/api/portal/onboarded', { method: 'POST' })
      if (!res.ok) console.error('portal tour flag not saved:', res.status, await res.text().catch(() => ''))
      // Drop the cached server payload for this page so the next visit reads
      // the flag fresh instead of a copy taken before it was set.
      router.refresh()
    } catch (e) {
      console.error('portal tour flag not saved:', e)
    }
  }

  if (!open) return null
  // Clamp in case the step list shrank underneath an open tour (props changed).
  const at = Math.min(step, steps.length - 1)
  const raw = steps[at]
  const s = !hasCoach && raw.noCoach ? { ...raw, ...raw.noCoach } : raw
  const last = at === steps.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tlw-navy-deep/40 p-4">
      <div className="w-full max-w-md rounded-tlw-2xl bg-tlw-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
            Step {at + 1} of {steps.length}
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
          {steps.map((st, i) => (
            <button
              key={st.key}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === at ? 'w-5 bg-tlw-signal-orange' : 'w-1.5 bg-tlw-warm-gray/30'
              }`}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={() => setStep(Math.max(0, at - 1))}
            disabled={at === 0}
            className="text-[13px] font-medium text-tlw-warm-gray hover:text-tlw-espresso disabled:opacity-30"
          >
            ← Back
          </button>
          <button
            onClick={() => (last ? finish() : setStep(at + 1))}
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
