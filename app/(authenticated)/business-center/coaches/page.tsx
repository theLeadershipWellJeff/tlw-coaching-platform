'use client'
/**
 * Admin Command Center (supervisor-only). One place to see every coach on the
 * platform — account state, usage, plan (beta/free/paying), coach-subscription
 * billing — and to drill into each coach's clients: portal adoption, resend
 * portal invites, clear lockouts. All data comes from the supervisor-gated
 * /api/coaches* routes; a regular coach sees the access notice below.
 */
import { useEffect, useState } from 'react'
import { PageHeader } from '@/app/components/layout/PageHeader'
import { CoachClientsPanel } from './CoachClientsPanel'

type CoachUsage = {
  transcript_count: number
  report_count: number
  note_count: number
  email_count: number
  appointment_count: number
  nudge_sent_count: number
  last_active_at: string | null
}

type Coach = {
  id: string
  name: string
  email: string
  role: 'coach' | 'supervisor'
  created_at: string
  timezone: string | null
  client_count: number
  account_count: number
  plan: 'beta' | 'free' | 'paying'
  plan_note: string | null
  subscription_status: string | null
  has_subscription: boolean
  portal_invited_count: number
  portal_active_count: number
  has_signed_in: boolean
  usage: CoachUsage
  is_me: boolean
}

const EMPTY_USAGE: CoachUsage = {
  transcript_count: 0,
  report_count: 0,
  note_count: 0,
  email_count: 0,
  appointment_count: 0,
  nudge_sent_count: 0,
  last_active_at: null,
}

/** "Aug 14", or "Aug 14, 2025" when not this year. */
function shortDate(ts: string): string {
  const d = new Date(ts)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** Relative "last active" label: today / yesterday / Nd ago / a date. */
function lastActiveLabel(ts: string | null): string {
  if (!ts) return 'no activity yet'
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000)
  if (days <= 0) return 'active today'
  if (days === 1) return 'active yesterday'
  if (days < 14) return `active ${days}d ago`
  return `last active ${shortDate(ts)}`
}

const ROLE_STYLES: Record<string, string> = {
  coach: 'bg-tlw-canvas text-tlw-espresso',
  supervisor: 'bg-tlw-navy-deep/10 text-tlw-navy-deep',
}

const PLAN_STYLES: Record<string, string> = {
  beta: 'bg-violet-100 text-violet-700',
  free: 'bg-tlw-canvas text-tlw-warm-gray',
  paying: 'bg-emerald-100 text-emerald-700',
}

const PLANS = ['beta', 'free', 'paying'] as const

// ── Firm pulse ────────────────────────────────────────────────────────────────

function PulseStat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface px-4 py-3">
      <p className="text-[20px] font-semibold tabular-nums text-tlw-navy-deep">{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wider text-tlw-warm-gray">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-tlw-warm-gray">{sub}</p>}
    </div>
  )
}

function FirmPulse({ coaches }: { coaches: Coach[] }) {
  const open = coaches.filter((c) => c.has_signed_in).length
  const pending = coaches.length - open
  const clients = coaches.reduce((s, c) => s + c.client_count, 0)
  const invited = coaches.reduce((s, c) => s + c.portal_invited_count, 0)
  const active = coaches.reduce((s, c) => s + c.portal_active_count, 0)
  const paying = coaches.filter((c) => c.plan === 'paying').length
  const beta = coaches.filter((c) => c.plan === 'beta').length
  const free = coaches.filter((c) => c.plan === 'free').length

  return (
    <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <PulseStat
        value={String(coaches.length)}
        label="Coaches"
        sub={pending > 0 ? `${open} open · ${pending} awaiting sign-in` : 'all signed in'}
      />
      <PulseStat value={String(clients)} label="Clients" sub="across all coaches" />
      <PulseStat
        value={`${active}/${clients || 0}`}
        label="In portal"
        sub={`${invited} invited · ${active} active`}
      />
      <PulseStat
        value={String(paying)}
        label="Paying"
        sub={`${beta} beta · ${free} free`}
      />
    </div>
  )
}

// ── Plan chip + editor ────────────────────────────────────────────────────────

