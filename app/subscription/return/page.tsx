import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoachAny } from '@/lib/coach'
import { coachAccess } from '@/lib/access'
import { TLWLogo } from '@/app/components/TLWLogo'

export const dynamic = 'force-dynamic'

/**
 * Where Stripe Checkout sends the coach back. On success the webhook may
 * land a beat after the redirect, so this page never assumes: if the plan
 * already reads as open it goes straight to the dashboard; otherwise it
 * shows a "finishing up" note with a refresh link (a reload re-checks).
 */
export default async function SubscriptionReturnPage({ searchParams }: { searchParams?: { state?: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/')
  const coach = await getSessionCoachAny(getSupabaseAdmin())
  if (!coach) redirect('/auth/error?error=AccessDenied')
  const locked = coachAccess(coach).locked
  const state = searchParams?.state

  if (!locked) redirect(state === 'success' ? '/dashboard?subscription=success' : '/account')

  return (
    <div className="min-h-screen bg-tlw-navy-deep text-tlw-cream">
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center">
        <TLWLogo size={56} light />
        {state === 'success' ? (
          <>
            <h1 className="mt-8 font-serif text-3xl font-light">Thank you — finishing up</h1>
            <p className="mt-3 text-sm text-tlw-warm-gray">
              Stripe is confirming your subscription. This usually takes a few seconds.
            </p>
            <a href="/subscription/return?state=success" className="mt-8 rounded-tlw-lg bg-tlw-cream px-6 py-2.5 text-[13px] font-medium text-tlw-navy-deep">
              Continue to the platform
            </a>
            <p className="mt-4 text-[12px] text-tlw-warm-gray">
              Still seeing this after a minute? <Link href="/subscription" className="underline">Go back</Link> — your payment is safe and we will sort it out.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-8 font-serif text-3xl font-light">Checkout cancelled</h1>
            <p className="mt-3 text-sm text-tlw-warm-gray">No charge was made.</p>
            <Link href="/subscription" className="mt-8 rounded-tlw-lg bg-tlw-cream px-6 py-2.5 text-[13px] font-medium text-tlw-navy-deep">
              Back to plans
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
