import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { TLWLogo } from './components/TLWLogo'
import { LegalFooter } from './components/legal/LegalPage'

/**
 * Public homepage — also the "Application home page" on the Google OAuth
 * consent screen, so it must say what the app does, why it asks for Gmail and
 * Calendar access, and link the privacy policy. Signed-in coaches go straight
 * to the dashboard.
 */
export default async function Home() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-tlw-navy-deep text-tlw-cream flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl flex flex-col items-center text-center">
        <TLWLogo size={56} light />
        <p className="text-tlw-warm-gray text-xs tracking-[5px] uppercase mt-4 mb-2">theLeadershipWell</p>
        <h1 className="font-serif text-3xl font-light mb-4">TLW Coaching App</h1>
        <p className="text-[15px] leading-relaxed text-tlw-cream/85">
          The practice platform for professional coaches: session notes and prep, scheduling and reminders, session
          scorecards against the ICF competencies, a client portal, and billing, in one place.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-tlw-warm-gray">
          Coaches sign in with Google. The app sends the emails you write or approve from your own Gmail, and reads and
          books your coaching sessions on your Google Calendar. It never reads your inbox.{' '}
          <Link href="/privacy" className="underline hover:text-tlw-cream">
            How we use your data
          </Link>
        </p>
        <a
          href="/api/auth/signin"
          className="mt-10 px-8 py-3 bg-tlw-navy-rich border border-tlw-warm-gray/30 rounded-lg text-tlw-cream text-sm font-medium hover:bg-tlw-navy-rich/80 transition-colors"
        >
          Sign in with Google
        </a>
        <p className="mt-8 text-[12px] text-tlw-warm-gray">
          New here?{' '}
          <a href="/join" className="underline hover:text-tlw-cream">
            Start a 14-day free trial
          </a>
        </p>
        <LegalFooter light />
      </div>
    </div>
  )
}
