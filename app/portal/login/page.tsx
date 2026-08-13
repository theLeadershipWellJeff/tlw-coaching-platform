'use client'
import { useState } from 'react'

export default function PortalLogin() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await fetch('/api/portal/auth/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } catch {
      // ignore — the response is generic either way
    }
    setSubmitting(false)
    setSent(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-8 shadow-sm">
        <h1 className="text-[20px] font-medium text-tlw-navy-deep">Your coaching portal</h1>
        {sent ? (
          <div className="mt-4">
            <p className="text-[14px] text-tlw-espresso">
              If that email is on file, a sign-in link is on its way. It works once and
              expires in 24 hours.
            </p>
            <button
              onClick={() => {
                setSent(false)
                setEmail('')
              }}
              className="mt-4 text-[13px] font-medium text-tlw-signal-orange hover:underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4">
            <p className="text-[14px] text-tlw-warm-gray">
              Enter your email and we&apos;ll send you a secure sign-in link.
            </p>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-4 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
            />
            <button
              type="submit"
              disabled={submitting}
              className="mt-4 w-full rounded-tlw-lg bg-tlw-navy-deep px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
