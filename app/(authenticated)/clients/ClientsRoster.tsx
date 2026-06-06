'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { Client } from '@/lib/supabase/types'

const STATUSES = ['active', 'prospect', 'inactive'] as const

export function ClientsRoster() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/clients')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setClients(data.clients || [])
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
            {importing ? 'Importing…' : 'Import from Coach Accountable'}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-colors hover:bg-tlw-navy-rich/85"
          >
            + Add client
          </button>
        </div>
      </div>

      {importMsg && (
        <p className="text-[13px] text-tlw-warm-gray">{importMsg}</p>
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
                  <p className="font-medium text-tlw-navy-deep">{c.name}</p>
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
  const [form, setForm] = useState({
    name: '',
    email: '',
    title: '',
    company: '',
    status: 'active',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create')
      onCreated(data.client)
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  const field =
    'w-full rounded-tlw-lg border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none transition-colors focus:border-tlw-signal-orange'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tlw-navy-deep/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md space-y-4 rounded-tlw-2xl bg-tlw-surface p-6 shadow-2xl"
      >
        <h2 className="text-lg font-medium text-tlw-navy-deep">Add client</h2>

        <div className="space-y-3">
          <input
            autoFocus
            className={field}
            placeholder="Full name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className={field}
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <div className="flex gap-3">
            <input
              className={field}
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <input
              className={field}
              placeholder="Company"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
          </div>
          <select
            className={field}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-[13px] text-tlw-signal-orange">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-tlw-lg px-4 py-2 text-[13px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-colors hover:bg-tlw-navy-rich/85 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Add client'}
          </button>
        </div>
      </form>
    </div>
  )
}
