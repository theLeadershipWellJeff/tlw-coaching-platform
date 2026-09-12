import Link from 'next/link'
import { TLWLogo } from '@/app/components/TLWLogo'
import { COACH_PRICING } from '@/lib/access'
import { configuredCoachIntervals } from '@/lib/billing/stripe'
import { JoinForm } from './JoinForm'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'theLeadershipWell — Join the coaching platform',
}

/**
 * PUBLIC self-serve signup. Pricing, what the platform does, a name + email
 * form → Stripe hosted Checkout (14-day free trial, card required, discount
 * codes on the payment page). The coaches row is created on completion, so
 * an abandoned checkout leaves nothing behind.
 */
export default function JoinPage({ searchParams }: { searchParams?: { cancelled?: string } }) {
  const intervals = configuredCoachIntervals()
  const cancelled = searchParams?.cancelled === '1'
  return (
    <div className="min-h-screen bg-tlw-navy-deep text-tlw-cream">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <div className="flex items-center gap-3">
          <TLWLogo size={44} light />
          <p className="text-xs uppercase tracking-[5px] text-tlw-warm-gray">theLeadershipWell</p>
        </div>

        <h1 className="mt-10 font-serif text-4xl font-light leading-tight">
          The coaching platform built for people-first leaders.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-tlw-cream/85">
          Session prep drawn from your own notes, a scorecard for every recorded session against the ICF competencies, a client portal with an assistant that has read your client&apos;s whole history, and the billing, scheduling, and follow-up rails a practice runs on. One place, your voice.
        </p>

        <div className="mt-10 grid gap-8 md:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[2px] text-tlw-warm-gray">Pricing</p>
            <p className="mt-2 font-serif text-5xl font-light">
              ${COACH_PRICING.monthlyUsd}
              <span className="ml-2 font-sans text-base text-tlw-warm-gray">per month</span>
            </p>
            <p className="mt-1 text-[14px] text-tlw-cream/85">
              or ${COACH_PRICING.annualUsd} per year — two months free.
            </p>
            <ul className="mt-6 space-y-2 text-[14px] text-tlw-cream/85">
              <li>· {COACH_PRICING.trialDays}-day free trial, cancel any time before it ends and you pay nothing</li>
              <li>· Unlimited clients, sessions, and scorecards</li>
              <li>· Client portal and assistant included</li>
              <li>· Your data is yours — download everything at any time</li>
              <li>· Discount codes are entered on the payment page</li>
            </ul>
            <p className="mt-6 text-[12px] text-tlw-warm-gray">
              Already have an account?{' '}
              <Link href="/" className="underline hover:text-tlw-cream">Sign in</Link>
            </p>
          </div>

          <div className="rounded-tlw-2xl bg-tlw-surface p-6 text-tlw-espresso shadow-xl">
            {cancelled && (
              <p className="mb-4 rounded-tlw-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                Checkout was cancelled — no charge was made. Pick up whenever you are ready.
              </p>
            )}
            <JoinForm intervals={intervals} />
          </div>
        </div>

        <p className="mt-12 text-[12px] text-tlw-warm-gray">
          You will sign in with the Google account for the email you enter here — the platform sends and books from your own Gmail and Calendar, so that account is the one to use.
        </p>
      </div>
    </div>
  )
}
