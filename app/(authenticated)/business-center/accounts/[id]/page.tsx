'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { PageHeader } from '@/app/components/layout/PageHeader'

// ── Types ─────────────────────────────────────────────────────────────────────

type Client = { id: string; name: string; email: string | null }

type Coachee = {
  id: string
  client_id: string
  clients: Client
}

type Engagement = {
  id: string
  coachee_id: string
  billing_mode: string
  billing_owner: string
  status: string
  rate_hourly: number | null
  monthly_amount: number | null
  billing_day: number | null
  engagement_total: number | null
  installment_count: number | null
  description_template: string | null
  coachees?: Coachee
}

type Account = {
  id: string
  name: string
  type: string
  billing_email: string
  stripe_customer_id: string | null
  coachees: Coachee[]
  engagements: Engagement[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function money(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

const MODE_LABEL: Record<string, string> = {
  arrears: 'Arrears (hourly)',
  subscription: 'Subscription (flat monthly)',
  per_engagement: 'Per engagement (installments)',
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-50 text-green-700',
  paused: 'bg-amber-50 text-amber-700',
  ended: 'bg-tlw-canvas text-tlw-warm-gray',
}

// ── Add Coachee Modal ─────────────────────────────────────────────────────────

function AddCoacheeModal({ accountId, existingClientIds, onAdded, onClose }: {
  accountId: string
  existingClientIds: string[]
  onAdded: (coachee: Coachee) => void
  onClose: () => void
}) {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const all: Client[] = d.clients ?? []
        setClients(all.filter((c) => !existingClientIds.includes(c.id)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [existingClientIds])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId) return
    setSaving(true)
    setError('')
    const res = await fetch(`/api/billing/accounts/${accountId}/coachees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId }),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Failed'); setSaving(false); return }
    onAdded(d.coachee)
  }

  const available = clients.filter((c) => !existingClientIds.includes(c.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-tlw-2xl bg-white shadow-xl">
        <div className="border-b border-tlw-warm-gray/15 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-tlw-navy-deep">Add coachee</h2>
          <p className="mt-0.5 text-[12px] text-tlw-warm-gray">Link a client from your roster to this billing account.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 px-6 py-5">
          {loading ? (
            <div className="h-10 animate-pulse rounded-tlw-lg bg-tlw-canvas" />
          ) : available.length === 0 ? (
            <p className="text-[13px] text-tlw-warm-gray">All clients are already linked to this account, or your roster is empty.</p>
          ) : (
            <div>
              <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Client</label>
              <select
                className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
              >
                <option value="">Select a client…</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ''}</option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !clientId || available.length === 0}
              className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add coachee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Add Engagement Modal ──────────────────────────────────────────────────────

function AddEngagementModal({ accountId, coachees, onAdded, onClose }: {
  accountId: string
  coachees: Coachee[]
  onAdded: (eng: Engagement) => void
  onClose: () => void
}) {
  const [coacheeId, setCoacheeId] = useState(coachees[0]?.id ?? '')
  const [mode, setMode] = useState<'arrears' | 'subscription' | 'per_engagement'>('arrears')
  const [owner, setOwner] = useState<'TLW' | 'CA'>('TLW')
  // arrears
  const [rateHourly, setRateHourly] = useState('')
  // subscription
  const [monthlyAmount, setMonthlyAmount] = useState('')
  const [billingDay, setBillingDay] = useState('1')
  // per_engagement
  const [engTotal, setEngTotal] = useState('')
  const [installCount, setInstallCount] = useState('3')
  const [installDates, setInstallDates] = useState<{ date: string; amount: string; label: string }[]>([
    { date: '', amount: '', label: 'Deposit' },
    { date: '', amount: '', label: 'Mid-point' },
    { date: '', amount: '', label: 'Final' },
  ])
  const [descTemplate, setDescTemplate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateInstallCount(n: number) {
    setInstallCount(String(n))
    setInstallDates((cur) => {
      const next = Array.from({ length: n }, (_, i) => cur[i] ?? { date: '', amount: '', label: `Installment ${i + 1}` })
      return next
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const body: Record<string, unknown> = {
      coachee_id: coacheeId,
      billing_mode: mode,
      billing_owner: owner,
      description_template: descTemplate.trim() || null,
    }

    if (mode === 'arrears') {
      body.rate_hourly = parseFloat(rateHourly)
    } else if (mode === 'subscription') {
      body.monthly_amount = parseFloat(monthlyAmount)
      body.billing_day = parseInt(billingDay, 10)
    } else {
      body.engagement_total = parseFloat(engTotal)
      body.installment_count = installDates.length
      body.installment_schedule = installDates.map((d) => ({
        due_date: d.date,
        amount: parseFloat(d.amount),
        label: d.label,
      }))
    }

    const res = await fetch(`/api/billing/accounts/${accountId}/engagements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Failed'); setSaving(false); return }
    onAdded(d.engagement)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-tlw-2xl bg-white shadow-xl">
        <div className="border-b border-tlw-warm-gray/15 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-tlw-navy-deep">New engagement</h2>
          <p className="mt-0.5 text-[12px] text-tlw-warm-gray">Define how and when coaching is billed for a coachee.</p>
        </div>
        <form onSubmit={submit} className="max-h-[75vh] overflow-y-auto">
          <div className="space-y-4 px-6 py-5">

            {/* Coachee */}
            {coachees.length > 1 && (
              <div>
                <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Coachee</label>
                <select
                  className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                  value={coacheeId}
                  onChange={(e) => setCoacheeId(e.target.value)}
                  required
                >
                  {coachees.map((c) => (
                    <option key={c.id} value={c.id}>{c.clients?.name ?? c.id}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Billing owner */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Billing owner</label>
              <div className="flex gap-3">
                {(['TLW', 'CA'] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOwner(o)}
                    className={`flex-1 rounded-tlw-lg border px-3 py-2 text-[13px] font-medium transition-colors ${
                      owner === o
                        ? 'border-tlw-navy-deep bg-tlw-navy-deep text-white'
                        : 'border-tlw-warm-gray/30 text-tlw-espresso hover:bg-tlw-canvas'
                    }`}
                  >
                    {o === 'TLW' ? 'TLW (us)' : 'Coach Accountable'}
                  </button>
                ))}
              </div>
              {owner === 'CA' && (
                <p className="mt-1 text-[11px] text-amber-600">CA-owned engagements won&apos;t appear in billing runs &mdash; they&apos;re tracked in Coach Accountable only.</p>
              )}
            </div>

            {/* Billing mode */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Billing mode</label>
              <div className="flex flex-col gap-2">
                {(['arrears', 'subscription', 'per_engagement'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-tlw-lg border px-3 py-2 text-left text-[13px] transition-colors ${
                      mode === m
                        ? 'border-tlw-navy-deep bg-tlw-navy-deep/5 font-medium text-tlw-navy-deep'
                        : 'border-tlw-warm-gray/30 text-tlw-espresso hover:bg-tlw-canvas'
                    }`}
                  >
                    {MODE_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>

            {/* Mode-specific fields */}
            {mode === 'arrears' && (
              <div>
                <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Hourly rate (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="250"
                  value={rateHourly}
                  onChange={(e) => setRateHourly(e.target.value)}
                  className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                />
                <p className="mt-1 text-[11px] text-tlw-warm-gray">Billed in half-hour units with a 1-hour minimum.</p>
              </div>
            )}

            {mode === 'subscription' && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Monthly amount (USD)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="1500"
                    value={monthlyAmount}
                    onChange={(e) => setMonthlyAmount(e.target.value)}
                    className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                  />
                </div>
                <div className="w-28">
                  <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Billing day</label>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    value={billingDay}
                    onChange={(e) => setBillingDay(e.target.value)}
                    className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                  />
                </div>
              </div>
            )}

            {mode === 'per_engagement' && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Engagement total (USD)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      placeholder="6000"
                      value={engTotal}
                      onChange={(e) => setEngTotal(e.target.value)}
                      className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                    />
                  </div>
                  <div className="w-28">
                    <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Installments</label>
                    <select
                      value={installCount}
                      onChange={(e) => updateInstallCount(parseInt(e.target.value, 10))}
                      className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                    >
                      {[1, 2, 3, 4, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[12px] font-medium text-tlw-espresso">Installment schedule</p>
                  {installDates.map((inst, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Label"
                        value={inst.label}
                        onChange={(e) => setInstallDates((cur) => cur.map((d, j) => j === i ? { ...d, label: e.target.value } : d))}
                        className="w-28 rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-2 py-1.5 text-[12px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                      />
                      <input
                        type="date"
                        required
                        value={inst.date}
                        onChange={(e) => setInstallDates((cur) => cur.map((d, j) => j === i ? { ...d, date: e.target.value } : d))}
                        className="flex-1 rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-2 py-1.5 text-[12px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        placeholder="USD"
                        value={inst.amount}
                        onChange={(e) => setInstallDates((cur) => cur.map((d, j) => j === i ? { ...d, amount: e.target.value } : d))}
                        className="w-24 rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-2 py-1.5 text-right text-[12px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Description template (optional) */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">
                Invoice line description <span className="font-normal text-tlw-warm-gray">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="Executive coaching — Q3 2025"
                value={descTemplate}
                onChange={(e) => setDescTemplate(e.target.value)}
                className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
              />
              <p className="mt-1 text-[11px] text-tlw-warm-gray">Leave blank to use the auto-generated description.</p>
            </div>

            {error && <p className="text-[12px] text-red-600">{error}</p>}
          </div>

          <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-tlw-warm-gray/10 bg-white px-6 py-4">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !coacheeId}
              className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create engagement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Account invoices ──────────────────────────────────────────────────────────

function AccountInvoices({ accountId }: { accountId: string }) {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/billing/invoices?accountId=${accountId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setInvoices(d.invoices ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [accountId])

  if (loading) return <div className="h-16 animate-pulse rounded-tlw-2xl bg-tlw-surface/70" />
  if (invoices.length === 0) return <p className="text-[13px] text-tlw-warm-gray">No invoices yet.</p>

  const STATUS_STYLES: Record<string, string> = {
    draft: 'bg-tlw-canvas text-tlw-warm-gray',
    approved: 'bg-blue-50 text-blue-700',
    sent: 'bg-amber-50 text-amber-700',
    paid: 'bg-green-50 text-green-700',
    overdue: 'bg-red-50 text-red-700',
    failed: 'bg-red-100 text-red-800',
    void: 'bg-tlw-canvas text-tlw-warm-gray',
  }

  return (
    <div className="divide-y divide-tlw-warm-gray/10 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
      {invoices.map((inv: any) => (
        <Link
          key={inv.id}
          href={`/business-center/invoices/${inv.id}`}
          className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-tlw-canvas"
        >
          <p className="text-[13px] font-medium text-tlw-navy-deep">
            {inv.period_end
              ? new Date(inv.period_end + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              : 'No period'}
          </p>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[inv.status] ?? ''}`}>
              {inv.status}
            </span>
            <span className="text-[13px] font-medium text-tlw-navy-deep">
              {(inv.total ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showAddCoachee, setShowAddCoachee] = useState(false)
  const [showAddEngagement, setShowAddEngagement] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`/api/billing/accounts/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setAccount(d.account))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  function engagementCoacheeName(eng: Engagement): string {
    const coachee = account?.coachees.find((c) => c.id === eng.coachee_id)
    return coachee?.clients?.name ?? '—'
  }

  function engagementSummary(eng: Engagement): string {
    if (eng.billing_mode === 'arrears') return `${money(eng.rate_hourly)}/hr`
    if (eng.billing_mode === 'subscription') return `${money(eng.monthly_amount)}/mo`
    if (eng.billing_mode === 'per_engagement') return `${money(eng.engagement_total)} total · ${eng.installment_count ?? 1} installment${(eng.installment_count ?? 1) > 1 ? 's' : ''}`
    return ''
  }

  async function toggleEngagementStatus(eng: Engagement) {
    const nextStatus = eng.status === 'active' ? 'paused' : 'active'
    const res = await fetch(`/api/billing/engagements/${eng.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })
    if (res.ok) {
      setAccount((cur) => cur ? {
        ...cur,
        engagements: cur.engagements.map((e) => e.id === eng.id ? { ...e, status: nextStatus } : e),
      } : cur)
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb="Business Center / Accounts"
        title={account?.name ?? 'Account'}
        subtitle={account?.billing_email}
        actions={
          <Link
            href="/business-center/accounts"
            className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
          >
            ← Accounts
          </Link>
        }
      />

      {loading && <div className="h-32 animate-pulse rounded-tlw-2xl bg-tlw-surface/70" />}
      {error && <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load account.</p>}

      {account && (
        <div className="space-y-8">

          {/* Coachees */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-tlw-warm-gray">Coachees</h2>
              <button
                onClick={() => setShowAddCoachee(true)}
                className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1 text-[12px] font-medium text-tlw-espresso transition-colors hover:bg-tlw-canvas"
              >
                + Add coachee
              </button>
            </div>
            {account.coachees.length === 0 ? (
              <div className="rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 py-6 text-center">
                <p className="text-[13px] text-tlw-warm-gray">No coachees yet — add a client from your roster.</p>
              </div>
            ) : (
              <div className="divide-y divide-tlw-warm-gray/10 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
                {account.coachees.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div>
                      <p className="text-[13px] font-medium text-tlw-navy-deep">{c.clients?.name ?? '—'}</p>
                      {c.clients?.email && <p className="text-[12px] text-tlw-warm-gray">{c.clients.email}</p>}
                    </div>
                    <Link
                      href={`/clients/${c.client_id}`}
                      className="text-[12px] text-tlw-warm-gray hover:text-tlw-navy-deep hover:underline"
                    >
                      View client →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Engagements */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-tlw-warm-gray">Engagements</h2>
              {account.coachees.length > 0 && (
                <button
                  onClick={() => setShowAddEngagement(true)}
                  className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1 text-[12px] font-medium text-tlw-espresso transition-colors hover:bg-tlw-canvas"
                >
                  + New engagement
                </button>
              )}
            </div>
            {account.engagements.length === 0 ? (
              <div className="rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 py-6 text-center">
                <p className="text-[13px] text-tlw-warm-gray">
                  {account.coachees.length === 0
                    ? 'Add a coachee first, then create an engagement.'
                    : 'No engagements yet — create one to start billing.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-tlw-warm-gray/10 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
                {account.engagements.map((eng) => (
                  <div key={eng.id} className="flex items-start justify-between gap-4 px-5 py-4">
                    <div>
                      <p className="text-[14px] font-medium text-tlw-navy-deep">{engagementCoacheeName(eng)}</p>
                      <p className="text-[12px] text-tlw-warm-gray">
                        {MODE_LABEL[eng.billing_mode] ?? eng.billing_mode} · {engagementSummary(eng)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-tlw-warm-gray">
                        Owner: {eng.billing_owner}
                        {eng.billing_owner === 'CA' && ' — not included in billing runs'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[eng.status] ?? ''}`}>
                        {eng.status}
                      </span>
                      {eng.status !== 'ended' && (
                        <button
                          onClick={() => toggleEngagementStatus(eng)}
                          className="text-[11px] text-tlw-warm-gray hover:text-tlw-espresso hover:underline"
                        >
                          {eng.status === 'active' ? 'Pause' : 'Resume'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Invoices */}
          <section>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-tlw-warm-gray">Invoices</h2>
            <AccountInvoices accountId={id} />
          </section>

        </div>
      )}

      {showAddCoachee && account && (
        <AddCoacheeModal
          accountId={id}
          existingClientIds={account.coachees.map((c) => c.client_id)}
          onAdded={(coachee) => {
            setAccount((cur) => cur ? { ...cur, coachees: [...cur.coachees, coachee] } : cur)
            setShowAddCoachee(false)
          }}
          onClose={() => setShowAddCoachee(false)}
        />
      )}

      {showAddEngagement && account && (
        <AddEngagementModal
          accountId={id}
          coachees={account.coachees}
          onAdded={(eng) => {
            setAccount((cur) => cur ? { ...cur, engagements: [...cur.engagements, eng] } : cur)
            setShowAddEngagement(false)
          }}
          onClose={() => setShowAddEngagement(false)}
        />
      )}
    </>
  )
}
