'use client'
import { useState } from 'react'
import { InfoPopover } from './InfoPopover'

/**
 * Shown in place of "Contact your coach" when nobody is coaching the client
 * (a standalone or enterprise participant). Offers a theLeadershipWell coach:
 * book a conversation on the house coach's scheduler, or write a note that
 * becomes a support ticket — never an email to a coach who does not exist.
 */
export function ContactSupportCard({ bookingUrl = null }: { bookingUrl?: string | null }) {
  const [message, setMessage] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  function bookClicked() {
    fetch('/api/portal/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'talk_to_coach_clicked', metadata: { from: 'contact_card' } }),
    }).catch(() => {})
  }

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
        <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">Talk to a theLeadershipWell coach</h2>
        <InfoPopover
          label="Talk to a theLeadershipWell coach"
          text="Want to work through your report or what comes next with a person? Book a conversation with one of our coaches, or write to us here and someone will reply by email."
        />
      </div>
      {bookingUrl && (
        <a
          href={bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={bookClicked}
          className="mt-3 inline-block rounded-tlw-lg bg-tlw-navy-deep px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich"
        >
          Book a conversation
        </a>
      )}
      {state === 'sent' ? (
        <div className="mt-3">
          <p className="text-[14px] text-tlw-espresso">Thanks — we have your message and will reply by email.</p>
          <button onClick={() => setState('idle')} className="mt-3 text-[13px] font-medium text-tlw-signal-orange hover:underline">
            Send another
          </button>
        </div>
      ) : (
        <form onSubmit={send} className="mt-3">
          <p className="mb-1.5 text-[12px] text-tlw-warm-gray">{bookingUrl ? 'Or send us a note:' : 'Send us a note:'}</p>
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
