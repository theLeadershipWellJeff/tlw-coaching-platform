'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Mode = 'link' | 'password'

export default function PortalLogin() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('link')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function requestLink(e: React.FormEvent) {
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

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/portal/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        router.push('/portal')
        router.refresh()
        return
      }
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'That username and password did not match.')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
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
          <>
            <div className="mt-4 flex gap-1 rounded-tlw-lg bg-tlw-canvas p-1">
              {(
                [
                  ['link', 'Email link'],
                  ['password', 'Password'],
                ] as [Mode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m)
                    setError('')
                  }}
                  className={`flex-1 rounded-tlw-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    mode === m ? 'bg-tlw-surface text-tlw-navy-deep shadow-sm' : 'text-tlw-warm-gray'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === 'link' ? (
              <form onSubmit={requestLink} className="mt-4">
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
            ) : (
              <form onSubmit={signIn} className="mt-4">
                <p className="text-[14px] text-tlw-warm-gray">
                  Sign in with the username and password you set.
                </p>
                <input
                  autoFocus
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  className="mt-4 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="mt-2 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                />
                {error && <p className="mt-2 text-[12px] text-tlw-signal-orange">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-4 w-full rounded-tlw-lg bg-tlw-navy-deep px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50"
                >
                  {submitting ? 'Signing in…' : 'Sign in'}
                </button>
                <p className="mt-3 text-[12px] text-tlw-warm-gray">
                  Haven&apos;t set a password, or forgotten it?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('link')
                      setError('')
                    }}
                    className="font-medium text-tlw-signal-orange hover:underline"
                  >
                    Sign in with an email link
                  </button>{' '}
                  and set one from your portal.
                </p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
