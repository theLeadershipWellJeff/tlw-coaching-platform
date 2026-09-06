'use client'
import { useState } from 'react'
import { InfoPopover } from './InfoPopover'

/** Shown in place of "Contact your coach" when the client has no coach. Writes
 *  a support ticket instead of an email to a person who doesn't exist. */
export function ContactSupportCard() {
  const [message, setMessage] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setState('sending')
    try {
      const res = await fetch('/api/portal/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!res.ok) throw new Error()
      setState('sent')
      setMessage('')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">Contact support</h2>
        <InfoPopover
          label="Contact support"
          text="A question about your report, your access, or the portal itself? Write to us here and a person will reply by email."
        />
      </div>
      {state === 'sent' ? (
        <div className="mt-3">
          <p className="text-[14px] text-tlw-espresso">Thanks — we have your message and will reply by email.</p>
          <button onClick={() => setState('idle')} className="mt-3 text-[13px] font-medium text-tlw-signal-orange hover:underline">
            Send another
          </button>
        </div>
      ) : (
        <form onSubmit={send} className="mt-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="How can we help?"
            className="w-full resize-none rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
          />
          {state === 'error' && <p className="mt-2 text-[12px] text-tlw-signal-orange">Couldn&apos;t send just now — please try again.</p>}
          <button
            type="submit"
            disabled={state === 'sending' || !message.trim()}
            className="mt-3 rounded-tlw-lg bg-tlw-navy-deep px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50"
          >
            {state === 'sending' ? 'Sending…' : 'Send message'}
          </button>
        </form>
      )}
    </div>
  )
}
