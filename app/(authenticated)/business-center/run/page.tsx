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
}

type DraftInvoice = {
  id: string
  billing_account_id: string
  status: string
  subtotal: number
  total: number
  approved_by: string | null
  approved_at: string | null
  billing_accounts: { id: string; name: string; type: string; billing_email: string }
  invoice_lines: InvoiceLine[]
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

function InvoiceCard({
  invoice,
  onApproved,
  onLineUpdated,
  onLineDeleted,
}: {
  invoice: DraftInvoice
  onApproved: (id: string) => void
  onLineUpdated: (invoiceId: string, line: InvoiceLine) => void
  onLineDeleted: (invoiceId: string, lineId: string) => void
}) {
  const [approving, setApproving] = useState(false)
  const isDraft = invoice.status === 'draft'
  const isApproved = invoice.status === 'approved'

  async function approve() {
    setApproving(true)
    const res = await fetch(`/api/billing/invoices/${invoice.id}/approve`, { method: 'POST' })
    if (res.ok) onApproved(invoice.id)
    setApproving(false)
  }

  return (
    <div className={`rounded-tlw-2xl border bg-tlw-surface ${isApproved ? 'border-green-200' : 'border-tlw-warm-gray/15'}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-tlw-warm-gray/10 px-4 py-3">
        <div>
          <p className="text-[14px] font-semibold text-tlw-navy-deep">{invoice.billing_accounts.name}</p>
          <p className="text-[12px] text-tlw-warm-gray">{invoice.billing_accounts.billing_email}</p>
        </div>
        <div className="flex items-center gap-2">
          {isApproved ? (
            <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-[12px] font-medium text-green-700">
              ✓ Approved
            </span>
          ) : isDraft ? (
            <button
              onClick={approve}
              disabled={approving}
              className="rounded-tlw-lg bg-tlw-navy-deep px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50"
            >
              {approving ? 'Approving…' : 'Approve'}
            </button>
          ) : (
            <span className="rounded-full bg-tlw-canvas px-2.5 py-0.5 text-[12px] capitalize text-tlw-warm-gray">
              {invoice.status}
            </span>
          )}
        </div>
      </div>

      {/* Lines */}
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

      {/* Total */}
      <div className="flex items-center justify-between border-t border-tlw-warm-gray/10 px-4 py-3">
        <span className="text-[13px] font-semibold text-tlw-navy-deep">Total</span>
        <span className="text-[15px] font-bold text-tlw-navy-deep">{money(invoice.total)}</span>
      </div>

      {isApproved && invoice.approved_by && (
        <p className="border-t border-tlw-warm-gray/10 px-4 py-2 text-[11px] text-tlw-warm-gray">
          Approved by {invoice.approved_by} · {new Date(invoice.approved_at!).toLocaleString()}
        </p>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BillingRunPage() {
  const def = defaultPeriod()
  const [periodStart, setPeriodStart] = useState(def.start)
  const [periodEnd, setPeriodEnd] = useState(def.end)
  const [assembling, setAssembling] = useState(false)
  const [assembleMsg, setAssembleMsg] = useState('')
  const [invoices, setInvoices] = useState<DraftInvoice[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(true)
  const [approvingAll, setApprovingAll] = useState(false)

  const loadInvoices = useCallback(async (start: string, end: string) => {
    setLoadingInvoices(true)
    try {
      const res = await fetch(
        `/api/billing/invoices?status=draft,approved&periodStart=${start}&periodEnd=${end}`,
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

  async function assemble() {
    setAssembling(true)
    setAssembleMsg('')
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

  function handleApproved(invoiceId: string) {
    setInvoices((cur) =>
      cur.map((inv) =>
        inv.id === invoiceId
          ? { ...inv, status: 'approved', approved_by: 'you', approved_at: new Date().toISOString() }
          : inv,
      ),
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

  const draftCount = invoices.filter((i) => i.status === 'draft').length
  const draftTotal = invoices
    .filter((i) => i.status === 'draft')
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
            href="/business-center"
            className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
          >
            ← Back
          </Link>
        }
      />

      {/* Period picker + assemble */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface px-5 py-4">
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
        {assembleMsg && (
          <p className="w-full text-[12px] text-tlw-warm-gray">{assembleMsg}</p>
        )}
      </div>

      {/* Summary + approve-all */}
      {invoices.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-tlw-xl border border-tlw-warm-gray/10 bg-tlw-canvas px-4 py-3">
          <div className="flex items-center gap-4 text-[13px]">
            <span className="font-semibold text-tlw-navy-deep">{invoices.length} invoice{invoices.length > 1 ? 's' : ''}</span>
            <span className="text-tlw-warm-gray">
              {money(grandTotal)} total
              {draftCount > 0 && ` · ${money(draftTotal)} pending approval`}
            </span>
          </div>
          {draftCount > 0 && (
            <button
              onClick={approveAll}
              disabled={approvingAll}
              className="rounded-tlw-lg border border-tlw-navy-deep/40 px-3 py-1.5 text-[13px] font-medium text-tlw-navy-deep transition-colors hover:bg-tlw-navy-deep/5 disabled:opacity-50"
            >
              {approvingAll ? 'Approving…' : `Approve all (${draftCount})`}
            </button>
          )}
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
        <div className="space-y-4">
          {invoices.map((inv) => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              onApproved={handleApproved}
              onLineUpdated={handleLineUpdated}
              onLineDeleted={handleLineDeleted}
            />
          ))}
        </div>
      )}
    </>
  )
}
