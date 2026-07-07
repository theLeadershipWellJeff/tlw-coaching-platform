'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/app/components/layout/PageHeader'

// ── Helpers ──────────────────────────────────────────────────────────────────

function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

/** Default period = previous calendar month. */
function defaultPeriod(): { start: string; end: string } {
  const now = new Date()
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const m = now.getMonth() === 0 ? 12 : now.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(y, m, 0).getDate()
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${lastDay}` }
}

function currentMonthPeriod(): { start: string; end: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(y, m, 0).getDate()
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${lastDay}` }
}

function formatPeriod(start: string, end: string) {
  const s = new Date(start + 'T12:00:00Z')
  const e = new Date(end + 'T12:00:00Z')
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceLine = {
  id: string
  coachee_id: string | null
  description: string
  quantity: number
  unit_amount: number
  amount: number
  source: string
  coachees?: { id: string; clients: { id: string; name: string } | null } | null
}

type DraftInvoice = {
  id: string
  billing_account_id: string
  status: string
  subtotal: number
  total: number
  client_message: string | null
  stripe_invoice_id: string | null
  stripe_payment_intent_id: string | null
  stripe_error: string | null
  approved_by: string | null
  approved_at: string | null
  sent_at: string | null
  paid_at: string | null
  period_start: string | null
  period_end: string | null
  billing_accounts: { id: string; name: string; type: string; billing_email: string }
  invoice_lines: InvoiceLine[]
}

type BillingSettings = {
  preview_before_approve: boolean
  auto_send_on_approve: boolean
  cc_self_on_send: boolean
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LineRow({
  line,
  invoiceId,
  onUpdated,
  onDeleted,
  editable,
}: {
  line: InvoiceLine
  invoiceId: string
  onUpdated: (line: InvoiceLine) => void
  onDeleted: (lineId: string) => void
  editable: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [desc, setDesc] = useState(line.description)
  const [amount, setAmount] = useState(String(line.amount))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/billing/invoices/${invoiceId}/lines/${line.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: desc, quantity: 1, unit_amount: parseFloat(amount) }),
    })
    if (res.ok) {
      const d = await res.json()
      onUpdated(d.line)
      setEditing(false)
    }
    setSaving(false)
  }

  async function remove() {
    if (!confirm('Remove this line?')) return
    await fetch(`/api/billing/invoices/${invoiceId}/lines/${line.id}`, { method: 'DELETE' })
    onDeleted(line.id)
  }

  if (editing) {
    return (
      <div className="flex items-start gap-2 px-4 py-2.5">
        <input
          className="min-w-0 flex-1 rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-2.5 py-1.5 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <input
          className="w-24 rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-2.5 py-1.5 text-right text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          min="0"
          step="0.01"
        />
        <button onClick={save} disabled={saving} className="shrink-0 text-[12px] font-medium text-tlw-navy-deep hover:underline disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => setEditing(false)} className="shrink-0 text-[12px] text-tlw-warm-gray hover:text-tlw-espresso">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="group flex items-start justify-between gap-3 px-4 py-2.5">
      <p className="min-w-0 flex-1 text-[13px] text-tlw-espresso">{line.description}</p>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[13px] font-medium text-tlw-navy-deep">{money(line.amount)}</span>
        {editable && (
          <>
            <button onClick={() => setEditing(true)} className="hidden text-[11px] text-tlw-warm-gray hover:text-tlw-espresso group-hover:inline">
              Edit
            </button>
            <button onClick={remove} className="hidden text-[11px] text-red-500 hover:text-red-700 group-hover:inline">
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Invoice preview modal ──────────────────────────────────────────────────────

function InvoicePreviewModal({
  invoice,
  autoSend,
  onApprove,
  onApproveAndSend,
  onClose,
}: {
  invoice: DraftInvoice
  autoSend: boolean
  onApprove: () => void
  onApproveAndSend: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-tlw-2xl bg-white shadow-xl">
        <div className="border-b border-tlw-warm-gray/15 px-6 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-tlw-warm-gray">Invoice preview — what your client will receive</p>
          <h2 className="mt-0.5 text-[16px] font-semibold text-tlw-navy-deep">{invoice.billing_accounts.name}</h2>
          <p className="text-[13px] text-tlw-warm-gray">{invoice.billing_accounts.billing_email}</p>
          {invoice.period_start && invoice.period_end && (
            <p className="mt-1 text-[12px] text-tlw-warm-gray">Period: {invoice.period_start} → {invoice.period_end}</p>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          {invoice.client_message && (
            <div className="mb-4 rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-canvas px-4 py-3">
              <p className="text-[13px] text-tlw-espresso italic">&ldquo;{invoice.client_message}&rdquo;</p>
            </div>
          )}

          <div className="divide-y divide-tlw-warm-gray/10 rounded-tlw-lg border border-tlw-warm-gray/15">
            {invoice.invoice_lines.map((line) => (
              <div key={line.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <p className="text-[13px] text-tlw-espresso">{line.description}</p>
                <span className="shrink-0 text-[13px] font-semibold text-tlw-navy-deep">{money(line.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[14px] font-bold text-tlw-navy-deep">Total due</span>
              <span className="text-[16px] font-bold text-tlw-navy-deep">{money(invoice.total)}</span>
            </div>
          </div>

          <p className="mt-4 text-[11px] text-tlw-warm-gray">
            Stripe will email this invoice to the client. They can pay by card, bank transfer, or any method you&apos;ve enabled in Stripe. They can save their card and enable auto-pay for future invoices on the Stripe payment page.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-tlw-warm-gray/10 px-6 py-4">
          <button onClick={onClose} className="px-3 py-1.5 text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
            Cancel
          </button>
          {autoSend ? (
            <button
              onClick={onApproveAndSend}
              className="rounded-tlw-lg bg-tlw-signal-orange px-4 py-1.5 text-[13px] font-medium text-white hover:opacity-90"
            >
              Approve &amp; Send
            </button>
          ) : (
            <button
              onClick={onApprove}
              className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-1.5 text-[13px] font-medium text-white hover:bg-tlw-navy-rich"
            >
              Approve
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const STATUS_CHIP: Record<string, string> = {
  draft: 'bg-tlw-canvas text-tlw-warm-gray',
  approved: 'bg-green-50 text-green-700',
  sent: 'bg-blue-50 text-blue-700',
  paid: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-600',
  overdue: 'bg-amber-50 text-amber-700',
  void: 'bg-tlw-canvas text-tlw-warm-gray line-through',
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium capitalize ${STATUS_CHIP[status] ?? 'bg-tlw-canvas text-tlw-warm-gray'}`}>
      {status === 'approved' ? '✓ Approved' : status}
    </span>
  )
}

// ── Inline add-line form (enterprise) ─────────────────────────────────────────

function AddLineForm({
  invoiceId,
  defaultCoacheeId,
  defaultCoacheeName,
  accountId,
  onAdded,
  onCancel,
}: {
  invoiceId: string
  defaultCoacheeId: string | null
  defaultCoacheeName: string | null
  accountId: string
  onAdded: (line: InvoiceLine) => void
  onCancel: () => void
}) {
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [coacheeId, setCoacheeId] = useState<string>(defaultCoacheeId ?? '')
  const [coachees, setCoachees] = useState<{ id: string; name: string }[]>(
    defaultCoacheeId && defaultCoacheeName ? [{ id: defaultCoacheeId, name: defaultCoacheeName }] : [],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Load all coachees for this account if we don't have a fixed one.
  useEffect(() => {
    if (defaultCoacheeId) return
    fetch(`/api/billing/accounts/${accountId}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => {
        const list = (d.account?.coachees ?? []).map((c: any) => ({ id: c.id, name: c.clients?.name ?? c.id }))
        setCoachees(list)
        if (list.length > 0) setCoacheeId(list[0].id)
      })
      .catch(() => {})
  }, [accountId, defaultCoacheeId])

  async function save() {
    if (!desc.trim() || !amount || !coacheeId) { setError('Fill in all fields.'); return }
    setSaving(true)
    setError('')
    const res = await fetch(`/api/billing/invoices/${invoiceId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: desc.trim(), unit_amount: parseFloat(amount), coachee_id: coacheeId, source: 'session' }),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Failed'); setSaving(false); return }
    onAdded(d.line)
  }

  return (
    <div className="border-t border-tlw-warm-gray/10 px-4 py-3 space-y-2 bg-tlw-canvas/50">
      {!defaultCoacheeId && coachees.length > 1 && (
        <select
          value={coacheeId}
          onChange={(e) => setCoacheeId(e.target.value)}
          className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-white px-2.5 py-1.5 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
        >
          {coachees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <div className="flex items-center gap-2">
        <input
          autoFocus
          placeholder="Description"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className="min-w-0 flex-1 rounded-tlw-lg border border-tlw-warm-gray/30 bg-white px-2.5 py-1.5 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
        />
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-24 rounded-tlw-lg border border-tlw-warm-gray/30 bg-white px-2.5 py-1.5 text-right text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
        />
        <button onClick={save} disabled={saving} className="shrink-0 text-[12px] font-medium text-tlw-navy-deep hover:underline disabled:opacity-50">
          {saving ? 'Adding…' : 'Add'}
        </button>
        <button onClick={onCancel} className="shrink-0 text-[12px] text-tlw-warm-gray hover:text-tlw-espresso">
          Cancel
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  )
}

// ── Invoice card ───────────────────────────────────────────────────────────────

function InvoiceCard({
  invoice,
  billingSettings,
  onApproved,
  onSent,
  onSkipped,
  onLineUpdated,
  onLineDeleted,
  onLineAdded,
}: {
  invoice: DraftInvoice
  billingSettings: BillingSettings
  onApproved: (id: string) => void
  onSent: (id: string, updates: Partial<DraftInvoice>) => void
  onSkipped: (id: string) => void
  onLineUpdated: (invoiceId: string, line: InvoiceLine) => void
  onLineDeleted: (invoiceId: string, lineId: string) => void
  onLineAdded: (invoiceId: string, line: InvoiceLine) => void
}) {
  const [approving, setApproving] = useState(false)
  const [sending, setSending] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [sendError, setSendError] = useState<string | null>(invoice.stripe_error ?? null)
  const [showPreview, setShowPreview] = useState(false)
  // Track which coachee group has the add-line form open (coacheeId | 'new' | null)
  const [addingForCoachee, setAddingForCoachee] = useState<string | null>(null)

  const isDraft = invoice.status === 'draft'
  const isApproved = invoice.status === 'approved'
  const isSent = invoice.status === 'sent'
  const isPaid = invoice.status === 'paid'
  const isFailed = invoice.status === 'failed'

  const borderClass = isPaid
    ? 'border-emerald-200'
    : isFailed || sendError
    ? 'border-red-200'
    : isApproved
    ? 'border-green-200'
    : isSent
    ? 'border-blue-200'
    : 'border-tlw-warm-gray/15'

  async function doApprove() {
    setApproving(true)
    setShowPreview(false)
    const res = await fetch(`/api/billing/invoices/${invoice.id}/approve`, { method: 'POST' })
    if (res.ok) onApproved(invoice.id)
    setApproving(false)
  }

  async function doApproveAndSend() {
    setApproving(true)
    setShowPreview(false)
    const approveRes = await fetch(`/api/billing/invoices/${invoice.id}/approve`, { method: 'POST' })
    if (!approveRes.ok) { setApproving(false); return }
    onApproved(invoice.id)
    setApproving(false)
    await send()
  }

  function handleApproveClick() {
    if (billingSettings.preview_before_approve) {
      setShowPreview(true)
    } else {
      doApprove()
    }
  }

  async function doSkip() {
    if (!window.confirm('Skip this invoice? Draft invoices will release their sessions back for the next billing run.')) return
    setSkipping(true)
    const res = await fetch(`/api/billing/invoices/${invoice.id}`, { method: 'DELETE' })
    if (res.ok) onSkipped(invoice.id)
    setSkipping(false)
  }

  async function send() {
    setSending(true)
    setSendError(null)
    const res = await fetch(`/api/billing/invoices/${invoice.id}/send`, { method: 'POST' })
    const d = await res.json()
    if (res.ok && d.ok) {
      onSent(invoice.id, {
        status: 'sent',
        stripe_invoice_id: d.stripeId ?? null,
        sent_at: new Date().toISOString(),
        stripe_error: null,
      })
    } else {
      const err = d.error ?? 'Unknown error sending invoice'
      setSendError(err)
      onSent(invoice.id, { stripe_error: err })
    }
    setSending(false)
  }

  return (
    <>
    {showPreview && (
      <InvoicePreviewModal
        invoice={invoice}
        autoSend={billingSettings.auto_send_on_approve}
        onApprove={doApprove}
        onApproveAndSend={doApproveAndSend}
        onClose={() => setShowPreview(false)}
      />
    )}
    <div className={`rounded-tlw-2xl border bg-tlw-surface ${borderClass}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-tlw-warm-gray/10 px-4 py-3">
        <div>
          <Link
            href={`/business-center/invoices/${invoice.id}`}
            className="group/name inline-flex items-baseline gap-1.5 text-[14px] font-semibold text-tlw-navy-deep hover:underline"
          >
            {invoice.billing_accounts.name}
            <span className="text-[11px] font-normal text-tlw-warm-gray opacity-0 transition-opacity group-hover/name:opacity-100">open →</span>
          </Link>
          <p className="text-[12px] text-tlw-warm-gray">{invoice.billing_accounts.billing_email}</p>
          {invoice.billing_accounts.type === 'enterprise' && (() => {
            const names = Array.from(new Set(
              invoice.invoice_lines
                .map((l) => l.coachees?.clients?.name)
                .filter((n): n is string => !!n)
            ))
            return names.length > 0
              ? <p className="mt-0.5 text-[11px] text-tlw-warm-gray/80">Coachees: {names.join(' · ')}</p>
              : null
          })()}
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={invoice.status} />
          {isDraft && (
            <button
              onClick={handleApproveClick}
              disabled={approving}
              className="rounded-tlw-lg bg-tlw-navy-deep px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50"
            >
              {approving ? 'Approving…' : 'Approve'}
            </button>
          )}
          {isApproved && (
            <button
              onClick={send}
              disabled={sending}
              className="rounded-tlw-lg bg-tlw-signal-orange px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send via Stripe'}
            </button>
          )}
          {isFailed && (
            <button
              onClick={send}
              disabled={sending}
              className="rounded-tlw-lg border border-red-300 bg-red-50 px-3 py-1.5 text-[13px] font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              {sending ? 'Retrying…' : 'Retry send'}
            </button>
          )}
          {(isDraft || isApproved) && (
            <button
              onClick={doSkip}
              disabled={skipping}
              className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-warm-gray transition-colors hover:border-tlw-warm-gray/50 hover:text-tlw-espresso disabled:opacity-50"
            >
              {skipping ? 'Skipping…' : 'Skip'}
            </button>
          )}
        </div>
      </div>

      {/* Stripe error banner */}
      {(sendError || invoice.stripe_error) && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2.5">
          <p className="text-[12px] text-red-700">
            <strong>Stripe error:</strong> {sendError ?? invoice.stripe_error}
          </p>
        </div>
      )}

      {/* Lines */}
      {invoice.billing_accounts.type === 'enterprise' ? (
        (() => {
          // Group lines by coachee_id
          const groups = new Map<string, { coacheeId: string; name: string; lines: InvoiceLine[] }>()
          const ungrouped: InvoiceLine[] = []
          for (const line of invoice.invoice_lines) {
            if (line.coachee_id && line.coachees?.clients?.name) {
              const key = line.coachee_id
              if (!groups.has(key)) groups.set(key, { coacheeId: key, name: line.coachees.clients.name, lines: [] })
              groups.get(key)!.lines.push(line)
            } else {
              ungrouped.push(line)
            }
          }
          return (
            <div className="divide-y divide-tlw-warm-gray/8">
              {Array.from(groups.values()).map((group) => (
                <div key={group.coacheeId}>
                  <div className="flex items-center justify-between px-4 pt-3 pb-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-tlw-warm-gray">
                      {group.name}
                    </p>
                    {isDraft && addingForCoachee !== group.coacheeId && (
                      <button
                        onClick={() => setAddingForCoachee(group.coacheeId)}
                        className="text-[11px] font-medium text-tlw-navy-deep hover:underline"
                      >
                        + Add line
                      </button>
                    )}
                  </div>
                  {group.lines.map((line) => (
                    <LineRow
                      key={line.id}
                      line={line}
                      invoiceId={invoice.id}
                      editable={isDraft}
                      onUpdated={(updated) => onLineUpdated(invoice.id, updated)}
                      onDeleted={(lineId) => onLineDeleted(invoice.id, lineId)}
                    />
                  ))}
                  {isDraft && addingForCoachee === group.coacheeId && (
                    <AddLineForm
                      invoiceId={invoice.id}
                      defaultCoacheeId={group.coacheeId}
                      defaultCoacheeName={group.name}
                      accountId={invoice.billing_account_id}
                      onAdded={(line) => { onLineAdded(invoice.id, line); setAddingForCoachee(null) }}
                      onCancel={() => setAddingForCoachee(null)}
                    />
                  )}
                </div>
              ))}
              {ungrouped.map((line) => (
                <LineRow
                  key={line.id}
                  line={line}
                  invoiceId={invoice.id}
                  editable={isDraft}
                  onUpdated={(updated) => onLineUpdated(invoice.id, updated)}
                  onDeleted={(lineId) => onLineDeleted(invoice.id, lineId)}
                />
              ))}
              {/* Add line for a client not yet on this invoice */}
              {isDraft && (
                <div className="px-4 py-2">
                  {addingForCoachee === 'new' ? (
                    <AddLineForm
                      invoiceId={invoice.id}
                      defaultCoacheeId={null}
                      defaultCoacheeName={null}
                      accountId={invoice.billing_account_id}
                      onAdded={(line) => { onLineAdded(invoice.id, line); setAddingForCoachee(null) }}
                      onCancel={() => setAddingForCoachee(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setAddingForCoachee('new')}
                      className="text-[12px] font-medium text-tlw-navy-deep hover:underline"
                    >
                      + Add line for another client
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })()
      ) : (
        <div className="divide-y divide-tlw-warm-gray/8">
          {invoice.invoice_lines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              invoiceId={invoice.id}
              editable={isDraft}
              onUpdated={(updated) => onLineUpdated(invoice.id, updated)}
              onDeleted={(lineId) => onLineDeleted(invoice.id, lineId)}
            />
          ))}
        </div>
      )}

      {/* Total */}
      <div className="flex items-center justify-between border-t border-tlw-warm-gray/10 px-4 py-3">
        <span className="text-[13px] font-semibold text-tlw-navy-deep">Total</span>
        <span className="text-[15px] font-bold text-tlw-navy-deep">{money(invoice.total)}</span>
      </div>

      {/* Audit trail */}
      <div className="border-t border-tlw-warm-gray/10 px-4 py-2 space-y-0.5">
        {invoice.approved_by && (
          <p className="text-[11px] text-tlw-warm-gray">
            Approved by {invoice.approved_by}
            {invoice.approved_at ? ` · ${new Date(invoice.approved_at).toLocaleString()}` : ''}
          </p>
        )}
        {invoice.sent_at && (
          <p className="text-[11px] text-tlw-warm-gray">
            Sent {new Date(invoice.sent_at).toLocaleString()}
            {invoice.stripe_invoice_id ? ` · Stripe ${invoice.stripe_invoice_id}` : ''}
          </p>
        )}
        {invoice.paid_at && (
          <p className="text-[11px] font-medium text-emerald-600">
            Paid {new Date(invoice.paid_at).toLocaleString()}
          </p>
        )}
      </div>
    </div>
    </>
  )
}

// ── Create Invoice Modal ──────────────────────────────────────────────────────

type BillingAccount = { id: string; name: string; billing_email: string }

function CreateInvoiceModal({
  accounts,
  periodStart: defaultStart,
  periodEnd: defaultEnd,
  onCreated,
  onClose,
}: {
  accounts: BillingAccount[]
  periodStart: string
  periodEnd: string
  onCreated: () => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'account' | 'oneoff'>('account')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  // one-off fields
  const [oneoffName, setOneoffName] = useState('')
  const [oneoffEmail, setOneoffEmail] = useState('')
  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(defaultEnd)
  const [lines, setLines] = useState([{ description: '', amount: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function addLine() {
    setLines((cur) => [...cur, { description: '', amount: '' }])
  }

  function removeLine(i: number) {
    setLines((cur) => cur.filter((_, idx) => idx !== i))
  }

  function updateLine(i: number, field: 'description' | 'amount', val: string) {
    setLines((cur) => cur.map((l, idx) => idx === i ? { ...l, [field]: val } : l))
  }

  const total = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const validLines = lines.filter((l) => l.description.trim() && parseFloat(l.amount) > 0)
    if (validLines.length === 0) { setError('Add at least one line with a description and amount.'); return }
    setSaving(true)
    setError('')

    let billingAccountId = accountId

    if (mode === 'oneoff') {
      if (!oneoffName.trim() || !oneoffEmail.trim()) {
        setError('Enter a name and email for the one-off recipient.')
        setSaving(false)
        return
      }
      // Create a temporary solo billing account for this recipient.
      const acctRes = await fetch('/api/billing/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: oneoffName.trim(), billing_email: oneoffEmail.trim(), type: 'solo' }),
      })
      const acctData = await acctRes.json()
      if (!acctRes.ok) { setError(acctData.error ?? 'Failed to create billing account'); setSaving(false); return }
      billingAccountId = acctData.account.id
    }

    const res = await fetch('/api/billing/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billing_account_id: billingAccountId,
        period_start: start || null,
        period_end: end || null,
        lines: validLines.map((l) => ({ description: l.description.trim(), amount: parseFloat(l.amount) })),
      }),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Failed to create invoice'); setSaving(false); return }
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-tlw-2xl bg-white shadow-xl">
        <div className="border-b border-tlw-warm-gray/15 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-tlw-navy-deep">Create invoice</h2>
          <p className="mt-0.5 text-[12px] text-tlw-warm-gray">Manually create a draft invoice with custom line items.</p>
        </div>
        <form onSubmit={submit} className="max-h-[80vh] overflow-y-auto">
          <div className="space-y-4 px-6 py-5">
            {/* Mode toggle */}
            <div className="flex gap-1 rounded-tlw-lg border border-tlw-warm-gray/20 bg-tlw-canvas p-1">
              <button
                type="button"
                onClick={() => setMode('account')}
                className={`flex-1 rounded-tlw-md py-1.5 text-[12px] font-medium transition-colors ${mode === 'account' ? 'bg-white text-tlw-navy-deep shadow-sm' : 'text-tlw-warm-gray hover:text-tlw-espresso'}`}
              >
                Existing account
              </button>
              <button
                type="button"
                onClick={() => setMode('oneoff')}
                className={`flex-1 rounded-tlw-md py-1.5 text-[12px] font-medium transition-colors ${mode === 'oneoff' ? 'bg-white text-tlw-navy-deep shadow-sm' : 'text-tlw-warm-gray hover:text-tlw-espresso'}`}
              >
                One-off recipient
              </button>
            </div>

            {mode === 'account' ? (
              accounts.length === 0 ? (
                <div className="rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-canvas px-4 py-4 text-center">
                  <p className="text-[13px] text-tlw-espresso">No billing accounts yet.</p>
                  <p className="mt-1 text-[12px] text-tlw-warm-gray">
                    Use <strong>One-off recipient</strong> above, or create an account at{' '}
                    <a href="/business-center/accounts" className="text-tlw-navy-deep underline">Business Center → Accounts</a>.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Billing account</label>
                  <select
                    className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    required
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} · {a.billing_email}</option>
                    ))}
                  </select>
                </div>
              )
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Recipient name</label>
                  <input
                    className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-1.5 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                    placeholder="Jane Smith"
                    value={oneoffName}
                    onChange={(e) => setOneoffName(e.target.value)}
                    required={mode === 'oneoff'}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Recipient email</label>
                  <input
                    type="email"
                    className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-1.5 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                    placeholder="jane@example.com"
                    value={oneoffEmail}
                    onChange={(e) => setOneoffEmail(e.target.value)}
                    required={mode === 'oneoff'}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Period start</label>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
                  className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-1.5 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Period end</label>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-1.5 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30" />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[12px] font-medium text-tlw-espresso">Line items</label>
              <div className="space-y-2">
                {lines.map((line, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-1.5 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) => updateLine(i, 'description', e.target.value)}
                      required
                    />
                    <input
                      className="w-28 rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-1.5 text-right text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                      placeholder="0.00"
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.amount}
                      onChange={(e) => updateLine(i, 'amount', e.target.value)}
                      required
                    />
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)} className="shrink-0 text-[12px] text-tlw-warm-gray hover:text-red-500">✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addLine} className="mt-2 text-[12px] font-medium text-tlw-navy-deep hover:underline">
                + Add line
              </button>
            </div>

            <div className="flex items-center justify-between border-t border-tlw-warm-gray/10 pt-3">
              <span className="text-[13px] font-semibold text-tlw-navy-deep">Total</span>
              <span className="text-[15px] font-bold text-tlw-navy-deep">{money(total)}</span>
            </div>

            {error && <p className="text-[12px] text-red-600">{error}</p>}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-tlw-warm-gray/10 px-6 py-4">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || (mode === 'account' && !accountId)}
              className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create draft invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BillingRunPage() {
  const def = currentMonthPeriod()
  const [periodStart, setPeriodStart] = useState(def.start)
  const [periodEnd, setPeriodEnd] = useState(def.end)
  const [assembling, setAssembling] = useState(false)
  const [assembleMsg, setAssembleMsg] = useState('')
  const [assembleDebug, setAssembleDebug] = useState<string[]>([])
  const [assembleWarnings, setAssembleWarnings] = useState<{ clientName: string; detail: string }[]>([])
  const [showDebug, setShowDebug] = useState(false)
  const [invoices, setInvoices] = useState<DraftInvoice[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(true)
  const [approvingAll, setApprovingAll] = useState(false)
  const [sendingAll, setSendingAll] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [billingAccounts, setBillingAccounts] = useState<BillingAccount[]>([])
  const [billingSettings, setBillingSettings] = useState<BillingSettings>({
    preview_before_approve: true,
    auto_send_on_approve: false,
    cc_self_on_send: true,
  })
  const [showSettings, setShowSettings] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  useEffect(() => {
    fetch('/api/billing/accounts')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setBillingAccounts(d.accounts ?? []))
      .catch(() => {})
    fetch('/api/coach')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (d.coach?.billing_settings) setBillingSettings(d.coach.billing_settings) })
      .catch(() => {})
  }, [])

  async function saveBillingSettings(patch: Partial<BillingSettings>) {
    const next = { ...billingSettings, ...patch }
    setBillingSettings(next)
    setSavingSettings(true)
    await fetch('/api/coach', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billingSettings: next }),
    }).catch(() => {})
    setSavingSettings(false)
  }

  const loadInvoices = useCallback(async (start: string, end: string) => {
    setLoadingInvoices(true)
    try {
      const res = await fetch(
        `/api/billing/invoices?status=draft,approved,sent,paid,failed&periodStart=${start}&periodEnd=${end}`,
      )
      if (!res.ok) throw new Error()
      const d = await res.json()
      setInvoices(d.invoices ?? [])
    } catch {
      setInvoices([])
    }
    setLoadingInvoices(false)
  }, [])

  useEffect(() => {
    loadInvoices(periodStart, periodEnd)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function snapCurrentMonth() {
    const p = currentMonthPeriod()
    setPeriodStart(p.start)
    setPeriodEnd(p.end)
    loadInvoices(p.start, p.end)
  }

  async function assemble() {
    setAssembling(true)
    setAssembleMsg('')
    setAssembleDebug([])
    setAssembleWarnings([])
    try {
      const res = await fetch('/api/billing/run/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodStart, periodEnd }),
      })
      const d = await res.json()
      if (!res.ok) {
        setAssembleMsg(`Error: ${d.error}`)
      } else {
        const parts = []
        if (d.created > 0) parts.push(`${d.created} draft invoice${d.created > 1 ? 's' : ''} assembled`)
        if (d.skipped > 0) parts.push(`${d.skipped} account${d.skipped > 1 ? 's' : ''} already invoiced`)
        if (d.empty > 0) parts.push(`${d.empty} account${d.empty > 1 ? 's' : ''} with nothing due`)
        setAssembleMsg(parts.join(' · ') || 'No invoices assembled.')
        if (d.debug) setAssembleDebug(d.debug)
        if (d.warnings) setAssembleWarnings(d.warnings)
        // Auto-open details when accounts had nothing due — helps diagnose why they didn't appear.
        if (d.empty > 0 || d.created === 0) setShowDebug(true)
        await loadInvoices(periodStart, periodEnd)
      }
    } catch {
      setAssembleMsg('Failed to assemble run.')
    }
    setAssembling(false)
  }

  async function approveAll() {
    const draftIds = invoices.filter((i) => i.status === 'draft').map((i) => i.id)
    if (draftIds.length === 0) return
    setApprovingAll(true)
    const res = await fetch('/api/billing/run/approve-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceIds: draftIds }),
    })
    if (res.ok) {
      const d = await res.json()
      setInvoices((cur) =>
        cur.map((inv) =>
          d.approvedIds.includes(inv.id)
            ? { ...inv, status: 'approved', approved_by: 'you', approved_at: new Date().toISOString() }
            : inv,
        ),
      )
    }
    setApprovingAll(false)
  }

  async function sendAll() {
    const approvedIds = invoices.filter((i) => i.status === 'approved').map((i) => i.id)
    if (approvedIds.length === 0) return
    setSendingAll(true)
    // Send sequentially to avoid overwhelming Stripe rate limits.
    for (const id of approvedIds) {
      const res = await fetch(`/api/billing/invoices/${id}/send`, { method: 'POST' })
      const d = await res.json()
      if (res.ok && d.ok) {
        setInvoices((cur) =>
          cur.map((inv) =>
            inv.id === id
              ? { ...inv, status: 'sent', stripe_invoice_id: d.stripeId ?? null, sent_at: new Date().toISOString(), stripe_error: null }
              : inv,
          ),
        )
      } else {
        const err = d.error ?? 'Unknown error'
        setInvoices((cur) =>
          cur.map((inv) => (inv.id === id ? { ...inv, stripe_error: err } : inv)),
        )
      }
    }
    setSendingAll(false)
  }

  function handleApproved(invoiceId: string) {
    setInvoices((cur) =>
      cur.map((inv) =>
        inv.id === invoiceId
          ? { ...inv, status: 'approved', approved_by: 'you', approved_at: new Date().toISOString() }
          : inv,
      ),
    )
  }

  function handleSent(invoiceId: string, updates: Partial<DraftInvoice>) {
    setInvoices((cur) =>
      cur.map((inv) => (inv.id === invoiceId ? { ...inv, ...updates } : inv)),
    )
  }

  function handleLineUpdated(invoiceId: string, line: InvoiceLine) {
    setInvoices((cur) =>
      cur.map((inv) => {
        if (inv.id !== invoiceId) return inv
        const lines = inv.invoice_lines.map((l) => (l.id === line.id ? line : l))
        const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100
        return { ...inv, invoice_lines: lines, total, subtotal: total }
      }),
    )
  }

  function handleSkipped(invoiceId: string) {
    setInvoices((cur) => cur.filter((inv) => inv.id !== invoiceId))
  }

  function handleLineDeleted(invoiceId: string, lineId: string) {
    setInvoices((cur) =>
      cur.map((inv) => {
        if (inv.id !== invoiceId) return inv
        const lines = inv.invoice_lines.filter((l) => l.id !== lineId)
        const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100
        return { ...inv, invoice_lines: lines, total, subtotal: total }
      }),
    )
  }

  function handleLineAdded(invoiceId: string, line: InvoiceLine) {
    setInvoices((cur) =>
      cur.map((inv) => {
        if (inv.id !== invoiceId) return inv
        const lines = [...inv.invoice_lines, line]
        const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100
        return { ...inv, invoice_lines: lines, total, subtotal: total }
      }),
    )
  }

  const SENT_STATUSES = ['sent', 'paid']
  const activeInvoices = invoices.filter((i) => !SENT_STATUSES.includes(i.status))
  const sentInvoices = invoices.filter((i) => SENT_STATUSES.includes(i.status))

  // Sort active invoices: enterprise first, then solo; within each group draft → approved → failed
  const STATUS_ORDER: Record<string, number> = { draft: 0, approved: 1, failed: 2 }
  function sortInvoices(list: DraftInvoice[]) {
    return [...list].sort((a, b) => {
      const aEnt = a.billing_accounts.type === 'enterprise' ? 0 : 1
      const bEnt = b.billing_accounts.type === 'enterprise' ? 0 : 1
      if (aEnt !== bEnt) return aEnt - bEnt
      const aOrd = STATUS_ORDER[a.status] ?? 9
      const bOrd = STATUS_ORDER[b.status] ?? 9
      return aOrd - bOrd
    })
  }

  const draftCount = invoices.filter((i) => i.status === 'draft').length
  const approvedCount = invoices.filter((i) => i.status === 'approved').length
  const draftTotal = invoices
    .filter((i) => i.status === 'draft')
    .reduce((s, i) => s + i.total, 0)
  const approvedTotal = invoices
    .filter((i) => i.status === 'approved')
    .reduce((s, i) => s + i.total, 0)
  const grandTotal = invoices.reduce((s, i) => s + i.total, 0)

  return (
    <>
      <PageHeader
        breadcrumb="Business Center"
        title="Billing run"
        subtitle={invoices.length > 0 ? formatPeriod(periodStart, periodEnd) : undefined}
        actions={
          <Link
            href="/business-center/invoices"
            className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
          >
            ← Invoices
          </Link>
        }
      />

      {/* Period picker + assemble */}
      <div className="mb-6 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface px-5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-tlw-warm-gray">
              Period start
            </label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-1.5 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-tlw-warm-gray">
              Period end
            </label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-1.5 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
            />
          </div>
          <button
            onClick={snapCurrentMonth}
            className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
          >
            Current month
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={assemble}
              disabled={assembling}
              className="rounded-tlw-lg border border-tlw-navy-deep bg-tlw-navy-deep px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50"
            >
              {assembling ? 'Assembling…' : 'Assemble run'}
            </button>
            <button
              onClick={() => loadInvoices(periodStart, periodEnd)}
              className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-2 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
            >
              Refresh
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-2 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
            >
              + Create invoice
            </button>
          </div>
        </div>
        {assembleMsg && (
          <p className="mt-2 text-[12px] text-tlw-warm-gray">{assembleMsg}</p>
        )}
        {assembleWarnings.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {assembleWarnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 rounded-tlw-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <span className="mt-0.5 shrink-0 text-amber-500">⚠</span>
                <p className="min-w-0 flex-1 text-[12px] text-amber-800">{w.detail}</p>
                <button
                  onClick={() => setAssembleWarnings((cur) => cur.filter((_, idx) => idx !== i))}
                  className="shrink-0 text-[12px] font-medium text-amber-600 hover:text-amber-800"
                  title="Dismiss"
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}
        {assembleDebug.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowDebug((v) => !v)}
              className="text-[11px] text-tlw-warm-gray hover:text-tlw-espresso"
            >
              {showDebug ? '▲ Hide details' : '▼ Show details'}
            </button>
            {showDebug && (
              <ul className="mt-1 space-y-0.5 pl-3">
                {assembleDebug.map((msg, i) => (
                  <li key={i} className="text-[11px] text-tlw-warm-gray">{msg}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Billing preferences */}
      <div className="mb-4 rounded-tlw-xl border border-tlw-warm-gray/10 bg-tlw-canvas px-4 py-3">
        <button
          onClick={() => setShowSettings((o) => !o)}
          className="flex w-full items-center justify-between text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
        >
          <span>Billing preferences</span>
          <span>{showSettings ? '▲' : '▼'}</span>
        </button>
        {showSettings && (
          <div className="mt-3 space-y-3 border-t border-tlw-warm-gray/10 pt-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={billingSettings.preview_before_approve}
                onChange={(e) => saveBillingSettings({ preview_before_approve: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-tlw-navy-deep"
              />
              <div>
                <p className="text-[13px] font-medium text-tlw-espresso">Preview invoice before approving</p>
                <p className="text-[11px] text-tlw-warm-gray">Clicking Approve opens a preview of what the client will receive. Uncheck to approve directly.</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={billingSettings.auto_send_on_approve}
                onChange={(e) => saveBillingSettings({ auto_send_on_approve: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-tlw-navy-deep"
              />
              <div>
                <p className="text-[13px] font-medium text-tlw-espresso">Auto-send on approval</p>
                <p className="text-[11px] text-tlw-warm-gray">When previewing, the Approve button becomes &ldquo;Approve &amp; Send&rdquo; — one click approves and sends to Stripe immediately.</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={billingSettings.cc_self_on_send}
                onChange={(e) => saveBillingSettings({ cc_self_on_send: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-tlw-navy-deep"
              />
              <div>
                <p className="text-[13px] font-medium text-tlw-espresso">Email me a copy when invoices are sent</p>
                <p className="text-[11px] text-tlw-warm-gray">After Stripe sends an invoice to the client, you&apos;ll receive a copy summarizing what was sent.</p>
              </div>
            </label>
            {savingSettings && <p className="text-[11px] text-tlw-warm-gray">Saving…</p>}
          </div>
        )}
      </div>

      {/* Summary + batch actions */}
      {invoices.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-tlw-xl border border-tlw-warm-gray/10 bg-tlw-canvas px-4 py-3">
          <div className="flex flex-wrap items-center gap-4 text-[13px]">
            <span className="font-semibold text-tlw-navy-deep">{invoices.length} invoice{invoices.length > 1 ? 's' : ''}</span>
            <span className="text-tlw-warm-gray">{money(grandTotal)} total</span>
            {draftCount > 0 && (
              <span className="text-tlw-warm-gray">{money(draftTotal)} pending approval</span>
            )}
            {approvedCount > 0 && (
              <span className="text-green-700">{money(approvedTotal)} ready to send</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {draftCount > 0 && (
              <button
                onClick={approveAll}
                disabled={approvingAll}
                className="rounded-tlw-lg border border-tlw-navy-deep/40 px-3 py-1.5 text-[13px] font-medium text-tlw-navy-deep transition-colors hover:bg-tlw-navy-deep/5 disabled:opacity-50"
              >
                {approvingAll ? 'Approving…' : `Approve all (${draftCount})`}
              </button>
            )}
            {approvedCount > 0 && (
              <button
                onClick={sendAll}
                disabled={sendingAll}
                className="rounded-tlw-lg bg-tlw-signal-orange px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {sendingAll ? 'Sending…' : `Send all approved (${approvedCount})`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Invoice list */}
      {loadingInvoices ? (
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-tlw-2xl bg-tlw-surface/70" />
          <div className="h-24 animate-pulse rounded-tlw-2xl bg-tlw-surface/70" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-tlw-navy-deep">No invoices for this period</p>
          <p className="mt-1 text-[13px] text-tlw-warm-gray">
            Set the period above and click <strong>Assemble run</strong> to generate draft invoices for all active TLW-owned engagements.
          </p>
        </div>
      ) : (
        <>
          {/* Active invoices — enterprises first, then solo, sorted by status */}
          {activeInvoices.length === 0 && sentInvoices.length > 0 ? null : activeInvoices.length === 0 ? (
            <div className="rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 py-8 text-center">
              <p className="text-[13px] text-tlw-warm-gray">All invoices have been sent or skipped.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortInvoices(activeInvoices).map((inv) => (
                <InvoiceCard
                  key={inv.id}
                  invoice={inv}
                  billingSettings={billingSettings}
                  onApproved={handleApproved}
                  onSent={handleSent}
                  onSkipped={handleSkipped}
                  onLineUpdated={handleLineUpdated}
                  onLineDeleted={handleLineDeleted}
                  onLineAdded={handleLineAdded}
                />
              ))}
            </div>
          )}

          {/* Sent / Paid section — always at the bottom */}
          {sentInvoices.length > 0 && (
            <div className="mt-8">
              <div className="mb-3 flex items-center gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-tlw-warm-gray">
                  Sent · {sentInvoices.length} invoice{sentInvoices.length !== 1 ? 's' : ''}
                </p>
                <div className="h-px flex-1 bg-tlw-warm-gray/15" />
              </div>
              <div className="space-y-3">
                {sortInvoices(sentInvoices).map((inv) => (
                  <InvoiceCard
                    key={inv.id}
                    invoice={inv}
                    billingSettings={billingSettings}
                    onApproved={handleApproved}
                    onSent={handleSent}
                    onSkipped={handleSkipped}
                    onLineUpdated={handleLineUpdated}
                    onLineDeleted={handleLineDeleted}
                    onLineAdded={handleLineAdded}
                  />
                ))}
              </div>
            </div>
          )}
        </>

      )}

      {showCreateModal && (
        <CreateInvoiceModal
          accounts={billingAccounts}
          periodStart={periodStart}
          periodEnd={periodEnd}
          onCreated={async () => {
            setShowCreateModal(false)
            await loadInvoices(periodStart, periodEnd)
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </>
  )
}
