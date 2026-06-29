'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { PageHeader } from '@/app/components/layout/PageHeader'
import type { InvoiceWithLines, InvoiceLine } from '@/lib/billing/types'

function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

const STATUS_STYLES: Record<string, string> = {
  draft:    'bg-tlw-canvas text-tlw-warm-gray',
  approved: 'bg-blue-50 text-blue-700',
  sent:     'bg-amber-50 text-amber-700',
  paid:     'bg-green-50 text-green-700',
  overdue:  'bg-red-50 text-red-700',
  failed:   'bg-red-100 text-red-800',
  void:     'bg-tlw-canvas text-tlw-warm-gray line-through',
}

// ── Add line form ─────────────────────────────────────────────────────────────

function AddLineForm({ invoiceId, onAdded }: { invoiceId: string; onAdded: (line: InvoiceLine) => void }) {
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!desc.trim() || !amount) return
    setSaving(true)
    setErr('')
    const res = await fetch(`/api/billing/invoices/${invoiceId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: desc.trim(), unit_amount: Number(amount), quantity: 1, source: 'manual' }),
    })
    const data = await res.json()
    if (!res.ok) { setErr(data.error ?? 'Failed to add line'); setSaving(false); return }
    onAdded(data.line)
    setDesc('')
    setAmount('')
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="border-t border-tlw-warm-gray/10 px-5 py-4">
      <p className="mb-3 text-[12px] font-medium uppercase tracking-wider text-tlw-warm-gray">Add line item</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-[11px] text-tlw-warm-gray">Description</label>
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="e.g. Leadership assessment, Proposal review…"
            className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-1.5 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
            required
          />
        </div>
        <div className="w-32">
          <label className="mb-1 block text-[11px] text-tlw-warm-gray">Amount ($)</label>
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-1.5 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
            required
          />
        </div>
        <button
          type="submit"
          disabled={saving || !desc.trim() || !amount}
          className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
      </div>
      {err && <p className="mt-2 text-[12px] text-red-600">{err}</p>}
    </form>
  )
}

// ── Edit line modal ───────────────────────────────────────────────────────────

function EditLineModal({ line, invoiceId, onSaved, onDeleted, onClose }: {
  line: InvoiceLine
  invoiceId: string
  onSaved: (line: InvoiceLine) => void
  onDeleted: (lineId: string) => void
  onClose: () => void
}) {
  const [desc, setDesc] = useState(line.description)
  const [amount, setAmount] = useState(String(line.unit_amount))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setSaving(true)
    setErr('')
    const res = await fetch(`/api/billing/invoices/${invoiceId}/lines/${line.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: desc.trim(), unit_amount: Number(amount) }),
    })
    const data = await res.json()
    if (!res.ok) { setErr(data.error ?? 'Failed'); setSaving(false); return }
    onSaved(data.line)
    onClose()
  }

  async function remove() {
    if (!confirm('Remove this line item?')) return
    setDeleting(true)
    await fetch(`/api/billing/invoices/${invoiceId}/lines/${line.id}`, { method: 'DELETE' })
    onDeleted(line.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-tlw-2xl bg-white shadow-xl">
        <div className="border-b border-tlw-warm-gray/15 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-tlw-navy-deep">Edit line item</h2>
        </div>
        <div className="space-y-3 px-6 py-5">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">Description</span>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="mt-1 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">Amount ($)</span>
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
            />
          </label>
          {err && <p className="text-[12px] text-red-600">{err}</p>}
        </div>
        <div className="flex items-center justify-between border-t border-tlw-warm-gray/10 px-6 py-4">
          <button
            onClick={remove}
            disabled={deleting}
            className="text-[13px] text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            {deleting ? 'Removing…' : 'Remove'}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">Cancel</button>
            <button
              onClick={save}
              disabled={saving || !desc.trim() || !amount}
              className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Mark paid modal ───────────────────────────────────────────────────────────

function MarkPaidModal({ invoiceId, onPaid, onClose }: {
  invoiceId: string
  onPaid: (invoice: InvoiceWithLines) => void
  onClose: () => void
}) {
  const [note, setNote] = useState('Bank transfer')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErr('')
    const res = await fetch(`/api/billing/invoices/${invoiceId}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note.trim() || null }),
    })
    const data = await res.json()
    if (!res.ok) { setErr(data.error ?? 'Failed'); setSaving(false); return }
    onPaid(data.invoice)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-tlw-2xl bg-white shadow-xl">
        <div className="border-b border-tlw-warm-gray/15 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-tlw-navy-deep">Mark as paid</h2>
          <p className="mt-0.5 text-[12px] text-tlw-warm-gray">Record a payment received outside Stripe (wire, ACH, check, etc.).</p>
        </div>
        <form onSubmit={submit}>
          <div className="px-6 py-5 space-y-3">
            <label className="block">
              <span className="text-[12px] font-medium text-tlw-espresso">Payment note <span className="font-normal text-tlw-warm-gray">(optional)</span></span>
              <input
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Bank transfer, ACH, Check #1234"
                className="mt-1 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
              />
            </label>
            {err && <p className="text-[12px] text-red-600">{err}</p>}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-tlw-warm-gray/10 px-6 py-4">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">Cancel</button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-tlw-lg bg-emerald-600 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Mark as paid'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [invoice, setInvoice] = useState<InvoiceWithLines | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [editLine, setEditLine] = useState<InvoiceLine | null>(null)
  const [message, setMessage] = useState('')
  const [savingMessage, setSavingMessage] = useState(false)
  const [showMarkPaid, setShowMarkPaid] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`/api/billing/invoices/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setInvoice(d.invoice); setMessage((d.invoice as any).client_message ?? '') })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  async function saveMessage() {
    if (!invoice) return
    setSavingMessage(true)
    await fetch(`/api/billing/invoices/${invoice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_message: message.trim() || null }),
    })
    setSavingMessage(false)
  }

  function addLine(line: InvoiceLine) {
    setInvoice((inv) => inv ? { ...inv, lines: [...inv.lines, line], total: inv.total + line.amount } : inv)
  }

  function updateLine(updated: InvoiceLine) {
    setInvoice((inv) => {
      if (!inv) return inv
      const lines = inv.lines.map((l) => l.id === updated.id ? updated : l)
      const total = lines.reduce((s, l) => s + l.amount, 0)
      return { ...inv, lines, total }
    })
  }

  function deleteLine(lineId: string) {
    setInvoice((inv) => {
      if (!inv) return inv
      const lines = inv.lines.filter((l) => l.id !== lineId)
      const total = lines.reduce((s, l) => s + l.amount, 0)
      return { ...inv, lines, total }
    })
  }

  const period = invoice?.period_end
    ? new Date(invoice.period_end).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null

  return (
    <>
      <PageHeader
        breadcrumb={`Business Center / ${invoice?.account?.name ?? 'Invoices'}`}
        title={period ? `Invoice · ${period}` : 'Invoice'}
        actions={
          <div className="flex items-center gap-2">
            {invoice && (
              <span className={`rounded-full px-3 py-1 text-[12px] font-medium capitalize ${STATUS_STYLES[invoice.status] ?? ''}`}>
                {invoice.status}
              </span>
            )}
            {invoice && ['sent', 'overdue', 'failed'].includes(invoice.status) && (
              <button
                onClick={() => setShowMarkPaid(true)}
                className="rounded-tlw-lg bg-emerald-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-emerald-700"
              >
                Mark as paid
              </button>
            )}
            <Link
              href="/business-center/invoices"
              className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
            >
              ← Back
            </Link>
          </div>
        }
      />

      {loading && <div className="h-48 animate-pulse rounded-tlw-2xl bg-tlw-surface/70" />}
      {error && <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load invoice.</p>}

      {invoice && (
        <div className="space-y-6">
          {/* Client message */}
          <section className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface px-5 py-4">
            <p className="mb-2 text-[13px] font-semibold text-tlw-navy-deep">Message to client</p>
            <p className="mb-2 text-[11px] text-tlw-warm-gray">This appears at the top of the invoice when the client views it.</p>
            {invoice.status === 'draft' ? (
              <div className="space-y-2">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="e.g. Thank you for your continued partnership. Please find the details below."
                  className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                />
                <div className="flex justify-end">
                  <button
                    onClick={saveMessage}
                    disabled={savingMessage}
                    className="rounded-tlw-lg bg-tlw-navy-deep px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
                  >
                    {savingMessage ? 'Saving…' : 'Save message'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-tlw-espresso">
                {(invoice as any).client_message ?? <span className="italic text-tlw-warm-gray/50">No message added.</span>}
              </p>
            )}
          </section>

          {/* Line items */}
          <section className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
            <div className="border-b border-tlw-warm-gray/10 px-5 py-3">
              <p className="text-[13px] font-semibold text-tlw-navy-deep">Line items</p>
            </div>
            {invoice.lines.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-tlw-warm-gray">No line items yet. Add one below.</p>
            ) : (
              <div className="divide-y divide-tlw-warm-gray/10">
                {invoice.lines.map((line) => (
                  <div
                    key={line.id}
                    className={`flex items-start justify-between gap-4 px-5 py-3 ${invoice.status === 'draft' ? 'cursor-pointer hover:bg-tlw-canvas' : ''}`}
                    onClick={() => invoice.status === 'draft' && setEditLine(line)}
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] text-tlw-espresso">{line.description}</p>
                      {line.quantity !== 1 && (
                        <p className="text-[11px] text-tlw-warm-gray">
                          {line.quantity} × {money(line.unit_amount)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[13px] font-medium text-tlw-navy-deep">{money(line.amount)}</span>
                      {invoice.status === 'draft' && (
                        <span className="text-[11px] text-tlw-warm-gray/60">edit</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-tlw-warm-gray/10 px-5 py-3">
              <div className="flex justify-between text-[14px] font-semibold text-tlw-navy-deep">
                <span>Total</span>
                <span>{money(invoice.total)}</span>
              </div>
            </div>
            {invoice.status === 'draft' && (
              <AddLineForm invoiceId={invoice.id} onAdded={addLine} />
            )}
          </section>

          {/* Audit trail */}
          {(invoice.approved_at || invoice.sent_at || invoice.paid_at) && (
            <section className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface px-5 py-4">
              <p className="mb-2 text-[13px] font-semibold text-tlw-navy-deep">Audit</p>
              <div className="space-y-1 text-[12px] text-tlw-warm-gray">
                {invoice.approved_at && (
                  <p>Approved by {invoice.approved_by ?? '—'} · {new Date(invoice.approved_at).toLocaleString()}</p>
                )}
                {invoice.sent_at && <p>Sent · {new Date(invoice.sent_at).toLocaleString()}</p>}
                {invoice.paid_at && (
                  <p>Paid · {new Date(invoice.paid_at).toLocaleString()}{(invoice as any).payment_note ? ` · ${(invoice as any).payment_note}` : ''}</p>
                )}
              </div>
            </section>
          )}

          {/* Phase 3/4 actions placeholder */}
          {invoice.status === 'draft' && (
            <div className="rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 py-6 text-center">
              <p className="text-[13px] text-tlw-warm-gray">
                Approve and send actions coming in Phase 3/4.
              </p>
            </div>
          )}

          {editLine && (
            <EditLineModal
              line={editLine}
              invoiceId={invoice.id}
              onSaved={(updated) => { updateLine(updated); setEditLine(null) }}
              onDeleted={(lid) => { deleteLine(lid); setEditLine(null) }}
              onClose={() => setEditLine(null)}
            />
          )}
        </div>
      )}

      {showMarkPaid && invoice && (
        <MarkPaidModal
          invoiceId={invoice.id}
          onPaid={(inv) => { setInvoice(inv as InvoiceWithLines); setShowMarkPaid(false) }}
          onClose={() => setShowMarkPaid(false)}
        />
      )}
    </>
  )
}
