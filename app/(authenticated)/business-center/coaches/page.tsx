'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/app/components/layout/PageHeader'

type Coach = {
  id: string
  name: string
  email: string
  role: 'coach' | 'supervisor'
  created_at: string
  timezone: string | null
  client_count: number
  account_count: number
  is_me: boolean
}

const ROLE_STYLES: Record<string, string> = {
  coach: 'bg-tlw-canvas text-tlw-espresso',
  supervisor: 'bg-tlw-navy-deep/10 text-tlw-navy-deep',
}

function AddCoachModal({ onAdded, onClose }: { onAdded: (c: Coach) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'coach' | 'supervisor'>('coach')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/coaches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role }),
    })
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Failed'); setSaving(false); return }
    onAdded({ ...d.coach, client_count: 0, account_count: 0, is_me: false })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-tlw-2xl bg-white shadow-xl">
        <div className="border-b border-tlw-warm-gray/15 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-tlw-navy-deep">Add coach</h2>
          <p className="mt-0.5 text-[12px] text-tlw-warm-gray">Add a coach to your team roster.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Name</label>
            <input
              type="text"
              required
              placeholder="Dr. Jane Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Email</label>
            <input
              type="email"
              required
              placeholder="jane@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-tlw-espresso">Role</label>
            <div className="flex gap-2">
              {(['coach', 'supervisor'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 rounded-tlw-lg border px-3 py-2 text-[13px] font-medium capitalize transition-colors ${
                    role === r
                      ? 'border-tlw-navy-deep bg-tlw-navy-deep text-white'
                      : 'border-tlw-warm-gray/30 text-tlw-espresso hover:bg-tlw-canvas'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add coach'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CoachRow({ coach, onUpdated, onRemoved }: {
  coach: Coach
  onUpdated: (c: Coach) => void
  onRemoved: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(coach.name)
  const [role, setRole] = useState<'coach' | 'supervisor'>(coach.role)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/coaches/${coach.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role }),
    })
    const d = await res.json()
    setSaving(false)
    if (res.ok) { onUpdated({ ...coach, ...d.coach }); setEditing(false) }
  }

  async function remove() {
    setRemoving(true)
    const res = await fetch(`/api/coaches/${coach.id}`, { method: 'DELETE' })
    setRemoving(false)
    if (res.ok) onRemoved(coach.id)
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-medium text-tlw-navy-deep truncate">{coach.name}</p>
            {coach.is_me && (
              <span className="shrink-0 rounded-full bg-tlw-orange/15 px-2 py-0.5 text-[10px] font-semibold text-tlw-orange">YOU</span>
            )}
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${ROLE_STYLES[coach.role] ?? ''}`}>
              {coach.role}
            </span>
          </div>
          <p className="text-[12px] text-tlw-warm-gray">{coach.email}</p>
          <p className="mt-0.5 text-[11px] text-tlw-warm-gray">
            {coach.client_count} client{coach.client_count !== 1 ? 's' : ''}
            {' · '}
            {coach.account_count} active account{coach.account_count !== 1 ? 's' : ''}
            {coach.timezone && ` · ${coach.timezone}`}
          </p>
        </div>
        {!coach.is_me && (
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => { setEditing((o) => !o); setConfirmRemove(false) }} className="text-[11px] font-medium text-tlw-navy-deep hover:underline">
              {editing ? 'Cancel' : 'Edit'}
            </button>
            {!confirmRemove ? (
              <button onClick={() => setConfirmRemove(true)} className="text-[11px] text-tlw-warm-gray hover:text-red-600 hover:underline">
                Remove
              </button>
            ) : (
              <span className="flex items-center gap-1">
                <button onClick={remove} disabled={removing} className="text-[11px] font-medium text-red-600 hover:underline disabled:opacity-50">
                  {removing ? 'Removing…' : 'Confirm'}
                </button>
                <button onClick={() => setConfirmRemove(false)} className="text-[11px] text-tlw-warm-gray hover:underline">cancel</button>
              </span>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-3 rounded-tlw-lg border border-tlw-warm-gray/20 bg-tlw-canvas p-4">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-tlw-espresso">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-tlw-lg border border-tlw-warm-gray/30 bg-white px-3 py-1.5 text-[13px] text-tlw-espresso focus:outline-none focus:ring-1 focus:ring-tlw-navy-deep/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-tlw-espresso">Role</label>
            <div className="flex gap-2">
              {(['coach', 'supervisor'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 rounded-tlw-lg border px-2 py-1 text-[12px] font-medium capitalize transition-colors ${
                    role === r
                      ? 'border-tlw-navy-deep bg-tlw-navy-deep text-white'
                      : 'border-tlw-warm-gray/30 text-tlw-espresso hover:bg-white'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={save} disabled={saving} className="rounded-tlw-lg bg-tlw-navy-deep px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CoachesPage() {
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    fetch('/api/coaches')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCoaches(d.coaches ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const myCoaches = coaches.filter((c) => !c.is_me)
  const me = coaches.find((c) => c.is_me)

  return (
    <>
      <PageHeader
        breadcrumb="Business Center"
        title="My Team"
        subtitle="Coaches working under theLeadershipWell"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/business-center/accounts"
              className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
            >
              ← Accounts
            </Link>
            <button
              onClick={() => setShowAdd(true)}
              className="rounded-tlw-lg bg-tlw-navy-deep px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-deep/90"
            >
              + Add coach
            </button>
          </div>
        }
      />

      {loading && <div className="h-32 animate-pulse rounded-tlw-2xl bg-tlw-surface/70" />}

      {!loading && (
        <div className="space-y-8">

          {/* My coaches */}
          <section>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-tlw-warm-gray">
              Coaches on my team {myCoaches.length > 0 && `(${myCoaches.length})`}
            </h2>
            {myCoaches.length === 0 ? (
              <div className="rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 py-8 text-center">
                <p className="text-[13px] text-tlw-warm-gray">No coaches added yet.</p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="mt-3 text-[13px] font-medium text-tlw-navy-deep hover:underline"
                >
                  Add your first coach →
                </button>
              </div>
            ) : (
              <div className="divide-y divide-tlw-warm-gray/10 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
                {myCoaches.map((c) => (
                  <CoachRow
                    key={c.id}
                    coach={c}
                    onUpdated={(updated) => setCoaches((all) => all.map((x) => x.id === updated.id ? updated : x))}
                    onRemoved={(id) => setCoaches((all) => all.filter((x) => x.id !== id))}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Me */}
          {me && (
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-tlw-warm-gray">My account</h2>
              <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
                <CoachRow
                  coach={me}
                  onUpdated={(updated) => setCoaches((all) => all.map((x) => x.id === updated.id ? updated : x))}
                  onRemoved={() => {}}
                />
              </div>
            </section>
          )}
        </div>
      )}

      {showAdd && (
        <AddCoachModal
          onAdded={(c) => { setCoaches((all) => [...all, c]); setShowAdd(false) }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </>
  )
}
