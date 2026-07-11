'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Client } from '@/lib/supabase/types'
import { formatWhenShort } from '@/lib/datetime'
import { BulkEmailModal } from './BulkEmailModal'
import { EditClientModal } from './[id]/EditClientModal'

const STATUSES = ['active', 'prospect', 'inactive'] as const

type NextAppointment = { scheduled_at: string; duration_minutes: number }
// From lib/billing/engagement-progress.ts: label = engagement type ("6-Month
// Engagement" / "Monthly Subscription" / …); a subscription's used/total is
// sessions this calendar year vs. sessions per year; total null = no bar.
type EngagementProgress = { label: string; mode: string; used: number; total: number | null }

type RosterView = 'active' | 'inactive' | 'archived'

const VIEW_LABELS: Record<RosterView, string> = {
  active: 'Active',
  inactive: 'Inactive',
  archived: 'Archived',
}

export function ClientsRoster() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [teamClients, setTeamClients] = useState<Client[]>([])
  const [pendingAgreements, setPendingAgreements] = useState<Record<string, number>>({})
  const [nextAppointments, setNextAppointments] = useState<Record<string, NextAppointment>>({})
  const [engagementProgress, setEngagementProgress] = useState<Record<string, EngagementProgress>>({})
  const [coachTimezone, setCoachTimezone] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  // Client being edited via a card's settings gear (the same modal as the
  // workspace name card's gear).
  const [editing, setEditing] = useState<Client | null>(null)
  // After creating a client, offer to issue the coaching agreement now.
  const [justCreated, setJustCreated] = useState<{ id: string; name: string } | null>(null)
  // Active roster / the inactive list / the long-term archive. Clients keep all
  // their data — notes, transcripts, reports — whichever tab they live on.
  const [view, setView] = useState<RosterView>('active')
  const [showBulkEmail, setShowBulkEmail] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [res, teamRes] = await Promise.all([
        fetch('/api/clients'),
        fetch('/api/clients?type=coach'),
      ])
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setClients(data.clients || [])
      setPendingAgreements(data.pendingAgreements || {})
      setNextAppointments(data.nextAppointments || {})
      setEngagementProgress(data.engagementProgress || {})
      if (data.coachTimezone) setCoachTimezone(data.coachTimezone)
      if (teamRes.ok) {
        const teamData = await teamRes.json()
        setTeamClients(teamData.clients || [])
      }
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Split the roster by status: "inactive" is the resting list of finished
  // clients; "archived" is the permanent record of everyone ever coached,
  // hidden from both working lists; everything else (active, prospect) is the
  // working list.
  const viewOf = (c: Client): RosterView =>
    c.status === 'archived' ? 'archived' : c.status === 'inactive' ? 'inactive' : 'active'
  const inView = (c: Client) => viewOf(c) === view
  const counts: Record<RosterView, number> = { active: 0, inactive: 0, archived: 0 }
  for (const c of clients) counts[viewOf(c)]++

  // Move a client between the lists in place (Archive / Restore row buttons).
  const setStatus = useCallback(async (id: string, status: string) => {
    const prev = clients
    setClients((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)))
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setClients(prev) // roll back on failure
    }
  }, [clients])

  const visible = clients.filter(inView).filter((c) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q)
    )
  })
  const visibleTeam = teamClients.filter(inView)

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
          <div
            className="flex items-center rounded-tlw-lg border border-tlw-warm-gray/30 p-0.5"
            role="tablist"
            aria-label="Client list"
          >
            {(['active', 'inactive', 'archived'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`rounded-tlw-md px-4 py-1.5 text-[13px] font-medium transition-colors ${
                  view === v
                    ? 'bg-tlw-navy-rich text-tlw-cream'
                    : 'text-tlw-espresso hover:bg-tlw-canvas'
                }`}
              >
                {VIEW_LABELS[v]}{counts[v] > 0 ? ` (${counts[v]})` : ''}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowBulkEmail(true)}
            disabled={loading || clients.filter(inView).length === 0}
            className="rounded-tlw-lg border border-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-navy-rich transition-colors hover:bg-tlw-navy-rich/5 disabled:opacity-40"
          >
            ✉ Email all
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-colors hover:bg-tlw-navy-rich/85"
          >
            + Add client
          </button>
        </div>
      </div>

      {view === 'inactive' && (
        <p className="text-[12px] text-tlw-warm-gray">
          Finished clients live here with all their notes, transcripts, and reports intact. To move a
          client, open their page and set Status to inactive (gear icon) — or back to active to
          restore them to the working roster. Use Archive to move a client to the long-term record.
        </p>
      )}
      {view === 'archived' && (
        <p className="text-[12px] text-tlw-warm-gray">
          The permanent record of everyone you&apos;ve ever coached. Archived clients don&apos;t
          appear on the Active or Inactive lists, but all their data stays intact and their page
          is fully reachable. Restore moves a client back to the Inactive list.
        </p>
      )}

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
      ) : visible.length === 0 && visibleTeam.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-8 text-center">
          <h2 className="mb-1 text-base font-medium text-tlw-navy-deep">
            {view !== 'active' && counts[view] === 0
              ? `No ${view} clients`
              : clients.length === 0
              ? 'No clients yet'
              : 'No matches'}
          </h2>
          <p className="mb-4 max-w-sm text-[13px] text-tlw-warm-gray">
            {view === 'inactive' && counts.inactive === 0
              ? 'When you finish with a client, set their Status to inactive on their page (gear icon) and they’ll be kept here with all their data.'
              : view === 'archived' && counts.archived === 0
              ? 'Archive a client from the Inactive list to keep a permanent record without seeing them on either working list.'
              : clients.length === 0
              ? 'Add your first client to start keeping notes in the app.'
              : 'Try a different search.'}
          </p>
          {view === 'active' && clients.length === 0 && (
            <button
              onClick={() => setShowAdd(true)}
              className="text-[13px] font-medium text-tlw-signal-orange hover:underline"
            >
              Add a client
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-2">
            {visible.map((c) => (
              <ClientCard
                key={c.id}
                c={c}
                pendingAgreements={pendingAgreements}
                nextAppointment={nextAppointments[c.id]}
                progress={engagementProgress[c.id]}
                coachTimezone={coachTimezone}
                onEdit={setEditing}
                quickActions={
                  view === 'inactive'
                    ? [
                        { label: 'Activate', title: 'Return to the Active roster', to: 'active' },
                        { label: 'Archive', title: 'Move to the permanent archive', to: 'archived' },
                      ]
                    : view === 'archived'
                    ? [
                        { label: 'Activate', title: 'Return to the Active roster', to: 'active' },
                        { label: 'Restore', title: 'Move back to the Inactive list', to: 'inactive' },
                      ]
                    : undefined
                }
                onSetStatus={setStatus}
              />
            ))}
          </div>

          {visibleTeam.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-tlw-warm-gray">
                My Team — coaches
              </p>
              <div className="space-y-2">
                {visibleTeam.map((c) => (
                  <ClientCard key={c.id} c={c} pendingAgreements={{}} isTeam onEdit={setEditing} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showBulkEmail && (
        <BulkEmailModal
          listLabel={VIEW_LABELS[view]}
          recipients={visible.map((c) => ({ id: c.id, name: c.name, email: c.email }))}
          onClose={() => setShowBulkEmail(false)}
        />
      )}

      {editing && (
        <EditClientModal
          client={editing}
          onClose={() => setEditing(null)}
          onSaved={(u) => {
            // Update whichever list the client lives on; a client_type change is
            // rare enough that the next full load sorts the lists out.
            setClients((cs) => cs.map((c) => (c.id === u.id ? u : c)))
            setTeamClients((cs) => cs.map((c) => (c.id === u.id ? u : c)))
          }}
          onIssueAgreement={() => router.push(`/clients/${editing.id}?issue=1`)}
        />
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

function ClientCard({
  c,
  pendingAgreements,
  isTeam = false,
  nextAppointment,
  progress,
  coachTimezone,
  quickActions,
  onSetStatus,
  onEdit,
}: {
  c: Client
  pendingAgreements: Record<string, number>
  isTeam?: boolean
  /** The client's soonest upcoming session (from the roster payload). */
  nextAppointment?: NextAppointment
  /** Sessions used / session count on the active engagement, when one is set. */
  progress?: EngagementProgress
  coachTimezone?: string
  /** One-click moves between lists (Activate/Archive on the Inactive tab, Activate/Restore on Archived). */
  quickActions?: { label: string; title: string; to: string }[]
  onSetStatus?: (id: string, status: string) => void
  /** Opens the client-settings (edit) modal from the card's gear. */
  onEdit?: (c: Client) => void
}) {
  const pct =
    progress && progress.total != null && progress.total > 0
      ? Math.min(100, Math.round((progress.used / progress.total) * 100))
      : 0
  return (
    <Link
      href={`/clients/${c.id}`}
      className={`group block rounded-tlw-xl border p-4 transition-all duration-tlw-base hover:-translate-y-0.5 hover:shadow-md ${
        isTeam
          ? 'border-tlw-warm-gray/20 bg-tlw-canvas/60 hover:border-tlw-warm-gray/35'
          : 'border-tlw-warm-gray/15 bg-tlw-surface hover:border-tlw-warm-gray/30'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-medium text-tlw-navy-deep">
            {c.name}
            {isTeam && (
              <span className="rounded-full bg-tlw-navy-deep/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-tlw-navy-deep">
                Coach
              </span>
            )}
            {!isTeam && pendingAgreements[c.id] != null && pendingAgreements[c.id] > 7 && (
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
          {!isTeam && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px]">
              <CalIcon />
              {nextAppointment ? (
                <span className="truncate text-tlw-espresso">
                  {formatNext(nextAppointment.scheduled_at, coachTimezone)}
                </span>
              ) : (
                <span className="text-tlw-warm-gray">No upcoming session</span>
              )}
            </p>
          )}
        </div>

        {progress && (
          <div
            className="hidden w-48 shrink-0 sm:block"
            title={
              progress.total != null
                ? progress.mode === 'subscription'
                  ? `${progress.used} of ${progress.total} sessions this year (${pct}%)`
                  : `${progress.used} of ${progress.total} sessions (${pct}%)`
                : `${progress.used} session${progress.used === 1 ? '' : 's'} ${
                    progress.mode === 'subscription' ? 'this year' : 'to date'
                  }`
            }
          >
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-medium text-tlw-espresso">{progress.label}</span>
              <span className="shrink-0 text-[11px] text-tlw-warm-gray">
                {progress.total != null
                  ? `${progress.used} / ${progress.total}${progress.mode === 'subscription' ? ' this yr' : ''}`
                  : `${progress.used} ${progress.mode === 'subscription' ? 'this yr' : 'to date'}`}
              </span>
            </div>
            {progress.total != null ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-tlw-warm-gray/20">
                <div
                  className="h-full rounded-full bg-tlw-navy-deep transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            ) : (
              <div className="h-1.5 w-full rounded-full bg-tlw-warm-gray/10" />
            )}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2">
          {onSetStatus &&
            quickActions?.map((a) => (
              <button
                key={a.label}
                title={a.title}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onSetStatus(c.id, a.to)
                }}
                className="rounded-tlw-md border border-tlw-warm-gray/30 px-2.5 py-1 text-[11px] font-medium text-tlw-warm-gray opacity-0 transition-all hover:border-tlw-navy-rich hover:text-tlw-navy-rich group-hover:opacity-100"
              >
                {a.label}
              </button>
            ))}
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${
              c.status === 'active'
                ? 'bg-tlw-navy-rich/10 text-tlw-navy-rich'
                : 'bg-tlw-warm-gray/15 text-tlw-warm-gray'
            }`}
          >
            {c.status}
          </span>
          {onEdit && (
            <button
              title="Client settings"
              aria-label={`Client settings — ${c.name}`}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onEdit(c)
              }}
              className="rounded-tlw-md p-1.5 text-tlw-warm-gray transition-colors hover:bg-tlw-canvas hover:text-tlw-espresso"
            >
              <GearIcon />
            </button>
          )}
        </div>
      </div>
    </Link>
  )
}

/** "Wed, Jul 15 · 2:00 PM" in the coach's zone; browser locale/zone without one. */
function formatNext(iso: string, timeZone?: string): string {
  const at = new Date(iso)
  if (timeZone) {
    try {
      return formatWhenShort(at, timeZone)
    } catch {
      // fall through to the browser's zone on a bad timezone value
    }
  }
  return at.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function CalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" className="shrink-0 text-tlw-warm-gray">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
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
  const [enterpriseAccountId, setEnterpriseAccountId] = useState<string>('')
  const [enterpriseAccounts, setEnterpriseAccounts] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/billing/accounts?withSummary=1&status=active')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const enterprise = (d?.accounts ?? []).filter((a: any) => a.type === 'enterprise')
        setEnterpriseAccounts(enterprise)
      })
      .catch(() => {})
  }, [])

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

      // 2. Link to billing account: enterprise (if selected) or auto-create solo (if email)
      if (enterpriseAccountId) {
        // Add as a coachee under the selected enterprise account
        const coacheeRes = await fetch(`/api/billing/accounts/${enterpriseAccountId}/coachees`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: newClient.id }),
        })
        if (coacheeRes.ok) {
          const coacheeData = await coacheeRes.json()
          setBillingAccountId(enterpriseAccountId)
          setCoacheeId(coacheeData.coachee?.id ?? null)
        }
      } else if (form.email.trim()) {
        // Auto-create a solo billing account
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
                {enterpriseAccountId
                  ? `Added as a coachee under ${enterpriseAccounts.find((a) => a.id === enterpriseAccountId)?.name ?? 'the enterprise account'}. Set up their engagement below.`
                  : 'A billing account was created automatically. Set up how you bill them — you can change this anytime on their account page.'}
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
          {enterpriseAccounts.length > 0 && (
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-tlw-warm-gray">
                Bill to enterprise account <span className="normal-case font-normal">(optional)</span>
              </label>
              <select
                className={field}
                value={enterpriseAccountId}
                onChange={(e) => setEnterpriseAccountId(e.target.value)}
              >
                <option value="">Create individual billing account</option>
                {enterpriseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {enterpriseAccountId && (
                <p className="mt-1 text-[11px] text-tlw-warm-gray">
                  This client will be added as a coachee under the selected enterprise account.
                </p>
              )}
            </div>
          )}
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
