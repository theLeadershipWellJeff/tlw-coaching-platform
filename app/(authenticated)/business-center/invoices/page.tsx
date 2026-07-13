'use client'
import { useEffect, useState, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { PageHeader } from '@/app/components/layout/PageHeader'

type Invoice = {
  id: string
  status: string
  period_start: string | null
  period_end: string | null
  total: number
  received_at: string | null
  billing_accounts: {
    id: string
    name: string
    billing_email: string
  } | null
}

type BillingAccount = { id: string; name: string; billing_email: string }

const STATUS_OPTIONS = ['all', 'draft', 'approved', 'sent', 'paid', 'overdue', 'void'] as const
type StatusFilter = (typeof STATUS_OPTIONS)[number]

const STATUS_LABELS: Record<string, string> = {
  all: 'All', draft: 'Draft', approved: 'Approved',
  sent: 'Sent', paid: 'Paid', overdue: 'Overdue', void: 'Void',
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-tlw-canvas text-tlw-warm-gray',
  approved: 'bg-blue-50 text-blue-700',
  sent: 'bg-amber-50 text-amber-700',
  paid: 'bg-green-50 text-green-700',
  overdue: 'bg-red-50 text-red-700',
  failed: 'bg-red-100 text-red-800',
  void: 'bg-tlw-canvas text-tlw-warm-gray',
}

function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return '—'
  const fmt = (d: string) =>
    new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  if (start && end) {
    const s = new Date(start + 'T12:00:00Z')
    const e = new Date(end + 'T12:00:00Z')
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) return fmt(end)
    return `${fmt(start)} – ${fmt(end)}`
  }
  return fmt((start ?? end)!)
}

// ── Create Invoice Modal ───────────────────────────────────────────────────────

