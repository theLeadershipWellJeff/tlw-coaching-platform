'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/app/components/shared/Modal'
import type { AgreementTemplate, Client } from '@/lib/supabase/types'
import { renderAgreementHtml } from '@/lib/agreement-template'

type Step = 1 | 2 | 3

/**
 * Issue the master coaching agreement to a client. Multi-step: confirm details →
 * payment terms → review (scroll-to-bottom gate) → send. Stays on the client
 * profile; sends via POST /api/agreements/issue.
 */
export function IssueAgreementModal({
  client,
  onClose,
  onSent,
}: {
  client: Client
  onClose: () => void
  onSent: () => void
}) {
  const [template, setTemplate] = useState<AgreementTemplate | null>(null)
  const [step, setStep] = useState<Step>(1)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  // Step 1 — confirmable details.
  const [clientName, setClientName] = useState(client.name || '')
  const [clientEmail, setClientEmail] = useState(client.email || '')
  const [zoomLink, setZoomLink] = useState('')
  const [phone, setPhone] = useState(client.phone || '')
  // Step 2 — payment terms (default from template once loaded).
  const [paymentTerms, setPaymentTerms] = useState('')
  const [paymentTouched, setPaymentTouched] = useState(false)

  // Step 3 — scroll-to-bottom gate.
  const [scrolledToEnd, setScrolledToEnd] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/agreements/template')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load the agreement template.'))))
      .then((d) => {
        if (cancelled) return
        setTemplate(d.template)
        if (!paymentTouched) setPaymentTerms(d.template?.payment_terms || '')
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reviewHtml = useMemo(() => {
    if (!template) return ''
    return renderAgreementHtml(template, {
      client_name: clientName,
      coach_name: '',
      zoom_link: zoomLink,
      phone,
      payment_terms: paymentTerms,
    })
  }, [template, clientName, zoomLink, phone, paymentTerms])

  // Watch the bottom sentinel on the review step.
  useEffect(() => {
    if (step !== 3) return
    setScrolledToEnd(false)
    const el = endRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setScrolledToEnd(true)),
      { threshold: 1 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [step, reviewHtml])

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clientEmail.trim())

  async function send() {
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/agreements/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim(),
          zoomLink: zoomLink.trim() || undefined,
          phone: phone.trim() || undefined,
          paymentTerms: paymentTerms.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not send the agreement.')
      setSent(true)
      onSent()
      setTimeout(onClose, 1200)
    } catch (e: any) {
      setError(e.message)
      setSending(false)
    }
  }

  return (
    <Modal title="Issue coaching agreement" onClose={onClose} width="max-w-2xl">
      {sent ? (
        <p className="py-8 text-center text-[14px] font-medium" style={{ color: 'var(--color-success)' }}>
          Agreement sent to {clientEmail} ✓
        </p>
      ) : (
        <div className="space-y-4">
          <Steps step={step} />

          {step === 1 && (
            <div className="space-y-3">
              <Field label="Client name">
                <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Client email (where the agreement is sent)">
                <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className={inputCls} />
                {!emailValid && clientEmail.length > 0 && <p className="mt-1 text-[12px] text-tlw-signal-orange">Enter a valid email.</p>}
              </Field>
              <Field label="Coach Zoom link">
                <input value={zoomLink} onChange={(e) => setZoomLink(e.target.value)} placeholder="https://zoom.us/j/…" className={inputCls} />
              </Field>
              <Field label="Coach phone">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
              </Field>
            </div>
          )}

          {step === 2 && (
            <Field label="Payment Terms">
              <textarea
                value={paymentTerms}
                onChange={(e) => { setPaymentTerms(e.target.value); setPaymentTouched(true) }}
                rows={3}
                placeholder="e.g. '6 months bi-weekly at $250/session', 'pro bono basis', or leave blank to omit."
                className={inputCls + ' resize-y'}
              />
              <p className="mt-1 text-[12px] text-tlw-warm-gray">Pre-filled from the template default; override for this client. Leave blank to omit the payment section.</p>
            </Field>
          )}

          {step === 3 && (
            <div>
              <p className="mb-2 text-[12px] text-tlw-warm-gray">Review the agreement exactly as {clientName || 'the client'} will see it. Scroll to the bottom to enable Send.</p>
              <div className="max-h-[46vh] overflow-y-auto rounded-tlw-md border border-tlw-warm-gray/20 bg-white p-6">
                <div dangerouslySetInnerHTML={{ __html: reviewHtml }} />
                <div ref={endRef} style={{ height: 1 }} />
              </div>
            </div>
          )}

          {error && <p className="text-[12px] text-tlw-signal-orange">{error}</p>}

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              onClick={() => (step === 1 ? onClose() : setStep((s) => (s - 1) as Step))}
              className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => (s + 1) as Step)}
                disabled={step === 1 && (!clientName.trim() || !emailValid)}
                className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Next
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!scrolledToEnd || sending}
                title={scrolledToEnd ? '' : 'Scroll to the bottom of the agreement first'}
                className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {sending ? 'Sending…' : 'Send Agreement'}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

const inputCls =
  'w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-tlw-navy-deep">{label}</span>
      {children}
    </label>
  )
}

function Steps({ step }: { step: Step }) {
  const labels = ['Details', 'Payment', 'Review']
  return (
    <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[1px]">
      {labels.map((l, i) => (
        <span key={l} className={i + 1 === step ? 'text-tlw-navy-deep' : 'text-tlw-warm-gray/60'}>
          {i + 1}. {l}{i < 2 ? '  ·' : ''}
        </span>
      ))}
    </div>
  )
}
