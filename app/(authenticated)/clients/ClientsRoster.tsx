'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Client } from '@/lib/supabase/types'

const STATUSES = ['active', 'prospect', 'inactive'] as const

export function ClientsRoster() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [pendingAgreements, setPendingAgreements] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  // After creating a client, offer to issue the coaching agreement now.
  const [justCreated, setJustCreated] = useState<{ id: string; name: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [importingNotes, setImportingNotes] = useState(false)
  const [notesMsg, setNotesMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/clients')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setClients(data.clients || [])
      setPendingAgreements(data.pendingAgreements || {})
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function importFromCA() {
    if (importing) return
    setImporting(true)
    setImportMsg('')
    try {
      const res = await fetch('/api/clients/import', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setImportMsg(
        data.imported > 0
          ? `Imported ${data.imported} new ${data.imported === 1 ? 'client' : 'clients'} (${data.skipped} already here).`
          : `Up to date — all ${data.total} Coach Accountable clients are already imported.`
      )
      if (data.imported > 0) await load()
    } catch (e: any) {
      setImportMsg(e.message)
    }
    setImporting(false)
  }

  // Port Coach Accountable session notes for every active client. Runs one
  // request per client so each stays within limits, with live progress; it's
  // idempotent, so re-running only pulls in anything new.
  async function importNotesFromCA() {
    if (importingNotes) return
    const active = clients.filter((c) => c.status === 'active')
    if (active.length === 0) {
      setNotesMsg('No active clients to import notes for.')
      return
    }
    setImportingNotes(true)
    setNotesMsg('')
    let imported = 0
    let done = 0
    for (const c of active) {
      setNotesMsg(`Importing notes… ${done + 1} of ${active.length} (${c.name})`)
      try {
        const res = await fetch(`/api/clients/${c.id}/import-notes`, { method: 'POST' })
        const data = await res.json()
        if (res.ok) imported += data.imported || 0
      } catch {
        /* keep going — re-running fills any gaps */
      }
      done++
    }
    setNotesMsg(
      `Done — imported ${imported} note${imported === 1 ? '' : 's'} across ${active.length} active client${
        active.length === 1 ? '' : 's'
      }.`
    )
    setImportingNotes(false)
  }

  const visible = clients.filter((c) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search clients…"
          className="w-full max-w-xs rounded-tlw-lg border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none transition-colors focus:border-tlw-signal-orange"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={importFromCA}
            disabled={importing}
            className="rounded-tlw-lg border border-tlw-warm-gray/30 px-4 py-2 text-[13px] font-medium text-tlw-espresso transition-colors hover:border-tlw-warm-gray/50 disabled:opacity-60"
          >
            {importing ? 'Importing…' : 'Import clients from CA'}
          </button>
          <button
            onClick={importNotesFromCA}
            disabled={importingNotes}
            className="rounded-tlw-lg border border-tlw-warm-gray/30 px-4 py-2 text-[13px] font-medium text-tlw-espresso transition-colors hover:border-tlw-warm-gray/50 disabled:opacity-60"
          >
            {importingNotes ? 'Importing notes…' : 'Import notes from CA'}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-colors hover:bg-tlw-navy-rich/85"
          >
            + Add client
          </button>
        </div>
      </div>

      {importMsg && <p className="text-[13px] text-tlw-warm-gray">{importMsg}</p>}
      {notesMsg && <p className="text-[13px] text-tlw-warm-gray">{notesMsg}</p>}

      {justCreated && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-tlw-xl border border-tlw-warm-gray/20 bg-tlw-surface p-4">
          <p className="text-[13px] text-tlw-espresso">
            Would you like to issue a coaching agreement to <span className="font-medium">{justCreated.name}</span> now?
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setJustCreated(null)}
              className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso"
            >
              Skip for now
            </button>
            <button
              onClick={() => router.push(`/clients/${justCreated.id}?issue=1`)}
              className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90"
            >
              Issue Agreement
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface/60"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-tlw-xl border border-tlw-warm-gray/20 bg-tlw-surface p-8 text-center">
          <p className="text-[13px] text-tlw-espresso">{error}</p>
          <button
            onClick={load}
            className="mt-3 text-[13px] font-medium text-tlw-signal-orange hover:underline"
          >
            Try again
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-8 text-center">
          <h2 className="mb-1 text-base font-medium text-tlw-navy-deep">
            {clients.length === 0 ? 'No clients yet' : 'No matches'}
          </h2>
          <p className="mb-4 max-w-sm text-[13px] text-tlw-warm-gray">
            {clients.length === 0
              ? 'Add your first client to start keeping notes in the app.'
              : 'Try a different search.'}
          </p>
          {clients.length === 0 && (
            <button
              onClick={() => setShowAdd(true)}
              className="text-[13px] font-medium text-tlw-signal-orange hover:underline"
            >
              Add a client
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className="group block rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-4 transition-all duration-tlw-base hover:-translate-y-0.5 hover:border-tlw-warm-gray/30 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium text-tlw-navy-deep">
                    {c.name}
                    {pendingAgreements[c.id] != null && pendingAgreements[c.id] > 7 && (
                      <span
                        title={`Agreement unsigned — sent ${pendingAgreements[c.id]} days ago`}
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ background: '#E8650A' }}
                      />
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-tlw-warm-gray">
                    {[c.title, c.company].filter(Boolean).join(' · ') || c.email || '—'}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${
                    c.status === 'active'
                      ? 'bg-tlw-navy-rich/10 text-tlw-navy-rich'
                      : 'bg-tlw-warm-gray/15 text-tlw-warm-gray'
                  }`}
                >
                  {c.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showAdd && (
        <AddClientModal
          onClose={() => setShowAdd(false)}
          onCreated={(c) => {
            setShowAdd(false)
            setClients((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))
            setJustCreated({ id: c.id, name: c.name })
          }}
        />
      )}
    </div>
  )
}

function AddClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (c: Client) => void
}) {
  const [step, setStep] = useState<'client' | 'engagement'>('client')
  const [createdClient, setCreatedClient] = useState<{ id: string; name: string; email: string } | null>(null)
  const [billingAccountId, setBillingAccountId] = useState<string | null>(null)
  const [coacheeId, setCoacheeId] = useState<string | null>(null)

  // Step 1: client info
  const [form, setForm] = useState({ name: '', email: '', title: '', company: '', status: 'active' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Step 2: engagement
  const [mode, setMode] = useState<'arrears' | 'subscription' | 'per_engagement'>('arrears')
  const [rateHourly, setRateHourly] = useState('')
  const [monthlyAmount, setMonthlyAmount] = useState('')
  const [billingDay, setBillingDay] = useState('1')
  const [engTotal, setEngTotal] = useState('')
  const [savingEng, setSavingEng] = useState(false)
  const [engError, setEngError] = useState('')

  async function submitClient(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      // 1. Create client
      const clientRes = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const clientData = await clientRes.json()
      if (!clientRes.ok) throw new Error(clientData.error || 'Failed to create client')
      const newClient = clientData.client

      // 2. Auto-create a solo billing account + coachee link (best-effort; requires email)
      if (form.email.trim()) {
        const acctRes = await fetch(`/api/clients/${newClient.id}/billing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create-account', name: form.name.trim(), type: 'solo', billing_email: form.email.trim() }),
        })
        if (acctRes.ok) {
          const acctData = await acctRes.json()
          setBillingAccountId(acctData.account?.id ?? null)
          setCoacheeId(acctData.coacheeId ?? null)
        }
      }

      setCreatedClient({ id: newClient.id, name: newClient.name, email: newClient.email ?? '' })
      onCreated(newClient)
      setStep('engagement')
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  async function submitEngagement(e: React.FormEvent) {
    e.preventDefault()
    if (!coacheeId || !billingAccountId || !createdClient) return
    setSavingEng(true)
    setEngError('')

    const body: Record<string, unknown> = { coachee_id: coacheeId, billing_mode: mode, billing_owner: 'TLW' }
    if (mode === 'arrears') body.rate_hourly = parseFloat(rateHourly)
    else if (mode === 'subscription') { body.monthly_amount = parseFloat(monthlyAmount); body.billing_day = parseInt(billingDay, 10) }
    else body.engagement_total = parseFloat(engTotal)

    const res = await fetch(`/api/billing/accounts/${billingAccountId}/engagements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const d = await res.json()
      setEngError(d.error ?? 'Failed to create engagement')
      setSavingEng(false)
      return
    }
    onClose()
  }

  const field = 'w-full rounded-tlw-lg border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none transition-colors focus:border-tlw-signal-orange'

  if (step === 'engagement') {
    const hasAccount = !!coacheeId && !!billingAccountId
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-tlw-navy-deep/40 p-4">
        <div className="w-full max-w-md rounded-tlw-2xl bg-tlw-surface shadow-2xl">
          <div className="border-b border-tlw-warm-gray/15 px-6 py-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-tlw-warm-gray">Step 2 of 2</span>
            </div>
            <h2 className="text-[16px] font-semibold text-tlw-navy-deep">
              Set up billing for {createdClient?.name}
            </h2>
            {hasAccount ? (
              <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
                A billing account was created automatically. Set up how you bill them — you can change this anytime on their account page.
              </p>
            ) : (
              <p className="mt-0.5 text-[12px] text-amber-600">
                No email was provided, so no billing account was auto-created. You can set this up later on their client page.
              </p>
            )}
          </div>

          {hasAccount ? (
            <form onSubmit={submitEngagement} className="space-y-4 px-6 py-5">
              {/* Billing mode */}
              <div>
                <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">How do you bill them?</label>
                <div className="flex flex-col gap-2">
                  {([
                    ['arrears', 'Hourly (billed from session notes)'],
                    ['subscription', 'Flat monthly retainer'],
                    ['per_engagement', 'Fixed total (installments)'],
                  ] as const).map(([m, label]) => (
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
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'arrears' && (
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Hourly rate (USD)</label>
                  <input
                    type="number" min="0" step="0.01" required autoFocus
                    placeholder="e.g. 500"
                    value={rateHourly}
                    onChange={(e) => setRateHourly(e.target.value)}
                    className={field}
                  />
                  <p className="mt-1 text-[11px] text-tlw-warm-gray">Billed in half-hour increments, 1-hour minimum.</p>
                </div>
              )}

              {mode === 'subscription' && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Monthly amount (USD)</label>
                    <input type="number" min="0" step="0.01" required placeholder="e.g. 1500" value={monthlyAmount} onChange={(e) => setMonthlyAmount(e.target.value)} className={field} />
                  </div>
                  <div className="w-28">
                    <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Billing day</label>
                    <input type="number" min="1" max="28" value={billingDay} onChange={(e) => setBillingDay(e.target.value)} className={field} />
                  </div>
                </div>
              )}

              {mode === 'per_engagement' && (
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Engagement total (USD)</label>
                  <input type="number" min="0" step="0.01" required placeholder="e.g. 6000" value={engTotal} onChange={(e) => setEngTotal(e.target.value)} className={field} />
                  <p className="mt-1 text-[11px] text-tlw-warm-gray">You can set installment dates on their account page.</p>
                </div>
              )}

              {engError && <p className="text-[12px] text-red-600">{engError}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
                  Skip for now
                </button>
                <button
                  type="submit"
                  disabled={savingEng}
                  className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-colors hover:bg-tlw-navy-rich/85 disabled:opacity-60"
                >
                  {savingEng ? 'Saving…' : 'Set up engagement'}
                </button>
              </div>
            </form>
          ) : (
            <div className="px-6 py-5">
              <div className="flex justify-end">
                <button onClick={onClose} className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tlw-navy-deep/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submitClient}
        className="w-full max-w-md rounded-tlw-2xl bg-tlw-surface shadow-2xl"
      >
        <div className="border-b border-tlw-warm-gray/15 px-6 py-4">
          <div className="mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-tlw-warm-gray">Step 1 of 2</span>
          </div>
          <h2 className="text-[16px] font-semibold text-tlw-navy-deep">Add client</h2>
          <p className="mt-0.5 text-[12px] text-tlw-warm-gray">After saving you&apos;ll set up billing. Add an email to enable billing.</p>
        </div>

        <div className="space-y-3 px-6 py-5">
          <input
            autoFocus
            className={field}
            placeholder="Full name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className={field}
            placeholder="Email (required for billing)"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <div className="flex gap-3">
            <input className={field} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input className={field} placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <select className={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
          </select>
        </div>

        {error && <p className="px-6 text-[13px] text-tlw-signal-orange">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-tlw-warm-gray/10 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-tlw-lg px-4 py-2 text-[13px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-colors hover:bg-tlw-navy-rich/85 disabled:opacity-60">
            {saving ? 'Saving…' : 'Next: set up billing →'}
          </button>
        </div>
      </form>
    </div>
  )
}
