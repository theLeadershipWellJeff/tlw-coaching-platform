'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * Portal account settings — currently just the optional username + password
 * (migration 054). Reaching this page requires a portal session, so the client
 * arrived via a magic link; possession of the email account is what authorizes
 * setting the password.
 */
export default function PortalSettings() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [hasPassword, setHasPassword] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/portal/auth/password')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setUsername(d.username || '')
          setHasPassword(!!d.hasPassword)
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (password !== confirm) {
      setMsg({ ok: false, text: 'Those passwords do not match.' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/portal/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setMsg({ ok: true, text: 'Saved. You can now sign in with your username and password.' })
        setHasPassword(true)
        setPassword('')
        setConfirm('')
      } else {
        setMsg({ ok: false, text: d.error || 'Could not save that.' })
      }
    } catch {
      setMsg({ ok: false, text: 'Something went wrong. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="flex items-center justify-between">
        <Link href="/portal" className="text-[13px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
          ← Back
        </Link>
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Settings</p>
        <span className="w-10" />
      </div>

      <div className="mt-8 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
        <h1 className="text-[16px] font-medium text-tlw-navy-deep">
          {hasPassword ? 'Your sign-in details' : 'Set a username and password'}
        </h1>
        <p className="mt-1 text-[13px] text-tlw-warm-gray">
          Optional — you can always sign in with an emailed link instead. Setting a password just
          makes it quicker to get back in.
        </p>

        <form onSubmit={save} className="mt-5 space-y-3">
          <div>
            <label className="text-[12px] font-medium text-tlw-espresso">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={!loaded}
              autoComplete="username"
              placeholder="yourname"
              className="mt-1 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
            />
            <p className="mt-1 text-[11px] text-tlw-warm-gray">
              3–40 characters: letters, numbers, dots, dashes or underscores.
            </p>
          </div>
          <div>
            <label className="text-[12px] font-medium text-tlw-espresso">
              {hasPassword ? 'New password' : 'Password'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!loaded}
              autoComplete="new-password"
              className="mt-1 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
            />
            <p className="mt-1 text-[11px] text-tlw-warm-gray">At least 10 characters.</p>
          </div>
          <div>
            <label className="text-[12px] font-medium text-tlw-espresso">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={!loaded}
              autoComplete="new-password"
              className="mt-1 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
            />
          </div>

          {msg && (
            <p
              className="text-[12px]"
              style={{ color: msg.ok ? 'var(--color-success)' : undefined }}
            >
              <span className={msg.ok ? '' : 'text-tlw-signal-orange'}>{msg.text}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !loaded || !username.trim() || !password}
            className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50"
          >
            {saving ? 'Saving…' : hasPassword ? 'Update password' : 'Save password'}
          </button>
        </form>
      </div>
    </div>
  )
}
