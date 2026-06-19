'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/app/components/shared/Modal'

/** Escape text + turn line breaks into <br> so a plain-textarea body sends as HTML. */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(/\r\n|\r|\n/g, '<br />')
}

/**
 * Compose Email (Phase 1): raw compose → review → send. The branded signature is
 * shown here locked/non-editable and is appended server-side at send time. On a
 * successful send the workspace Recent Communication card refreshes via onSent.
 */
export function EmailModal({
  clientId,
  to: initialTo,
  clientName,
  onClose,
  onSent,
}: {
  clientId: string
  to: string
  clientName: string
  onClose: () => void
  onSent?: () => void
}) {
  const [to, setTo] = useState(initialTo)
  const [cc, setCc] = useState('jeff@theleadershipwell.com')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [stage, setStage] = useState<'compose' | 'review'>('compose')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [signature, setSignature] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/email/signature')
      .then((r) => (r.ok ? r.json() : { html: '' }))
      .then((d) => !cancelled && setSignature(d.html || ''))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const canReview = !!to && !!subject.trim() && !!body.trim()

  async function send() {
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, to, cc, subject, bodyHtml: textToHtml(body) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setSent(true)
      onSent?.()
      setTimeout(onClose, 900)
    } catch (e: any) {
      setError(e.message)
      setSending(false)
      setStage('compose')
    }
  }

  return (
    <Modal title={`Compose email · ${clientName}`} onClose={onClose}>
      {sent ? (
        <p className="py-6 text-center text-[14px] font-medium" style={{ color: 'var(--color-success)' }}>
          Sent ✓
        </p>
      ) : stage === 'compose' ? (
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-[12px] text-tlw-warm-gray">To</span>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="client@email.com"
              className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-navy-rich"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-[12px] text-tlw-warm-gray">Cc</span>
            <input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@email.com (optional)"
              className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-navy-rich"
            />
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-navy-rich"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            rows={9}
            className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface p-3 text-[13px] leading-relaxed text-tlw-espresso outline-none focus:border-tlw-navy-rich"
          />

          {/* Locked signature preview — exactly what will append, not editable. */}
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-[1.5px] text-tlw-warm-gray">Signature (auto-appended)</p>
            <div
              className="pointer-events-none select-none rounded-tlw-md border border-dashed border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 opacity-90"
              dangerouslySetInnerHTML={{ __html: signature || '<span style="font-size:12px;color:#8B8680;">Loading signature…</span>' }}
            />
          </div>

          {error && <p className="text-[12px] text-tlw-signal-orange">{error}</p>}
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
              Cancel
            </button>
            <button
              onClick={() => setStage('review')}
              disabled={!canReview}
              className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Review →
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-tlw-md bg-tlw-canvas px-3 py-2 text-[12px] text-tlw-warm-gray">
            <div>To <span className="text-tlw-espresso">{to}</span></div>
            {cc.trim() && <div>Cc <span className="text-tlw-espresso">{cc}</span></div>}
            <div className="mt-1">Subject <span className="text-tlw-espresso">{subject}</span></div>
          </div>
          <p className="text-[11px] uppercase tracking-[1.5px] text-tlw-warm-gray">
            Exactly what will send — message + signature
          </p>
          <div className="max-h-80 overflow-y-auto rounded-tlw-md border border-tlw-warm-gray/20 bg-white p-4">
            <div
              className="text-[13px] leading-relaxed text-tlw-espresso"
              dangerouslySetInnerHTML={{ __html: textToHtml(body) }}
            />
            <div dangerouslySetInnerHTML={{ __html: signature }} />
          </div>
          {error && <p className="text-[12px] text-tlw-signal-orange">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setStage('compose')}
              disabled={sending}
              className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso disabled:opacity-40"
            >
              ← Edit
            </button>
            <button
              onClick={send}
              disabled={sending}
              className="rounded-tlw-lg bg-tlw-navy-rich px-5 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {sending ? 'Sending…' : 'Send email'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
