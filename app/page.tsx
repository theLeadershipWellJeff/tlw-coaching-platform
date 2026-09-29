import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import Image from 'next/image'
import { COACH_PRICING } from '@/lib/access'
import { LegalFooter } from './components/legal/LegalPage'

/**
 * Public homepage — the "Application home page" on the Google OAuth consent
 * screen. Google's verification rejects a homepage that is "behind a login
 * page", so this must read as a product page first: what the app is, who it is
 * for, what it does, how it uses Google data, and the privacy policy — with
 * sign-in as a secondary action. The square wordmark is the logo uploaded to
 * the consent screen (public/logo-square-120.png); Google checks they match.
 * Signed-in coaches go straight to the dashboard.
 */

const FEATURES = [
  {
    title: 'Session prep',
    body: 'Before each session, a prep brief drawn from your own notes, the client’s goals, and what they committed to last time.',
  },
  {
    title: 'Session notes and follow-up',
    body: 'Write notes, capture actions and insights as you go, and send the client a clear recap they can act on.',
  },
  {
    title: 'Scheduling and reminders',
    body: 'Book the next session in two clicks, with conflict checks against your calendar and automatic reminders to the client.',
  },
  {
    title: 'Session scorecards',
    body: 'Upload a session recording transcript and see how the conversation measured against the ICF core competencies.',
  },
  {
    title: 'Client portal',
    body: 'Clients see their goals, the notes you sent, and their upcoming sessions, with an assistant that helps them reflect between sessions.',
  },
  {
    title: 'Billing',
    body: 'Invoices, reminders, and payments through Stripe, tied to the sessions you actually held.',
  },
]

const GOOGLE_USES = [
  {
    scope: 'Send email on your behalf',
    body: 'The session recaps, prep sheets, reminders, agreements, and invoices you write or approve go out from your own Gmail, so clients hear from you. The app cannot read, search, or delete your email.',
  },
  {
    scope: 'View your calendar',
    body: 'Shows your upcoming sessions, checks your free time before a booking, and picks up sessions clients book through your scheduling link.',
  },
  {
    scope: 'Manage calendar events',
    body: 'Creates the session on your calendar with the client invited when you book, and removes it when you cancel.',
  },
]

export default async function Home() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-tlw-navy-deep text-tlw-cream">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="hidden text-xs uppercase tracking-[4px] text-tlw-warm-gray sm:inline">theLeadershipWell</span>
        <nav className="ml-auto flex items-center gap-4 whitespace-nowrap text-[13px]">
          <a href="/api/auth/signin" className="text-tlw-cream/85 hover:text-tlw-cream underline-offset-4 hover:underline">
            Coach sign in
          </a>
          <Link
            href="/join"
            className="rounded-lg bg-tlw-cream px-3 py-2 font-medium text-tlw-navy-deep hover:bg-white"
          >
            Start free trial
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6">
        <section className="flex flex-col items-center py-12 text-center sm:py-16">
          <Image
            src="/logo-square.png"
            alt="theLeadershipWell"
            width={120}
            height={120}
            priority
            className="rounded-lg"
          />
          <h1 className="mt-8 max-w-3xl font-serif text-4xl font-light leading-tight sm:text-5xl">
            The coaching platform built for people-first leaders.
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-tlw-cream/85">
            TLW Coaching App is the practice platform from theLeadershipWell for professional coaches. It brings session
            prep, notes, scheduling, session scorecards, a client portal, and billing into one place, in your own voice.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/join"
              className="rounded-lg bg-tlw-cream px-6 py-3 text-sm font-medium text-tlw-navy-deep hover:bg-white"
            >
              Start a {COACH_PRICING.trialDays}-day free trial
            </Link>
            <a
              href="/api/auth/signin"
              className="rounded-lg border border-tlw-warm-gray/40 px-6 py-3 text-sm font-medium text-tlw-cream hover:bg-tlw-navy-rich"
            >
              Coach sign in
            </a>
          </div>
        </section>

        <section className="border-t border-tlw-warm-gray/20 py-12">
          <h2 className="text-center text-[12px] font-semibold uppercase tracking-[2px] text-tlw-warm-gray">
            What it does
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl bg-tlw-navy-rich/60 p-5">
                <h3 className="text-[15px] font-medium">{f.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-tlw-cream/80">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-tlw-warm-gray/20 py-12">
          <h2 className="text-center text-[12px] font-semibold uppercase tracking-[2px] text-tlw-warm-gray">
            How the app uses your Google account
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-[14px] leading-relaxed text-tlw-cream/80">
            Coaches sign in with Google. With your permission, the app uses three Google permissions, only to run your
            practice. Your Google data is never sold, never used for advertising, and never used to train AI models.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {GOOGLE_USES.map((g) => (
              <div key={g.scope} className="rounded-xl border border-tlw-warm-gray/25 p-5">
                <h3 className="text-[15px] font-medium">{g.scope}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-tlw-cream/80">{g.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-[13px]">
            <Link href="/privacy" className="text-tlw-cream underline underline-offset-4 hover:text-white">
              Read the privacy policy
            </Link>
          </p>
        </section>

        <section className="border-t border-tlw-warm-gray/20 py-12 text-center">
          <h2 className="text-[12px] font-semibold uppercase tracking-[2px] text-tlw-warm-gray">Pricing</h2>
          <p className="mt-4 font-serif text-4xl font-light">
            ${COACH_PRICING.monthlyUsd}
            <span className="ml-2 font-sans text-base text-tlw-warm-gray">per month</span>
          </p>
          <p className="mt-2 text-[14px] text-tlw-cream/80">
            or ${COACH_PRICING.annualUsd} per year. {COACH_PRICING.trialDays}-day free trial. Your data is yours to
            download at any time.
          </p>
          <Link
            href="/join"
            className="mt-6 inline-block rounded-lg bg-tlw-cream px-6 py-3 text-sm font-medium text-tlw-navy-deep hover:bg-white"
          >
            See plans and start your trial
          </Link>
        </section>

        <div className="flex justify-center pb-10">
          <LegalFooter light />
        </div>
      </main>
    </div>
  )
}
