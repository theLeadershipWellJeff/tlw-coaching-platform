'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import {
  useCompactFetch,
  CompactSkeleton,
  CompactEmpty,
  CompactStatus,
} from '../CompactCard'

// ── Types ─────────────────────────────────────────────────────────────────────

type BillingAccount = { id: string; name: string; type: string; billing_email: string }

type Engagement = {
  id: string
  billing_mode: string
  billing_owner: string
  status: string
  rate_hourly: number | null
  monthly_amount: number | null
  engagement_total: number | null
  installment_count: number | null
}

type BillingData =
  | { linked: false; accounts: BillingAccount[] }
  | { linked: true; coacheeId: string; account: BillingAccount; engagements: Engagement[] }

type SessionEntry = {
  engagementId: string
  // Null = no session count set on the engagement (label + count, no bar).
  sessionCount: number | null
  sessionsUsed: number
  billingMode: string
  // Engagement type — "6-Month Engagement", "Monthly Subscription", …
  label: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

const MODE_LABEL: Record<string, string> = {
  arrears: 'Arrears (hourly)',
  subscription: 'Subscription',
  per_engagement: 'Per engagement',
}

function engSummary(e: Engagement): string {
  if (e.billing_mode === 'arrears' && e.rate_hourly) return `${money(e.rate_hourly)}/hr`
  if (e.billing_mode === 'subscription' && e.monthly_amount) return `${money(e.monthly_amount)}/mo`
  if (e.billing_mode === 'per_engagement' && e.engagement_total) return `${money(e.engagement_total)} total`
  return MODE_LABEL[e.billing_mode] ?? e.billing_mode
}

// ── Sessions progress bar ─────────────────────────────────────────────────────

function SessionsProgressBar({ clientId }: { clientId: string }) {
  const [sessions, setSessions] = useState<SessionEntry[] | null>(null)

  useEffect(() => {
    fetch(`/api/clients/${clientId}/billing/sessions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSessions(d.sessions ?? []))
      .catch(() => {})
  }, [clientId])

  if (!sessions || sessions.length === 0) return null

  return (
    <div className="mt-2 space-y-1.5">
      {sessions.map((s) => {
        const subscription = s.billingMode === 'subscription'
        const pct =
          s.sessionCount != null && s.sessionCount > 0
            ? Math.min(100, Math.round((s.sessionsUsed / s.sessionCount) * 100))
            : 0
        return (
          <div key={s.engagementId}>
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-medium text-tlw-espresso">{s.label}</span>
              <span className="shrink-0 text-[11px] text-tlw-warm-gray">
                {s.sessionCount != null
                  ? `${s.sessionsUsed} / ${s.sessionCount}${subscription ? ' this yr' : ''} · ${pct}%`
                  : `${s.sessionsUsed} session${s.sessionsUsed === 1 ? '' : 's'} ${subscription ? 'this year' : 'to date'}`}
              </span>
            </div>
            {s.sessionCount != null && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-tlw-warm-gray/20">
                <div
                  className="h-full rounded-full bg-tlw-navy-deep transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Compact ───────────────────────────────────────────────────────────────────

function BillingCompact({ clientId }: { clientId: string }) {
  const data = useCompactFetch<BillingData>(`/api/clients/${clientId}/billing`)
  if (!data) return <CompactSkeleton />
  if (!data.linked) return <CompactStatus value="No billing account" tone="missing" />
  const active = data.engagements.filter((e) => e.status === 'active')
  return (
    <CompactStatus
      value={data.account.name}
      tone="positive"
      sub={active.length > 0 ? active.map(engSummary).join(' · ') : 'No active engagement'}
    />
  )
}

// ── Link to account modal ─────────────────────────────────────────────────────

function LinkAccountModal({
  clientId,
  accounts,
  onLinked,
  onClose,
}: {
  clientId: string
  accounts: BillingAccount[]
  onLinked: () => void
  onClose: () => void
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!accountId) return
    setSaving(true)
    setError('')
    const res = await fetch(`/api/clients/${clientId}/billing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'link', accountId }),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Failed'); setSaving(false); return }
    onLinked()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-tlw-2xl bg-white shadow-xl">
        <div className="border-b border-tlw-warm-gray/15 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-tlw-navy-deep">Link to billing account</h2>
          <p className="mt-0.5 text-[12px] text-tlw-warm-gray">Assign this client to an existing billing account.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 px-6 py-5">
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
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">Cancel</button>
            <button
              type="submit"
              disabled={saving || !accountId}
              className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Linking…' : 'Link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Create account modal ──────────────────────────────────────────────────────

function CreateAccountModal({
  clientId,
  clientName,
  onCreated,
  onClose,
}: {
  clientId: string
  clientName: string
  onCreated: () => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'solo' | 'enterprise'>('solo')
  const [billingEmail, setBillingEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch(`/api/clients/${clientId}/billing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create-account', name, type, billing_email: billingEmail }),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Failed'); setSaving(false); return }
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-tlw-2xl bg-white shadow-xl">
        <div className="border-b border-tlw-warm-gray/15 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-tlw-navy-deep">Create billing account</h2>
          <p className="mt-0.5 text-[12px] text-tlw-warm-gray">{clientName} will be linked automatically.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Account name</label>
            <input
              className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
              placeholder="e.g. Vector, Mike Johnson"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Type</label>
            <div className="flex gap-3">
              {(['solo', 'enterprise'] as const).map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-tlw-espresso">
                  <input
                    type="radio"
                    name="type"
                    value={t}
                    checked={type === t}
                    onChange={() => setType(t)}
                    className="accent-tlw-navy-deep"
                  />
                  {t === 'solo' ? 'Solo (individual)' : 'Enterprise (company)'}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Billing email</label>
            <input
              type="email"
              className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
              placeholder="invoices@company.com"
              value={billingEmail}
              onChange={(e) => setBillingEmail(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">Cancel</button>
            <button
              type="submit"
              disabled={saving || !name || !billingEmail}
              className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Standard / Expanded view ──────────────────────────────────────────────────

function BillingFull({ clientId }: { clientId: string }) {
  const { client } = useWorkspaceCtx()
  const [data, setData] = useState<BillingData | null>(null)
  const [modal, setModal] = useState<'link' | 'create' | null>(null)

  function load() {
    fetch(`/api/clients/${clientId}/billing`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {})
  }

  useEffect(() => { load() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) {
    return (
      <div className="space-y-2 px-4 py-3">
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-tlw-warm-gray/20" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-tlw-warm-gray/15" />
      </div>
    )
  }

  if (!data.linked) {
    return (
      <div className="px-4 py-4">
        <p className="text-[13px] text-tlw-warm-gray">No billing account linked to this client yet.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.accounts.length > 0 && (
            <button
              onClick={() => setModal('link')}
              className="rounded-tlw-lg border border-tlw-navy-deep/30 px-3 py-1.5 text-[13px] font-medium text-tlw-navy-deep transition-colors hover:bg-tlw-navy-deep/5"
            >
              Link to existing account
            </button>
          )}
          <button
            onClick={() => setModal('create')}
            className="rounded-tlw-lg bg-tlw-navy-deep px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich"
          >
            Create billing account
          </button>
        </div>
        {data.accounts.length === 0 && (
          <p className="mt-2 text-[11px] text-tlw-warm-gray">
            Or go to{' '}
            <Link href="/business-center/accounts" className="underline hover:text-tlw-espresso">
              Business Center → Accounts
            </Link>{' '}
            to manage billing accounts.
          </p>
        )}

        {modal === 'link' && (
          <LinkAccountModal
            clientId={clientId}
            accounts={data.accounts}
            onLinked={() => { setModal(null); load() }}
            onClose={() => setModal(null)}
          />
        )}
        {modal === 'create' && (
          <CreateAccountModal
            clientId={clientId}
            clientName={client?.name ?? 'This client'}
            onCreated={() => { setModal(null); load() }}
            onClose={() => setModal(null)}
          />
        )}
      </div>
    )
  }

  const { account, engagements } = data
  const activeEngs = engagements.filter((e) => e.status === 'active')
  const pausedEngs = engagements.filter((e) => e.status === 'paused')

  return (
    <div className="divide-y divide-tlw-warm-gray/8">
      {/* Account row */}
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div>
          <Link
            href={`/business-center/accounts/${account.id}`}
            className="text-[13px] font-semibold text-tlw-navy-deep hover:underline"
          >
            {account.name}
          </Link>
          <p className="text-[12px] text-tlw-warm-gray">{account.billing_email}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
            Linked
          </span>
          <Link
            href={`/business-center/accounts/${account.id}`}
            className="text-[12px] text-tlw-warm-gray hover:text-tlw-espresso hover:underline"
          >
            Manage →
          </Link>
        </div>
      </div>

      {/* Engagements */}
      {engagements.length === 0 ? (
        <div className="px-4 py-3">
          <p className="text-[12px] text-tlw-warm-gray">No engagements set up yet.</p>
          <Link
            href={`/business-center/accounts/${account.id}`}
            className="mt-1 inline-block text-[12px] font-medium text-tlw-navy-deep hover:underline"
          >
            Add engagement →
          </Link>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-tlw-warm-gray">Engagements</p>
          {activeEngs.map((e) => (
            <div key={e.id} className="flex items-center justify-between text-[13px]">
              <span className="text-tlw-espresso">{MODE_LABEL[e.billing_mode] ?? e.billing_mode}</span>
              <span className="font-medium text-tlw-navy-deep">{engSummary(e)}</span>
            </div>
          ))}
          {pausedEngs.map((e) => (
            <div key={e.id} className="flex items-center justify-between text-[13px] opacity-50">
              <span className="text-tlw-espresso">{MODE_LABEL[e.billing_mode] ?? e.billing_mode} (paused)</span>
              <span className="font-medium text-tlw-navy-deep">{engSummary(e)}</span>
            </div>
          ))}
          {activeEngs.length === 0 && (
            <p className="text-[12px] text-amber-600">All engagements are paused — assembler will skip this client.</p>
          )}
          <SessionsProgressBar clientId={clientId} />
        </div>
      )}
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export function BillingBlock({ size }: { size: CardSize }) {
  const { clientId } = useWorkspaceCtx()
  if (size === 'compact') return <BillingCompact clientId={clientId} />
  return <BillingFull clientId={clientId} />
}
