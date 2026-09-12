import Link from 'next/link'
import { TLWLogo } from '@/app/components/TLWLogo'

/**
 * NextAuth error page (authOptions.pages.error). The one case that matters is
 * AccessDenied — a Google account with no `coaches` row was refused by the
 * sign-in gate. Everything else gets a one-line generic message. The error
 * code is never echoed and no detail from the provider reaches the page.
 */
export const dynamic = 'force-dynamic'

export default function AuthErrorPage({ searchParams }: { searchParams?: { error?: string | string[] } }) {
  const raw = searchParams?.error
  const code = Array.isArray(raw) ? raw[0] : raw
  const denied = code === 'AccessDenied'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <TLWLogo size={56} light />
      <p className="text-tlw-warm-gray text-xs tracking-[5px] uppercase mt-4 mb-6">theLeadershipWell</p>
      <h1 className="font-serif text-2xl font-light text-tlw-cream mb-3">
        {denied ? "This account isn't authorized" : "We couldn't sign you in"}
      </h1>
      <p className="text-tlw-warm-gray text-sm max-w-md mb-10">
        {denied
          ? 'The Google account you chose is not set up as a coach on this platform. If you subscribed, sign in with the Google account for the exact email you used at checkout. If you were invited, ask your supervisor to check the address on your invitation, then sign in again.'
          : 'Something went wrong during sign-in. Please try again.'}
      </p>
      <Link
        href="/"
        className="px-8 py-3 bg-tlw-navy-rich border border-tlw-warm-gray/30 rounded-lg text-tlw-cream text-sm font-medium hover:bg-tlw-navy-rich/80 transition-colors"
      >
        Back to sign in
      </Link>
    </div>
  )
}
