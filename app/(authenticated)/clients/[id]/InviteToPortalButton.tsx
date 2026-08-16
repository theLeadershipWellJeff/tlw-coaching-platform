'use client'
import { useEffect, useState } from 'react'

type PortalStatus = {
  username: string | null
  hasPassword: boolean
  lastSeenAt: string | null
  locked: boolean
}

function relDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Coach action: email this client a magic-link invite to their portal, plus
 * their sign-in state.
 *
 * The status line deliberately never offers to reveal a password — passwords are
 * one-way hashes. When a client is locked out the remedy is to resend the link,
 * which is exactly what this button does.
 */
export function InviteToPortalButton({ clientId }: { clientId: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [status, setStatus] = useState<PortalStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/clients/${clientId}/portal-invite`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d?.portal && setStatus(d.portal))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [clientId])

  async function invite() {
    setState('sending')
    setMsg('')
    try {
      const res = await fetch(`/api/clients/${clientId}/portal-invite`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg(data.error || 'Could not send.')
        setState('error')
        return
      }
      setMsg(`Invite sent to ${data.sentTo}`)
      setState('sent')
    } catch {
      setMsg('Could not send.')
      setState('error')
    }
  }

  const signedIn = !!status?.lastSeenAt

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={invite}
        disabled={state === 'sending'}
        title={
          status
            ? [
                status.username ? `Username: ${status.username}` : 'No username set',
                status.hasPassword ? 'Password set' : 'No password set (magic link only)',
                status.lastSeenAt ? `Last signed in ${relDate(status.lastSeenAt)}` : 'Never signed in',
                status.locked ? 'Temporarily locked after failed sign-ins — resend the link' : '',
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        className="rounded-tlw-lg border border-tlw-warm-gray/30 px-4 py-2 text-[13px] font-medium text-tlw-espresso transition-colors hover:border-tlw-warm-gray/50 disabled:opacity-50"
      >
        {state === 'sending'
          ? 'Sending…'
          : state === 'sent'
            ? 'Link sent ✓'
            : signedIn
              ? 'Resend portal link'
              : 'Invite to portal'}
      </button>
      {msg ? (
        <span
          className={`text-[12px] ${state === 'error' ? 'text-tlw-signal-orange' : 'text-tlw-warm-gray'}`}
        >
          {msg}
        </span>
      ) : (
        status && (
          <span className="text-[12px] text-tlw-warm-gray">
            {status.locked
              ? 'locked — resend to let them back in'
              : status.lastSeenAt
                ? `last in ${relDate(status.lastSeenAt)}${status.hasPassword ? ' · password set' : ''}`
                : 'not signed in yet'}
          </span>
        )
      )}
    </div>
  )
}