function PlanChip({ coach, onUpdated }: { coach: Coach; onUpdated: (c: Coach) => void }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(coach.plan_note ?? '')
  const [saving, setSaving] = useState(false)

  async function save(plan: Coach['plan']) {
    setSaving(true)
    const res = await fetch(`/api/coaches/${coach.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, plan_note: note }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) {
      onUpdated({ ...coach, plan: d.coach.plan, plan_note: d.coach.plan_note })
      setOpen(false)
    }
  }

  return (
    <span className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={coach.plan_note ?? 'Set plan'}
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PLAN_STYLES[coach.plan] ?? PLAN_STYLES.free}`}
      >
        {coach.plan}
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-20 w-56 rounded-tlw-lg border border-tlw-warm-gray/25 bg-white p-3 shadow-lg">
          <div className="flex gap-1.5">
            {PLANS.map((p) => (
              <button
                key={p}
                onClick={() => save(p)}
                disabled={saving}
                className={`flex-1 rounded-tlw-md border px-2 py-1 text-[11px] font-medium capitalize transition-colors disabled:opacity-50 ${
                  coach.plan === p
                    ? 'border-tlw-navy-deep bg-tlw-navy-deep text-white'
                    : 'border-tlw-warm-gray/30 text-tlw-espresso hover:bg-tlw-canvas'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Note (e.g. comped through Q4)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(coach.plan) }}
            className="mt-2 w-full rounded-tlw-md border border-tlw-warm-gray/30 bg-tlw-canvas px-2 py-1 text-[11px] text-tlw-espresso focus:outline-none"
          />
          <p className="mt-1.5 text-[10px] leading-snug text-tlw-warm-gray">
            A live subscription sets this to paying automatically.
          </p>
        </div>
      )}
    </span>
  )
}

// ── Billing actions ───────────────────────────────────────────────────────────

function BillingActions({ coach }: { coach: Coach }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)

  const live = coach.has_subscription &&
    ['active', 'trialing', 'past_due'].includes(coach.subscription_status ?? '')

  async function sendBillingLink() {
    setBusy(true)
    setNote(null)
    const res = await fetch(`/api/coaches/${coach.id}/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: true }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) {
      setCheckoutUrl(d.url ?? null)
      setNote({ ok: true, text: d.emailed ? `Billing link emailed to ${coach.email}` : 'Link created (email not sent)' })
    } else {
      setNote({ ok: false, text: d.error ?? 'Could not create billing link' })
    }
  }

  async function openStripePortal() {
    setBusy(true)
    setNote(null)
    const res = await fetch(`/api/coaches/${coach.id}/billing/portal`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok && d.url) window.open(d.url, '_blank', 'noopener')
    else setNote({ ok: false, text: d.error ?? 'Could not open the billing portal' })
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {coach.subscription_status && (
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
            coach.subscription_status === 'active' || coach.subscription_status === 'trialing'
              ? 'bg-emerald-100 text-emerald-700'
              : coach.subscription_status === 'past_due'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-tlw-canvas text-tlw-warm-gray'
          }`}
        >
          Subscription · {coach.subscription_status.replace('_', ' ')}
        </span>
      )}
      {!live && (
        <button
          onClick={sendBillingLink}
          disabled={busy}
          className="text-[11px] font-medium text-tlw-navy-deep hover:underline disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Send billing link'}
        </button>
      )}
      {coach.has_subscription && (
        <button
          onClick={openStripePortal}
          disabled={busy}
          className="text-[11px] font-medium text-tlw-navy-deep hover:underline disabled:opacity-50"
        >
          Stripe billing portal
        </button>
      )}
      {note && (
        <span className={`text-[11px] ${note.ok ? 'text-emerald-700' : 'text-red-600'}`}>{note.text}</span>
      )}
      {checkoutUrl && (
        <button
          onClick={() => navigator.clipboard?.writeText(checkoutUrl)}
          className="text-[11px] text-tlw-warm-gray hover:underline"
        >
          Copy link
        </button>
      )}
    </div>
  )
}

// ── Add coach ─────────────────────────────────────────────────────────────────

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
    onAdded({
      ...d.coach,
      client_count: 0,
      account_count: 0,
      plan: d.coach.plan ?? 'beta',
      plan_note: d.coach.plan_note ?? null,
      subscription_status: null,
      has_subscription: false,
      portal_invited_count: 0,
      portal_active_count: 0,
      has_signed_in: false,
      usage: EMPTY_USAGE,
      is_me: false,
    })
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

// ── Coach row ─────────────────────────────────────────────────────────────────

function CoachRow({ coach, onUpdated, onRemoved }: {
  coach: Coach
  onUpdated: (c: Coach) => void
  onRemoved: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [showClients, setShowClients] = useState(false)
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
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-medium text-tlw-navy-deep truncate">{coach.name}</p>
            {coach.is_me && (
              <span className="shrink-0 rounded-full bg-tlw-orange/15 px-2 py-0.5 text-[10px] font-semibold text-tlw-orange">YOU</span>
            )}
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${ROLE_STYLES[coach.role] ?? ''}`}>
              {coach.role}
            </span>
            <PlanChip coach={coach} onUpdated={onUpdated} />
            {!coach.has_signed_in && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                HASN&apos;T SIGNED IN YET
              </span>
            )}
          </div>
          <p className="text-[12px] text-tlw-warm-gray">{coach.email}</p>
          <p className="mt-0.5 text-[11px] text-tlw-warm-gray">
            Joined {shortDate(coach.created_at)}
            {' · '}
            {coach.has_signed_in ? lastActiveLabel(coach.usage.last_active_at) : 'awaiting first sign-in'}
            {coach.timezone && ` · ${coach.timezone}`}
            {coach.plan_note && ` · ${coach.plan_note}`}
          </p>
          <BillingActions coach={coach} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setShowClients((o) => !o)}
            className="text-[11px] font-medium text-tlw-navy-deep hover:underline"
          >
            {showClients ? 'Hide clients' : `Clients (${coach.client_count})`}
          </button>
          {!coach.is_me && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Usage rollup — how much this coach is actually using the platform. */}
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-9">
        {[
          { label: 'Clients', value: coach.client_count },
          { label: 'Portal', value: `${coach.portal_active_count}/${coach.client_count}` },
          { label: 'Accounts', value: coach.account_count },
          { label: 'Transcripts', value: coach.usage.transcript_count },
          { label: 'Scorecards', value: coach.usage.report_count },
          { label: 'Notes', value: coach.usage.note_count },
          { label: 'Emails', value: coach.usage.email_count },
          { label: 'Sessions', value: coach.usage.appointment_count },
          { label: 'Nudges', value: coach.usage.nudge_sent_count },
        ].map((s) => (
          <div key={s.label} className="rounded-tlw-lg bg-tlw-canvas px-2 py-1.5 text-center">
            <p className="text-[14px] font-semibold tabular-nums text-tlw-navy-deep">{s.value}</p>
            <p className="text-[10px] text-tlw-warm-gray">{s.label}</p>
          </div>
        ))}
      </div>

      {showClients && <CoachClientsPanel coachId={coach.id} />}

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CommandCenterPage() {
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    fetch('/api/coaches')
      .then((r) => {
        if (r.status === 403) { setForbidden(true); return Promise.reject() }
        return r.ok ? r.json() : Promise.reject()
      })
      .then((d) => setCoaches(d.coaches ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // A returning ?billing=success from Stripe Checkout — the webhook does the
  // real state change; this is just a friendly banner. Read in an effect so
  // server and first client render agree (no hydration mismatch).
  const [billingReturn, setBillingReturn] = useState<string | null>(null)
  useEffect(() => {
    setBillingReturn(new URLSearchParams(window.location.search).get('billing'))
  }, [])

  // Coach management is supervisor-only (the API enforces it) — show a clear
  // notice instead of a misleading empty roster + an Add button that would fail.
  if (forbidden) {
    return (
      <>
        <PageHeader
          backHref="/business-center/accounts"
          backLabel="Accounts"
          title="Command Center"
          subtitle="Coaches, plans, and client portal adoption across the platform"
        />
        <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface px-6 py-10 text-center">
          <p className="text-[14px] font-medium text-tlw-navy-deep">Supervisor access required</p>
          <p className="mt-1 text-[13px] text-tlw-warm-gray">
            The Command Center is limited to supervisors. Ask your practice lead if you need access.
          </p>
        </div>
      </>
    )
  }

  const myCoaches = coaches.filter((c) => !c.is_me)
  const me = coaches.find((c) => c.is_me)

  return (
    <>
      <PageHeader
        backHref="/business-center/accounts"
        backLabel="Accounts"
        title="Command Center"
        subtitle="Coaches, plans, and client portal adoption across the platform"
        actions={
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-tlw-lg bg-tlw-navy-deep px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-deep/90"
          >
            + Add coach
          </button>
        }
      />

      {billingReturn === 'success' && (
        <div className="mb-6 rounded-tlw-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          Billing setup completed — the subscription will show here as soon as Stripe confirms it.
        </div>
      )}

      {loading && <div className="h-32 animate-pulse rounded-tlw-2xl bg-tlw-surface/70" />}

      {!loading && (
        <div className="space-y-8">
          <FirmPulse coaches={coaches} />

          {/* Coaches */}
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
