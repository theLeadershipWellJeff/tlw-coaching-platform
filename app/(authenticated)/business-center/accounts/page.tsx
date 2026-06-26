'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/app/components/layout/PageHeader'
import type { BillingAccount } from '@/lib/billing/types'

function CreateAccountModal({ onCreated, onClose }: {
  onCreated: (account: BillingAccount) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'solo' | 'enterprise'>('solo')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
    onCreated(d.account)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-tlw-2xl bg-white shadow-xl">
        <div className="border-b border-tlw-warm-gray/15 px-6 py-4">
          <h2 className="text-[16px] font-semibold text-tlw-navy-deep">New billing account</h2>
          <p className="mt-0.5 text-[12px] text-tlw-warm-gray">An account is the payer — a solo client or an enterprise sponsor.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Account name</label>
            <input
              className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
              placeholder="e.g. Acme Corp or Sarah Johnson"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Type</label>
            <div className="flex gap-3">
              {(['solo', 'enterprise'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
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
            <p className="mt-1 text-[11px] text-tlw-warm-gray">
              {type === 'solo' ? 'One coachee — the payer and coachee are the same.' : 'Multiple coachees under one sponsoring organization.'}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Billing email</label>
            <input
              type="email"
              className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
              placeholder="invoices@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !email.trim()}
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

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<BillingAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    fetch('/api/billing/accounts?withSummary=1')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setAccounts(d.accounts ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <PageHeader
        breadcrumb="Business Center"
        title="Accounts"
        actions={
          <div className="flex items-center gap-2">
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

      {!loading && !error && accounts.length === 0 && (
        <div className="rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 py-12 text-center">
          <p className="text-[14px] font-medium text-tlw-navy-deep">No billing accounts yet</p>
          <p className="mt-1 text-[13px] text-tlw-warm-gray">
            Each account is a payer — a solo client or an enterprise sponsor with multiple coachees.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 rounded-tlw-lg bg-tlw-navy-deep px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich"
          >
            Create your first account
          </button>
        </div>
      )}

      {!loading && !error && accounts.length > 0 && (
        <div className="divide-y divide-tlw-warm-gray/10 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
          {accounts.map((acct: any) => (
            <Link
              key={acct.id}
              href={`/business-center/accounts/${acct.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-tlw-canvas"
            >
              <div>
                <p className="text-[14px] font-medium text-tlw-navy-deep">{acct.name}</p>
                <p className="text-[12px] text-tlw-warm-gray">{acct.billing_email}</p>
              </div>
              <div className="flex items-center gap-3">
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
          ))}
        </div>
      )}

      {showCreate && (
        <CreateAccountModal
          onCreated={(acct) => { setAccounts((cur) => [acct, ...cur]); setShowCreate(false) }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </>
  )
}