function CreateInvoiceModal({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [accounts, setAccounts] = useState<BillingAccount[]>([])
  const [mode, setMode] = useState<'account' | 'oneoff'>('account')
  const [accountId, setAccountId] = useState('')
  const [oneoffName, setOneoffName] = useState('')
  const [oneoffEmail, setOneoffEmail] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [lines, setLines] = useState([{ description: '', amount: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/billing/accounts')
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => {
        setAccounts(d.accounts ?? [])
        if (d.accounts?.[0]) setAccountId(d.accounts[0].id)
      })
      .catch(() => {})
  }, [])

  const total = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)

  function addLine() { setLines((c) => [...c, { description: '', amount: '' }]) }
  function removeLine(i: number) { setLines((c) => c.filter((_, idx) => idx !== i)) }
  function updateLine(i: number, field: 'description' | 'amount', val: string) {
    setLines((c) => c.map((l, idx) => idx === i ? { ...l, [field]: val } : l))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const validLines = lines.filter((l) => l.description.trim() && parseFloat(l.amount) > 0)
    if (validLines.length === 0) { setError('Add at least one line with a description and amount.'); return }
    setSaving(true); setError('')

    let billingAccountId = accountId
    if (mode === 'oneoff') {
      if (!oneoffName.trim() || !oneoffEmail.trim()) {
        setError('Enter a name and email for the one-off recipient.'); setSaving(false); return
      }
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
              {(['account', 'oneoff'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-tlw-md py-1.5 text-[12px] font-medium transition-colors ${mode === m ? 'bg-white text-tlw-navy-deep shadow-sm' : 'text-tlw-warm-gray hover:text-tlw-espresso'}`}
                >
                  {m === 'account' ? 'Existing account' : 'One-off recipient'}
                </button>
              ))}
            </div>

            {mode === 'account' ? (
              accounts.length === 0 ? (
                <p className="text-[13px] text-tlw-warm-gray">No billing accounts yet. Use One-off recipient above.</p>
              ) : (
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Billing account</label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} — {a.billing_email}</option>
                    ))}
                  </select>
                </div>
              )
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Name</label>
                  <input
                    value={oneoffName}
                    onChange={(e) => setOneoffName(e.target.value)}
                    placeholder="Client or company name"
                    className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Email</label>
                  <input
                    type="email"
                    value={oneoffEmail}
                    onChange={(e) => setOneoffEmail(e.target.value)}
                    placeholder="billing@example.com"
                    className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                  />
                </div>
              </div>
            )}

            {/* Period */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Period start</label>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
                  className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Period end</label>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange" />
              </div>
            </div>

            {/* Line items */}
            <div>
              <p className="mb-2 text-[12px] font-medium text-tlw-espresso">Line items</p>
              <div className="space-y-2">
                {lines.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={l.description}
                      onChange={(e) => updateLine(i, 'description', e.target.value)}
                      placeholder="Description"
                      className="min-w-0 flex-1 rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-1.5 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                    />
                    <input
                      type="number" min="0" step="any"
                      value={l.amount}
                      onChange={(e) => updateLine(i, 'amount', e.target.value)}
                      placeholder="$0"
                      className="w-24 rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-1.5 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                    />
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)} className="text-[13px] text-tlw-warm-gray hover:text-red-600">✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addLine} className="mt-2 text-[12px] text-tlw-navy-deep hover:underline">
                + Add line
              </button>
            </div>

            <div className="flex justify-between text-[13px] font-semibold text-tlw-navy-deep">
              <span>Total</span>
              <span>{total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
            </div>

            {error && <p className="text-[12px] text-red-600">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t border-tlw-warm-gray/10 px-6 py-4">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">Cancel</button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main invoice list ─────────────────────────────────────────────────────────

function InvoicesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const initialStatus = (searchParams.get('status') ?? 'all') as StatusFilter
  const [status, setStatus] = useState<StatusFilter>(STATUS_OPTIONS.includes(initialStatus) ? initialStatus : 'all')
  const [showCreate, setShowCreate] = useState(false)

  const loadInvoices = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '200' })
    if (status !== 'all') params.set('status', status)
    try {
      const res = await fetch(`/api/billing/invoices?${params}`)
      if (!res.ok) throw new Error()
      const d = await res.json()
      setInvoices(d.invoices ?? [])
    } catch {
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { loadInvoices() }, [loadInvoices])

  const filtered = invoices.filter((inv) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (inv.billing_accounts?.name ?? '').toLowerCase().includes(q) ||
      (inv.billing_accounts?.billing_email ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <>
      <PageHeader
        eyebrow="theLeadershipWell"
        title="Invoices"
        subtitle="Billing runs, outstanding AR, and payment history"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
            >
              + New invoice
            </button>
            <Link
              href="/business-center/run"
              className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-deep/90"
            >
              Run billing
            </Link>
          </div>
        }
      />

      {/* Status tab filter */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                status === s
                  ? 'bg-tlw-navy-deep text-white'
                  : 'bg-tlw-canvas text-tlw-warm-gray hover:text-tlw-espresso'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search by account…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto w-48 rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-surface px-3 py-1.5 text-[13px] text-tlw-espresso placeholder:text-tlw-warm-gray/60 focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
        />
      </div>

      {loading && <div className="h-32 animate-pulse rounded-tlw-2xl bg-tlw-surface/70" />}

      {!loading && filtered.length === 0 && (
        <div className="rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-tlw-navy-deep">No invoices</p>
          <p className="mt-1 text-[13px] text-tlw-warm-gray">
            {status !== 'all' ? `No ${status} invoices found.` : 'Run billing or create a manual invoice to get started.'}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="divide-y divide-tlw-warm-gray/10 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
          {filtered.map((inv) => (
            <Link
              key={inv.id}
              href={`/business-center/invoices/${inv.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-tlw-canvas"
            >
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-tlw-navy-deep">
                  {inv.billing_accounts?.name ?? 'Unknown account'}
                </p>
                <p className="text-[12px] text-tlw-warm-gray">
                  {inv.billing_accounts?.billing_email ?? ''}
                  {inv.billing_accounts?.billing_email && ' · '}
                  {formatPeriod(inv.period_start, inv.period_end)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[inv.status] ?? 'bg-tlw-canvas text-tlw-warm-gray'}`}>
                  {inv.status}
                </span>
                {inv.received_at && ['sent', 'overdue'].includes(inv.status) && (
                  <span
                    className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                    title={`Client opened the invoice ${new Date(inv.received_at).toLocaleString()}`}
                  >
                    received ✓
                  </span>
                )}
                <span className="text-[13px] font-medium text-tlw-navy-deep">
                  {(inv.total ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateInvoiceModal
          onCreated={() => { setShowCreate(false); loadInvoices() }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </>
  )
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="h-32 animate-pulse rounded-tlw-2xl bg-tlw-surface/70" />}>
      <InvoicesContent />
    </Suspense>
  )
}
