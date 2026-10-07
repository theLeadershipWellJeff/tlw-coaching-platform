'use client'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

// The emailed link only opens this page; the single-use token is spent when
// the person clicks "Sign in". Corporate mail scanners open links in a
// sandboxed browser that runs scripts — an automatic POST on load let them
// burn the token before the person ever clicked. They open, they don't click.
function Verifier() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token')
  const [state, setState] = useState<'ready' | 'verifying' | 'error'>(token ? 'ready' : 'error')

  async function signIn() {
    if (!token) return
    setState('verifying')
    try {
      const r = await fetch('/api/portal/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (r.ok) router.replace('/portal')
      else setState('error')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-8 text-center shadow-sm">
        {state === 'error' ? (
          <>
            <p className="text-[15px] font-medium text-tlw-navy-deep">This link didn&apos;t work</p>
            <p className="mt-2 text-[14px] text-tlw-warm-gray">
              Each link works once and expires after a while. Ask for a fresh one with your email address — it arrives in a minute or two.
            </p>
            <Link
              href="/portal/login"
              className="mt-4 inline-block text-[13px] font-medium text-tlw-signal-orange hover:underline"
            >
              Send me a new link
            </Link>
          </>
        ) : (
          <>
            <p className="text-[15px] font-medium text-tlw-navy-deep">Welcome to your portal</p>
            <p className="mt-2 text-[14px] text-tlw-warm-gray">Click below to sign in.</p>
            <button
              type="button"
              onClick={signIn}
              disabled={state === 'verifying'}
              className="mt-5 w-full rounded-tlw-lg bg-tlw-navy-deep px-4 py-3 text-[15px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50"
            >
              {state === 'verifying' ? 'Signing you in…' : 'Sign in'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function PortalVerify() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <Verifier />
    </Suspense>
  )
}
