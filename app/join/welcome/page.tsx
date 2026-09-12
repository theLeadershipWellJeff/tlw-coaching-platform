import Link from 'next/link'
import { TLWLogo } from '@/app/components/TLWLogo'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { retrieveCheckoutSession } from '@/lib/billing/stripe'
import { provisionCoachFromCheckout } from '@/lib/coach-signup'
import { coachSignInLink } from '@/lib/admin/coach-invite'

export const dynamic = 'force-dynamic'

/**
 * Stripe's success URL for the self-serve signup. Provisions the coach row
 * right here (idempotent with the webhook — whichever runs first wins, the
 * other is a no-op) so the "Sign in" button below works immediately, then
 * tells the coach which Google account to use. The session id in the URL is
 * a Stripe-issued, unguessable id; it is only ever read back from Stripe,
 * never trusted for anything else.
 */
export default async function JoinWelcomePage({ searchParams }: { searchParams?: { session_id?: string } }) {
  const sessionId = searchParams?.session_id
  let email: string | null = null
  let problem: string | null = null
  let inviteWarning: string | null = null

  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    problem = 'This link is missing its checkout reference.'
  } else {
    try {
      const session = await retrieveCheckoutSession(sessionId)
      if (!session.metadata?.tlw_signup_email) {
        problem = 'This checkout was not a platform signup.'
      } else {
        const r = await provisionCoachFromCheckout(getSupabaseAdmin(), session)
        if (r.ok) {
          email = r.coach.email
          if (!r.invited && r.inviteError) inviteWarning = r.inviteError
        } else {
          problem = r.error
        }
      }
    } catch (e) {
      console.error('[join/welcome] failed:', e)
      problem = 'We could not confirm your checkout just now.'
    }
  }

  return (
    <div className="min-h-screen bg-tlw-navy-deep text-tlw-cream">
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center">
        <TLWLogo size={56} light />
        <p className="mt-4 text-xs uppercase tracking-[5px] text-tlw-warm-gray">theLeadershipWell</p>
        {email ? (
          <>
            <h1 className="mt-8 font-serif text-3xl font-light">Welcome aboard</h1>
            <p className="mt-3 text-sm text-tlw-cream/85">
              Your account is ready. Sign in with Google using <strong className="text-tlw-cream">{email}</strong> — that exact address is the one your account is registered to.
            </p>
            <a href={coachSignInLink()} className="mt-8 rounded-tlw-lg bg-tlw-cream px-6 py-2.5 text-[13px] font-medium text-tlw-navy-deep">
              Sign in with Google
            </a>
            <p className="mt-4 text-[12px] text-tlw-warm-gray">
              We have also emailed this link to {email}. On first sign-in Google will ask you to allow Gmail and Calendar access — that is how the platform sends and books on your behalf.
            </p>
            {inviteWarning && (
              <p className="mt-3 text-[12px] text-amber-300">The welcome email could not be sent ({inviteWarning}) — the button above still works.</p>
            )}
          </>
        ) : (
          <>
            <h1 className="mt-8 font-serif text-3xl font-light">Almost there</h1>
            <p className="mt-3 text-sm text-tlw-warm-gray">{problem}</p>
            <p className="mt-4 text-[12px] text-tlw-warm-gray">
              If you completed payment, your account will still be created within a few minutes and the sign-in link emailed to you. Otherwise,{' '}
              <Link href="/join" className="underline hover:text-tlw-cream">start again</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
