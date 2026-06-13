'use client'
import { useState } from 'react'
import { Modal } from '@/app/components/shared/Modal'

export function EmailModal({
  to,
  clientName,
  onClose,
}: {
  to: string
  clientName: string
  onClose: () => void
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function send() {
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setSent(true)
      setTimeout(onClose, 900)
    } catch (e: any) {
      setError(e.message)
      setSending(false)
    }
  }

  return (
    <Modal title={`Email ${clientName}`} onClose={onClose}>
      {sent ? (
        <p className="py-6 text-center text-[14px] font-medium" style={{ color: 'var(--color-success)' }}>
          Sent ✓
        </p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-tlw-md bg-tlw-canvas px-3 py-2 text-[12px] text-tlw-warm-gray">
            To <span className="text-tlw-espresso">{to || '— no email on file —'}</span> · Cc you
          </div>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            rows={9}
            className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface p-3 text-[13px] leading-relaxed text-tlw-espresso outline-none focus:border-tlw-signal-orange"
          />
          {error && <p className="text-[12px] text-tlw-signal-orange">{error}</p>}
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
              Cancel
            </button>
            <button
              onClick={send}
              disabled={sending || !to || !subject.trim() || !body.trim()}
              className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {sending ? 'Sending…' : 'Send email'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
