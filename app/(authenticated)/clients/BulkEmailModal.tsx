'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/app/components/shared/Modal'

/** Escape text + turn line breaks into <br> so a plain-textarea body sends as HTML. */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(/\r\n|\r|\n/g, '<br />')
}

/** Resolve {{first_name}} against a client's stored name. */
function personalize(text: string, name: string): string {
  const first = (name || '').trim().split(/\s+/)[0] || 'there'
  return text.replace(/\{\{\s*first_name\s*\}\}/gi, first)
}

export type BulkRecipient = { id: string; name: string; email: string | null }

type SendResult = { id: string; name: string; error: string }

/**
 * Email all — mass-send one composed message to every client in the current
 * roster view, one personal email per client (each sees only their own address,
 * never a group To line). Reuses POST /api/email/send per recipient, so every
 * send appends the signature server-side and logs to `communications` exactly
 * like a one-off compose. Supports a {{first_name}} merge token.
 */
export function BulkEmailModal({
  recipients,
  listLabel,
  onClose,
}: {
  recipients: BulkRecipient[]
  listLabel: string
  onClose: () => void
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [stage, setStage] = useState<'compose' | 'review' | 'sending' | 'done'>('compose')
  const [signature, setSignature] = useState('')
  const [showRecipients, setShowRecipients] = useState(false)
  const [sentCount, setSentCount] = useState(0)
  const [progress, setProgress] = useState(0)
  const [failures, setFailures] = useState<SendResult[]>([])
  const cancelled = useRef(false)

  const withEmail = useMemo(() => recipients.filter((r) => !!r.email), [recipients])
  const withoutEmail = useMemo(() => recipients.filter((r) => !r.email), [recipients])

  useEffect(() => {
    let gone = false
    fetch('/api/email/signature')
      .then((r) => (r.ok ? r.json() : { html: '' }))
      .then((d) => !gone && setSignature(d.html || ''))
      .catch(() => {})
    return () => {
      gone = true
    }
  }, [])

  useEffect(() => () => {
    // Leaving the modal mid-send stops queuing further recipients.
    cancelled.current = true
  }, [])

  const canReview = withEmail.length > 0 && !!subject.trim() && !!body.trim()

  async function sendTo(list: BulkRecipient[]) {
    cancelled.current = false
    setStage('sending')
    setProgress(0)
    setFailures([])
    let ok = sentCount
    const failed: SendResult[] = []
    let done = 0

    // Small concurrency: fast enough for a large list, gentle on Gmail.
    const queue = [...list]
    async function worker() {
      while (queue.length > 0 && !cancelled.current) {
        const r = queue.shift()!
        try {
          const res = await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientId: r.id,
              to: r.email,
              cc: '', // no Cc on a mass send — every email is already in the coach's Sent folder
              subject: personalize(subject, r.name),
              bodyHtml: textToHtml(personalize(body, r.name)),
            }),
          })
          if (!res.ok) {
            const d = await res.json().catch(() => ({}))
            throw new Error(d.error || `Send failed (${res.status})`)
          }
          ok++
          setSentCount(ok)
        } catch (e: any) {
          failed.push({ id: r.id, name: r.name, error: e?.message || 'Send failed' })
        }
        done++
        setProgress(done)
      }
    }
    await Promise.all([0, 1, 2].map(() => worker()))
    setFailures(failed)
    setStage('done')
  }

  const inputCls =
    'w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-navy-rich'
  const sampleName = withEmail[0]?.name || 'the client'

  return (
    <Modal title={`Email all · ${listLabel} clients`} onClose={onClose} width="max-w-xl">
      {stage === 'compose' && (
        <div className="space-y-3">
          <div className="rounded-tlw-md bg-tlw-canvas px-3 py-2 text-[12px] text-tlw-warm-gray">
            <button
              type="button"
              onClick={() => setShowRecipients((v) => !v)}
              className="font-medium text-tlw-espresso hover:underline"
            >
              To: {withEmail.length} client{withEmail.length === 1 ? '' : 's'} {showRecipients ? '▾' : '▸'}
            </button>
            {withoutEmail.length > 0 && (
              <span className="ml-2">
                ({withoutEmail.length} skipped — no email on file)
              </span>
            )}
            {showRecipients && (
              <div className="mt-2 max-h-36 overflow-y-auto">
                {withEmail.map((r) => (
                  <div key={r.id} className="truncate">
                    {r.name} <span className="opacity-70">&lt;{r.email}&gt;</span>
                  </div>
                ))}
                {withoutEmail.map((r) => (
                  <div key={r.id} className="truncate line-through opacity-50">
                    {r.name} — no email
                  </div>
                ))}
              </div>
            )}
          </div>

          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className={inputCls}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            rows={9}
            className={`${inputCls} p-3 leading-relaxed`}
          />
          <p className="text-[11px] text-tlw-warm-gray">
            Each client gets their own individual email — no group To line. Use{' '}
            <code className="rounded bg-tlw-canvas px-1">{'{{first_name}}'}</code> to personalize
            (e.g. &ldquo;Hi {'{{first_name}}'},&rdquo;).
          </p>

          <div>
            <p className="mb-1 text-[11px] uppercase tracking-[1.5px] text-tlw-warm-gray">Signature (auto-appended)</p>
            <div
              className="pointer-events-none select-none rounded-tlw-md border border-dashed border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 opacity-90"
              dangerouslySetInnerHTML={{ __html: signature || '<span style="font-size:12px;color:#8B8680;">Loading signature…</span>' }}
            />
          </div>

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
      )}

      {stage === 'review' && (
        <div className="space-y-3">
          <div className="rounded-tlw-md bg-tlw-canvas px-3 py-2 text-[12px] text-tlw-warm-gray">
            <div>
              To <span className="text-tlw-espresso">{withEmail.length} clients, one email each</span>
            </div>
            <div className="mt-1">
              Subject <span className="text-tlw-espresso">{personalize(subject, sampleName)}</span>
            </div>
          </div>
          <p className="text-[11px] uppercase tracking-[1.5px] text-tlw-warm-gray">
            Preview (as {sampleName} will see it) — message + signature
          </p>
          <div className="max-h-72 overflow-y-auto rounded-tlw-md border border-tlw-warm-gray/20 bg-white p-4">
            <div
              className="text-[13px] leading-relaxed text-tlw-espresso"
              dangerouslySetInnerHTML={{ __html: textToHtml(personalize(body, sampleName)) }}
            />
            <div dangerouslySetInnerHTML={{ __html: signature }} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => setStage('compose')} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
              ← Edit
            </button>
            <button
              onClick={() => sendTo(withEmail)}
              className="rounded-tlw-lg bg-tlw-navy-rich px-5 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90"
            >
              Send to {withEmail.length} client{withEmail.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {stage === 'sending' && (
        <div className="space-y-3 py-2">
          <p className="text-[13px] text-tlw-espresso">
            Sending… {progress} of {withEmail.length}
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-tlw-canvas">
            <div
              className="h-full rounded-full bg-tlw-navy-rich transition-all"
              style={{ width: `${Math.round((progress / Math.max(withEmail.length, 1)) * 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-tlw-warm-gray">
            Keep this window open until it finishes. Every send is logged to each client&apos;s
            Recent Communication card.
          </p>
        </div>
      )}

      {stage === 'done' && (
        <div className="space-y-3 py-2">
          <p className="text-[14px] font-medium" style={{ color: failures.length ? undefined : 'var(--color-success)' }}>
            Sent to {sentCount} client{sentCount === 1 ? '' : 's'} ✓
          </p>
          {failures.length > 0 && (
            <div className="rounded-tlw-md border border-tlw-signal-orange/40 bg-tlw-canvas px-3 py-2">
              <p className="mb-1 text-[12px] font-medium text-tlw-signal-orange">
                {failures.length} failed:
              </p>
              <div className="max-h-32 overflow-y-auto text-[12px] text-tlw-espresso">
                {failures.map((f) => (
                  <div key={f.id} className="truncate">
                    {f.name} — <span className="text-tlw-warm-gray">{f.error}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => sendTo(withEmail.filter((r) => failures.some((f) => f.id === r.id)))}
                className="mt-2 text-[12px] font-medium text-tlw-signal-orange hover:underline"
              >
                Retry failed
              </button>
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
