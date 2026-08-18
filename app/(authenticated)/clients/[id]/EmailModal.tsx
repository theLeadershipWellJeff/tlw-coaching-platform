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
  // Default the Cc to the signed-in coach's own address (a copy in their inbox);
  // loaded from /api/coach so it's never another coach's mailbox. `ccTouched`
  // separates "the coach deliberately cleared the Cc" (suppress it) from "the
  // prefill hasn't resolved / failed" (let the server default to the coach).
  const [cc, setCc] = useState('')
  const [ccTouched, setCcTouched] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [stage, setStage] = useState<'compose' | 'review'>('compose')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [signature, setSignature] = useState('')
  // Recent captures shown as a composing aid at the bottom of the modal —
  // reference only, never part of the email itself.
  const [captures, setCaptures] = useState<{
    actions: { id: string; description: string; status: string }[]
    insights: string[]
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/email/signature')
      .then((r) => (r.ok ? r.json() : { html: '' }))
      .then((d) => !cancelled && setSignature(d.html || ''))
      .catch(() => {})
    fetch(`/api/clients/${clientId}/captures`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        setCaptures({ actions: d.actions || [], insights: d.insights || [] })
      })
      .catch(() => {})
    fetch('/api/coach')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.coach?.email) return
        // Only prefill if the coach hasn't already typed something.
        setCc((prev) => (prev === '' ? d.coach.email : prev))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [clientId])

  const canReview = !!to && !!subject.trim() && !!body.trim()

  async function send() {
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // An untouched, unresolved-empty Cc is omitted so the server applies its
        // own coach default; '' is only sent when the coach cleared it on purpose.
        body: JSON.stringify({
          clientId,
          to,
          ...(cc === '' && !ccTouched ? {} : { cc }),
          subject,
          bodyHtml: textToHtml(body),
        }),
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
              onChange={(e) => {
                setCcTouched(true)
                setCc(e.target.value)
              }}
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

          {/* Recent actions + insights, newest first — a memory aid while
              composing. Reference only; nothing here goes into the email. */}
          {captures && (captures.actions.length > 0 || captures.insights.length > 0) && (
            <div className="rounded-tlw-md border border-tlw-warm-gray/20 bg-tlw-canvas/60 px-3 py-2.5">
              <p className="mb-2 text-[11px] uppercase tracking-[1.5px] text-tlw-warm-gray">
                For your reference — not included in the email
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {captures.actions.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-tlw-warm-gray">Actions</p>
                    <ul className="max-h-32 space-y-1 overflow-y-auto">
                      {captures.actions.map((a) => (
                        <li key={a.id} className="flex items-start gap-1.5 text-[12px] leading-snug">
                          <span
                            className={`mt-px shrink-0 ${a.status === 'done' ? 'text-tlw-navy-rich' : 'text-tlw-warm-gray'}`}
                          >
                            {a.status === 'done' ? '☑' : '☐'}
                          </span>
                          <span
                            className={
                              a.status === 'done'
                                ? 'text-tlw-warm-gray line-through'
                                : 'text-tlw-espresso'
                            }
                          >
                            {a.description}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {captures.insights.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-tlw-warm-gray">Insights</p>
                    <ul className="max-h-32 space-y-1 overflow-y-auto">
                      {captures.insights.map((text, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[12px] leading-snug">
                          <span className="mt-px shrink-0 text-tlw-signal-orange">✦</span>
                          <span className="text-tlw-espresso">{text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

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
