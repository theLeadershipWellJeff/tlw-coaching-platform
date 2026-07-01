'use client'
/**
 * CoachingHoursWidget — the core coaching-hours UI used in the dashboard card,
 * business-center card, and practice area panel.
 *
 * Shows total hours for the selected period (week / month / year), with a
 * "View log" button that opens the full ICF session log where sessions can be
 * edited, added, or deleted.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

type Period = 'week' | 'month' | 'year'

interface Session {
  id: string
  session_date: string
  duration_minutes: number
  billed_hours: number
  title: string | null
  client_id: string
  client_name: string
}

interface HoursData {
  total_minutes: number
  total_hours: number
  sessions: Session[]
}

interface Client {
  id: string
  name: string
}

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Log modal ────────────────────────────────────────────────────────────────

function AddSessionForm({
  clients,
  onAdd,
  onCancel,
}: {
  clients: Client[]
  onAdd: (s: Session) => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(todayISO())
  const [clientId, setClientId] = useState('')
  const [minutes, setMinutes] = useState(60)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId) { setErr('Choose a client.'); return }
    setSaving(true)
    setErr('')
    try {
      const res = await fetch('/api/coaching-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_date: date, client_id: clientId, duration_minutes: minutes, title: title || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Failed to add session.'); return }
      onAdd(data.session)
    } catch {
      setErr('Network error.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-tlw-lg border border-tlw-signal-orange/30 bg-tlw-canvas/60 p-4">
      <p className="mb-3 text-[12px] font-semibold uppercase tracking-[1.5px] text-tlw-warm-gray">Add session</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] text-tlw-warm-gray">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-2.5 py-1.5 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-tlw-warm-gray">Client</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-2.5 py-1.5 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
          >
            <option value="">choose client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-tlw-warm-gray">Duration (minutes)</label>
          <input
            type="number"
            min={1}
            step={5}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            required
            className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-2.5 py-1.5 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-tlw-warm-gray">Title (optional)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Leadership session"
            className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-2.5 py-1.5 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
          />
        </div>
      </div>
      {err && <p className="mt-2 text-[12px] text-red-600">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-tlw-md bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Add session'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-tlw-md px-3 py-1.5 text-[12px] text-tlw-warm-gray transition-opacity hover:opacity-80"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function SessionRow({
  session,
  onUpdate,
  onDelete,
}: {
  session: Session
  onUpdate: (id: string, updates: Partial<Session>) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [minutes, setMinutes] = useState(session.duration_minutes)
  const [date, setDate] = useState(session.session_date)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function save() {
    if (minutes === session.duration_minutes && date === session.session_date) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/coaching-hours/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_minutes: minutes, session_date: date }),
      })
      if (res.ok) {
        onUpdate(session.id, { duration_minutes: minutes, session_date: date })
        setEditing(false)
      }
    } finally {
      setSaving(false)
    }
  }

  async function doDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/coaching-hours/${session.id}`, { method: 'DELETE' })
      if (res.ok) onDelete(session.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-tlw-lg border border-tlw-warm-gray/10 bg-tlw-surface p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex flex-wrap gap-2">
              <div>
                <label className="text-[10px] text-tlw-warm-gray">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-0.5 block rounded border border-tlw-warm-gray/25 bg-tlw-canvas px-2 py-1 text-[12px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                />
              </div>
              <div>
                <label className="text-[10px] text-tlw-warm-gray">Minutes</label>
                <input
                  type="number"
                  min={1}
                  step={5}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className="mt-0.5 block w-24 rounded border border-tlw-warm-gray/25 bg-tlw-canvas px-2 py-1 text-[12px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                />
              </div>
            </div>
          ) : (
            <>
              <p className="text-[13px] font-medium text-tlw-navy-deep">{session.client_name}</p>
              <p className="text-[11px] text-tlw-warm-gray">
                {fmtDate(session.session_date)}
                {session.title && <> · {session.title}</>}
              </p>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!editing && (
            <div className="text-right">
              <p className="text-[14px] font-medium text-tlw-navy-deep">
                {session.duration_minutes}m
              </p>
              <p className="text-[10px] text-tlw-warm-gray">{session.billed_hours}h billed</p>
            </div>
          )}

          {editing ? (
            <>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-tlw-md bg-tlw-navy-rich px-2.5 py-1.5 text-[11px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setMinutes(session.duration_minutes); setDate(session.session_date) }}
                className="rounded-tlw-md px-2 py-1.5 text-[11px] text-tlw-warm-gray transition-opacity hover:opacity-80"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="rounded-tlw-md border border-tlw-warm-gray/20 px-2.5 py-1.5 text-[11px] text-tlw-espresso transition-opacity hover:opacity-80"
            >
              Edit
            </button>
          )}

          {confirmDelete ? (
            <>
              <button
                onClick={doDelete}
                disabled={deleting}
                className="rounded-tlw-md border border-red-300 px-2.5 py-1.5 text-[11px] font-medium text-red-600 transition-opacity hover:opacity-80 disabled:opacity-40"
              >
                {deleting ? 'Deleting…' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-tlw-md px-2 py-1.5 text-[11px] text-tlw-warm-gray"
              >
                No
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-tlw-md border border-tlw-warm-gray/15 px-2.5 py-1.5 text-[11px] text-red-500 transition-opacity hover:opacity-80"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function HoursLogModal({
  period,
  onClose,
}: {
  period: Period
  onClose: () => void
}) {
  const [data, setData] = useState<HoursData | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [exportPeriod, setExportPeriod] = useState<Period>(period)
  const overlayRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (p: Period) => {
    setLoading(true)
    try {
      const [hoursRes, clientsRes] = await Promise.all([
        fetch(`/api/coaching-hours?period=${p}`).then((r) => r.json()),
        fetch('/api/clients').then((r) => r.json()),
      ])
      setData(hoursRes)
      setClients(clientsRes.clients || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(exportPeriod)
  }, [load, exportPeriod])

  function handleUpdate(id: string, updates: Partial<Session>) {
    setData((prev) => {
      if (!prev) return prev
      const sessions = prev.sessions.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      )
      const total_minutes = sessions.reduce((acc, s) => acc + s.duration_minutes, 0)
      return { ...prev, sessions, total_minutes, total_hours: Math.round((total_minutes / 60) * 10) / 10 }
    })
  }

  function handleDelete(id: string) {
    setData((prev) => {
      if (!prev) return prev
      const sessions = prev.sessions.filter((s) => s.id !== id)
      const total_minutes = sessions.reduce((acc, s) => acc + s.duration_minutes, 0)
      return { ...prev, sessions, total_minutes, total_hours: Math.round((total_minutes / 60) * 10) / 10 }
    })
  }

  function handleAdd(session: Session) {
    setData((prev) => {
      if (!prev) return prev
      const sessions = [session, ...prev.sessions].sort((a, b) =>
        b.session_date.localeCompare(a.session_date)
      )
      const total_minutes = sessions.reduce((acc, s) => acc + s.duration_minutes, 0)
      return { ...prev, sessions, total_minutes, total_hours: Math.round((total_minutes / 60) * 10) / 10 }
    })
    setShowAdd(false)
  }

  function exportCSV() {
    if (!data) return
    const rows = [
      ['Date', 'Client', 'Session title', 'Duration (min)', 'Billed hours'],
      ...data.sessions.map((s) => [
        s.session_date,
        s.client_name,
        s.title || '',
        String(s.duration_minutes),
        String(s.billed_hours),
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `coaching-hours-${exportPeriod}.csv`
    a.click()
  }

  const periodLabel: Record<Period, string> = { week: 'This week', month: 'This month', year: 'This year' }
  const totalBilled = data?.sessions.reduce((a, s) => a + s.billed_hours, 0) ?? 0

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-12"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="w-full max-w-2xl rounded-tlw-2xl bg-tlw-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-tlw-warm-gray/15 px-6 py-4">
          <div>
            <h2 className="text-[17px] font-medium text-tlw-navy-deep">Coaching hours log</h2>
            <p className="text-[12px] text-tlw-warm-gray">ICF credential reporting</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-tlw-md p-1.5 text-tlw-warm-gray transition-opacity hover:opacity-70"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Period toggle */}
          <div className="mb-5 flex items-center gap-2">
            <span className="text-[12px] text-tlw-warm-gray">Show:</span>
            {(['week', 'month', 'year'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setExportPeriod(p)}
                className={`rounded-tlw-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  exportPeriod === p
                    ? 'bg-tlw-navy-rich text-tlw-cream'
                    : 'border border-tlw-warm-gray/25 text-tlw-espresso hover:bg-tlw-canvas'
                }`}
              >
                {periodLabel[p]}
              </button>
            ))}
          </div>

          {/* Summary row */}
          {!loading && data && (
            <div className="mb-4 flex flex-wrap gap-4 rounded-tlw-lg bg-tlw-canvas/60 px-4 py-3">
              <div>
                <p className="text-[10px] uppercase tracking-[1.5px] text-tlw-warm-gray">Total hours</p>
                <p className="text-[22px] font-medium leading-none text-tlw-navy-deep">{data.total_hours}h</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[1.5px] text-tlw-warm-gray">Billed hours</p>
                <p className="text-[22px] font-medium leading-none text-tlw-navy-deep">{totalBilled}h</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[1.5px] text-tlw-warm-gray">Sessions</p>
                <p className="text-[22px] font-medium leading-none text-tlw-navy-deep">{data.sessions.length}</p>
              </div>
            </div>
          )}

          {/* Actions row */}
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="rounded-tlw-md border border-tlw-warm-gray/25 px-3 py-1.5 text-[12px] font-medium text-tlw-espresso transition-colors hover:bg-tlw-canvas"
            >
              + Add session
            </button>
            <button
              onClick={exportCSV}
              disabled={!data || data.sessions.length === 0}
              className="rounded-tlw-md border border-tlw-warm-gray/25 px-3 py-1.5 text-[12px] font-medium text-tlw-espresso transition-colors hover:bg-tlw-canvas disabled:opacity-40"
            >
              Export CSV
            </button>
          </div>

          {showAdd && (
            <AddSessionForm
              clients={clients}
              onAdd={handleAdd}
              onCancel={() => setShowAdd(false)}
            />
          )}

          {/* Session list */}
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
              ))}
            </div>
          ) : !data || data.sessions.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-tlw-warm-gray">
              No sessions logged for this period. Add one above or log session notes from client workspaces.
            </p>
          ) : (
            <div className="space-y-2">
              {data.sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main widget ──────────────────────────────────────────────────────────────

interface Props {
  compact?: boolean
}

export function CoachingHoursWidget({ compact = false }: Props) {
  const [period, setPeriod] = useState<Period>('week')
  const [data, setData] = useState<HoursData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showLog, setShowLog] = useState(false)

  const load = useCallback(async (p: Period) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/coaching-hours?period=${p}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(period)
  }, [load, period])

  const periodLabel: Record<Period, string> = { week: 'Past week', month: 'Past month', year: 'Past year' }

  return (
    <>
      {showLog && <HoursLogModal period={period} onClose={() => setShowLog(false)} />}

      <div>
        {/* Period toggle */}
        <div className="mb-3 flex gap-1">
          {(['week', 'month', 'year'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-tlw-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                period === p
                  ? 'bg-tlw-navy-rich/10 text-tlw-navy-rich'
                  : 'text-tlw-warm-gray hover:text-tlw-espresso'
              }`}
            >
              {p === 'week' ? 'Wk' : p === 'month' ? 'Mo' : 'Yr'}
            </button>
          ))}
        </div>

        {/* Total */}
        {loading ? (
          <div className="h-10 animate-pulse rounded-tlw-lg bg-tlw-canvas/70" />
        ) : (
          <>
            <p className="text-[30px] font-medium leading-none text-tlw-navy-deep">
              {data?.total_hours ?? 0}h
            </p>
            <p className="mt-1 text-[11px] text-tlw-warm-gray">
              {periodLabel[period]} · {data?.sessions.length ?? 0} session{data?.sessions.length === 1 ? '' : 's'}
            </p>
          </>
        )}

        {/* View log */}
        {!compact && (
          <button
            onClick={() => setShowLog(true)}
            className="mt-3 rounded-tlw-md border border-tlw-warm-gray/25 px-3 py-1.5 text-[12px] font-medium text-tlw-espresso transition-colors hover:bg-tlw-canvas"
          >
            View log
          </button>
        )}

        {compact && (
          <button
            onClick={() => setShowLog(true)}
            className="mt-2 text-[11px] text-tlw-signal-orange transition-opacity hover:opacity-80"
          >
            View log →
          </button>
        )}
      </div>
    </>
  )
}
