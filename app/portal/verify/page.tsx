'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

function Verifier() {
  const params = useSearchParams()
  const router = useRouter()
  const [state, setState] = useState<'verifying' | 'error'>('verifying')

  useEffect(() => {
    const token = params.get('token')
    if (!token) {
      setState('error')
      return
    }
    // POST (not the GET link) does the consuming, so email link-scanners that
    // prefetch the link can't silently burn the single-use token.
    fetch('/api/portal/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => {
        if (r.ok) router.replace('/portal')
        else setState('error')
      })
      .catch(() => setState('error'))
  }, [params, router])

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-8 text-center shadow-sm">
        {state === 'verifying' ? (
          <p className="text-[14px] text-tlw-warm-gray">Signing you in…</p>
        ) : (
          <>
            <p className="text-[15px] font-medium text-tlw-navy-deep">This link didn&apos;t work</p>
            <p className="mt-2 text-[14px] text-tlw-warm-gray">
              It may have expired or already been used.
            </p>
            <Link
              href="/portal/login"
              className="mt-4 inline-block text-[13px] font-medium text-tlw-signal-orange hover:underline"
            >
              Request a new link
            </Link>
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
