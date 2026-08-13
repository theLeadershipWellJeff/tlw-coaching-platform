'use client'
import { useState } from 'react'

/** Coach action: email this client a magic-link invite to their portal. */
export function InviteToPortalButton({ clientId }: { clientId: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [msg, setMsg] = useState('')

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

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={invite}
        disabled={state === 'sending'}
        className="rounded-tlw-lg border border-tlw-warm-gray/30 px-4 py-2 text-[13px] font-medium text-tlw-espresso transition-colors hover:border-tlw-warm-gray/50 disabled:opacity-50"
      >
        {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Invite sent ✓' : 'Invite to portal'}
      </button>
      {msg && (
        <span
          className={`text-[12px] ${state === 'error' ? 'text-tlw-signal-orange' : 'text-tlw-warm-gray'}`}
        >
          {msg}
        </span>
      )}
    </div>
  )
}
