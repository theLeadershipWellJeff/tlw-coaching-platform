'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/app/components/layout/PageHeader'
import type { BillingAccount } from '@/lib/billing/types'

type Client = { id: string; name: string; email: string | null; status: string }
type Coach = { id: string; name: string; email: string | null; client_type: string }

type AccountSummary = {
  id: string
  name: string
  type: string
  billing_email: string
  status: string
  coacheeCount: number
  activeEngagements: number
}

// ── Create Account Modal ──────────────────────────────────────────────────────

function CreateAccountModal({ onCreated, onClose }: {
  onCreated: (account: BillingAccount) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'solo' | 'enterprise'>('solo')
  const [email, setEmail] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [loadingClients, setLoadingClients] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      // Working clients only — same definition as the roster's Active tab. A
      // one-off for an inactive client can be created without linking a coachee.
      .then((d) =>
        setClients(
          ((d.clients ?? []) as Client[]).filter((c) => c.status !== 'inactive' && c.status !== 'archived')
        )
      )
      .catch(() => {})
      .finally(() => setLoadingClients(false))
  }, [])

  function toggleClient(id: string) {
    setSelectedClientIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    )
  }

  function selectSoloClient(id: string) {
    const client = clients.find((c) => c.id === id)
    setSelectedClientIds([id])
    if (client) {
      if (!name) setName(client.name)
      if (!email && client.email) setEmail(client.email)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    setSaving(true)
    setError('')

    const res = await fetch('/api/billing/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), type, billing_email: email.trim() }),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Failed to create account'); setSaving(false); return }
    const account: BillingAccount = d.account

    for (const clientId of selectedClientIds) {
      await fetch(`/api/billing/accounts/${account.id}/coachees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      })
    }

    onCreated(account)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-tlw-2xl bg-white shadow-xl">
        <div className="border-b border-tlw-warm-gray/15 px-6 py-4">
          <h2 className="text-[16px] font-semibold text-tlw-navy-deep">New billing account</h2>
          <p className="mt-0.5 text-[12px] text-tlw-warm-gray">An account is the payer — a solo client or an enterprise sponsor.</p>
        </div>
        <form onSubmit={submit} className="max-h-[80vh] overflow-y-auto">
          <div className="space-y-4 px-6 py-5">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Type</label>
              <div className="flex gap-3">
                {(['solo', 'enterprise'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setType(t); setSelectedClientIds([]) }}
                    className={`flex-1 rounded-tlw-lg border px-3 py-2 text-[13px] font-medium capitalize transition-colors ${
                      type === t
                        ? 'border-tlw-navy-deep bg-tlw-navy-deep text-white'
                        : 'border-tlw-warm-gray/30 text-tlw-espresso hover:bg-tlw-canvas'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">
                {type === 'solo' ? 'Client' : 'Clients'}
                <span className="ml-1 font-normal text-tlw-warm-gray">(optional)</span>
              </label>
              {loadingClients ? (
                <div className="h-10 animate-pulse rounded-tlw-lg bg-tlw-canvas" />
              ) : type === 'solo' ? (
                <select
                  className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                  value={selectedClientIds[0] ?? ''}
                  onChange={(e) => e.target.value ? selectSoloClient(e.target.value) : setSelectedClientIds([])}
                >
                  <option value="">Select a client (auto-fills name & email)…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ''}</option>
                  ))}
                </select>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas">
                  {clients.length === 0 ? (
                    <p className="px-3 py-2 text-[13px] text-tlw-warm-gray">No clients on your roster yet.</p>
                  ) : (
                    clients.map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-tlw-warm-gray/5">
                        <input
                          type="checkbox"
                          checked={selectedClientIds.includes(c.id)}
                          onChange={() => toggleClient(c.id)}
                          className="h-3.5 w-3.5 accent-tlw-navy-deep"
                        />
                        <span className="text-[13px] text-tlw-espresso">{c.name}</span>
                        {c.email && <span className="text-[12px] text-tlw-warm-gray">{c.email}</span>}
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Account name</label>
              <input
                className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                placeholder={type === 'solo' ? 'e.g. Sarah Johnson' : 'e.g. Vector, Acme Corp'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Billing email</label>
              <input
                type="email"
                className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
                placeholder={type === 'solo' ? 'client@example.com' : 'invoices@company.com'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-[12px] text-red-600">{error}</p>}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-tlw-warm-gray/10 px-6 py-4">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !email.trim()}
              className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Creating…' : selectedClientIds.length > 0
                ? `Create & link ${selectedClientIds.length} client${selectedClientIds.length > 1 ? 's' : ''}`
                : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Setup All Modal ───────────────────────────────────────────────────────────

function SetupAllModal({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{
    created: number
    skipped: number
    noEmail: number
    details: { name: string; status: string }[]
  } | null>(null)
  const [err, setErr] = useState('')

  async function run() {
    setRunning(true)
    setErr('')
    const res = await fetch('/api/billing/accounts/setup-all', { method: 'POST' })
    const d = await res.json()
    if (!res.ok) { setErr(d.error ?? 'Failed'); setRunning(false); return }
    setResult(d)
    setRunning(false)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-tlw-2xl bg-white shadow-xl">
        <div className="border-b border-tlw-warm-gray/15 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-tlw-navy-deep">Set up billing for all clients</h2>
          <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
            Creates a solo billing account for every client who doesn&apos;t have one yet. Safe to run more than once.
          </p>
        </div>
        <div className="px-6 py-5">
          {!result ? (
            <>
              {err && <p className="mb-3 text-[12px] text-red-600">{err}</p>}
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={onClose} className="px-3 py-1.5 text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">Cancel</button>
                <button
                  onClick={run}
                  disabled={running}
                  className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
                >
                  {running ? 'Setting up…' : 'Set up all clients'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 space-y-1">
                {result.created > 0 && (
                  <p className="text-[13px] text-emerald-700">✓ {result.created} account{result.created > 1 ? 's' : ''} created</p>
                )}
                {result.skipped > 0 && (
                  <p className="text-[13px] text-tlw-warm-gray">— {result.skipped} already had an account</p>
                )}
                {result.noEmail > 0 && (
                  <p className="text-[13px] text-amber-700">⚠ {result.noEmail} skipped — no email on file</p>
                )}
              </div>
              <div className="flex justify-end">
                <button onClick={onClose} className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-1.5 text-[13px] font-medium text-white">
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Account row ───────────────────────────────────────────────────────────────

function AccountRow({ acct }: { acct: AccountSummary }) {
  return (
    <Link
      href={`/business-center/accounts/${acct.id}`}
      className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-tlw-canvas"
    >
      <div>
        <p className="text-[14px] font-medium text-tlw-navy-deep">{acct.name}</p>
        <p className="text-[12px] text-tlw-warm-gray">{acct.billing_email}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[12px] text-tlw-warm-gray">
          {acct.coacheeCount} coachee{acct.coacheeCount !== 1 ? 's' : ''}
        </span>
        {acct.activeEngagements > 0 && (
          <span className="text-[12px] text-tlw-warm-gray">
            {acct.activeEngagements} engagement{acct.activeEngagements > 1 ? 's' : ''}
          </span>
        )}
        <span className="shrink-0 rounded-full bg-tlw-canvas px-2 py-0.5 text-[11px] font-medium capitalize text-tlw-warm-gray">
          {acct.type}
        </span>
      </div>
    </Link>
  )
}

// ── Closed account row ────────────────────────────────────────────────────────

function ClosedAccountRow({ acct, onReopen }: { acct: AccountSummary; onReopen: () => void }) {
  const [reopening, setReopening] = useState(false)

  async function reopen() {
    setReopening(true)
    await fetch(`/api/billing/accounts/${acct.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', closed_at: null }),
    })
    setReopening(false)
    onReopen()
  }

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <div>
        <p className="text-[13px] font-medium text-tlw-warm-gray">{acct.name}</p>
        <p className="text-[12px] text-tlw-warm-gray/70">{acct.billing_email}</p>
      </div>
      <button
        onClick={reopen}
        disabled={reopening}
        className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1 text-[12px] font-medium text-tlw-espresso transition-colors hover:bg-tlw-canvas disabled:opacity-50"
      >
        {reopening ? 'Reopening…' : 'Reopen'}
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const [activeAccounts, setActiveAccounts] = useState<AccountSummary[]>([])
  const [closedAccounts, setClosedAccounts] = useState<AccountSummary[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showSetupAll, setShowSetupAll] = useState(false)
  const [closedOpen, setClosedOpen] = useState(false)

  async function loadAccounts() {
    setLoading(true)
    try {
      const [activeRes, closedRes, coachesRes] = await Promise.all([
        fetch('/api/billing/accounts?withSummary=1&status=active'),
        fetch('/api/billing/accounts?withSummary=1&status=closed'),
        fetch('/api/clients?type=coach'),
      ])
      if (!activeRes.ok || !closedRes.ok) throw new Error()
      const [activeData, closedData, coachesData] = await Promise.all([activeRes.json(), closedRes.json(), coachesRes.ok ? coachesRes.json() : { clients: [] }])
      setActiveAccounts(activeData.accounts ?? [])
      setClosedAccounts(closedData.accounts ?? [])
      setCoaches(coachesData.clients ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAccounts() }, [])

  const enterpriseAccounts = activeAccounts.filter((a) => a.type === 'enterprise')
  const soloAccounts = activeAccounts.filter((a) => a.type === 'solo')

  return (
    <>
      <PageHeader
        breadcrumb="Business Center"
        title="Accounts"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSetupAll(true)}
              className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
            >
              Set up all clients
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-tlw-lg bg-tlw-navy-deep px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich"
            >
              + New account
            </button>
            <Link
              href="/business-center"
              className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
            >
              ← Back
            </Link>
          </div>
        }
      />

      {loading && <div className="h-24 animate-pulse rounded-tlw-2xl bg-tlw-surface/70" />}
      {error && <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load accounts.</p>}

      {!loading && !error && activeAccounts.length === 0 && closedAccounts.length === 0 && (
        <div className="rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-tlw-navy-deep">No billing accounts yet</p>
          <p className="mt-1 text-[13px] text-tlw-warm-gray">
            Each account is a payer — a solo client or an enterprise sponsor with multiple coachees.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              onClick={() => setShowSetupAll(true)}
              className="rounded-tlw-lg border border-tlw-navy-deep/30 px-4 py-2 text-[13px] font-medium text-tlw-navy-deep transition-colors hover:bg-tlw-navy-deep/5"
            >
              Set up all clients at once
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich"
            >
              Create manually
            </button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-8">

          {/* Enterprise section */}
          {enterpriseAccounts.length > 0 && (
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-tlw-warm-gray">Enterprise</h2>
              <div className="divide-y divide-tlw-warm-gray/10 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
                {enterpriseAccounts.map((acct) => <AccountRow key={acct.id} acct={acct} />)}
              </div>
            </section>
          )}

          {/* Active Clients (solo) section */}
          {soloAccounts.length > 0 && (
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-tlw-warm-gray">Active Clients</h2>
              <div className="divide-y divide-tlw-warm-gray/10 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
                {soloAccounts.map((acct) => <AccountRow key={acct.id} acct={acct} />)}
              </div>
            </section>
          )}

          {/* Coaches section */}
          {coaches.length > 0 && (
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-tlw-warm-gray">Coaches</h2>
              <div className="divide-y divide-tlw-warm-gray/10 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
                {coaches.map((coach) => (
                  <Link
                    key={coach.id}
                    href="/business-center/coaches"
                    className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-tlw-canvas"
                  >
                    <div>
                      <p className="text-[14px] font-medium text-tlw-navy-deep">{coach.name}</p>
                      <p className="text-[12px] text-tlw-warm-gray">{coach.email}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-tlw-canvas px-2 py-0.5 text-[11px] font-medium capitalize text-tlw-warm-gray">
                      Coach
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Closed section */}
          {closedAccounts.length > 0 && (
            <section>
              <button
                onClick={() => setClosedOpen((o) => !o)}
                className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-tlw-warm-gray hover:text-tlw-espresso"
              >
                <span>Closed ({closedAccounts.length})</span>
                <span className="text-[11px] normal-case font-normal">{closedOpen ? '▲ hide' : '▼ show'}</span>
              </button>
              {closedOpen && (
                <div className="divide-y divide-tlw-warm-gray/10 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface/60">
                  {closedAccounts.map((acct) => (
                    <ClosedAccountRow key={acct.id} acct={acct} onReopen={loadAccounts} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {showCreate && (
        <CreateAccountModal
          onCreated={() => { loadAccounts(); setShowCreate(false) }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {showSetupAll && (
        <SetupAllModal
          onDone={loadAccounts}
          onClose={() => setShowSetupAll(false)}
        />
      )}
    </>
  )
}
