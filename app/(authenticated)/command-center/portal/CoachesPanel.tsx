'use client'
/**
 * Coaches tab (Client Portal admin): how each coach's portal clients schedule
 * with them — a booking link (Calendly / Zoom Scheduler / HubSpot) and/or a
 * scheduling assistant — plus the readiness checks the portal depends on
 * (signed in with Google = calendar sync works). The coach can set the same
 * fields in Account → Scheduling; this is the supervisor's on-behalf view.
 */
import { useState } from 'react'
import { api, btnLink, btnPrimary, btnSecondary, Chip, ErrorLine, input, Section, useAdminCoaches, type AdminCoach } from './ui'

function CoachRow({ coach, assistantAvailable, onSaved }: { coach: AdminCoach; assistantAvailable: boolean; onSaved: (c: AdminCoach) => void }) {
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState({ bookingUrl: '', assistantName: '', assistantEmail: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function open() {
    setForm({ bookingUrl: coach.booking_url || '', assistantName: coach.scheduling_assistant_name || '', assistantEmail: coach.scheduling_assistant_email || '' })
    setError('')
    setEdit(true)
  }
  async function save() {
    setBusy(true)
    setError('')
    try {
      const body: Record<string, string> = { bookingUrl: form.bookingUrl }
      if (assistantAvailable) Object.assign(body, { assistantName: form.assistantName, assistantEmail: form.assistantEmail })
      const d = await api<{ coach: AdminCoach | null }>(`/api/admin/coaches/${coach.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      if (d.coach) onSaved(d.coach)
      setEdit(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const reachable = Boolean(coach.booking_url || coach.scheduling_assistant_email)
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-tlw-navy-deep">
            {coach.name || coach.email}{' '}
            {coach.connected ? <Chip tone="green">Google connected</Chip> : <Chip tone="amber">not signed in yet</Chip>}{' '}
            {!reachable && <Chip tone="red">no way to schedule</Chip>}
          </p>
          <p className="text-[12px] text-tlw-warm-gray">
            {coach.email} · {coach.primary_client_count} client{coach.primary_client_count === 1 ? '' : 's'}
          </p>
          {!edit && (
            <div className="mt-1 space-y-0.5 text-[12px] text-tlw-espresso">
              <p>
                Booking link:{' '}
                {coach.booking_url ? (
                  <a href={coach.booking_url} target="_blank" rel="noopener noreferrer" className="break-all text-tlw-navy-deep underline">
                    {coach.booking_url}
                  </a>
                ) : (
                  <span className="text-tlw-warm-gray">none</span>
                )}
              </p>
              <p>
                Assistant:{' '}
                {coach.scheduling_assistant_email ? (
                  `${coach.scheduling_assistant_name ? `${coach.scheduling_assistant_name} · ` : ''}${coach.scheduling_assistant_email}`
                ) : (
                  <span className="text-tlw-warm-gray">none</span>
                )}
              </p>
            </div>
          )}
        </div>
        {!edit && (
          <button className={btnLink} onClick={open}>
            Edit scheduling
          </button>
        )}
      </div>
      {edit && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-[11px] text-tlw-warm-gray sm:col-span-3">
            Booking link (Calendly, Zoom Scheduler, or HubSpot — https://…)
            <input className={input} value={form.bookingUrl} onChange={(e) => setForm({ ...form, bookingUrl: e.target.value })} placeholder="https://calendly.com/…" />
          </label>
          <label className="text-[11px] text-tlw-warm-gray">
            Assistant name
            <input className={input} value={form.assistantName} disabled={!assistantAvailable} onChange={(e) => setForm({ ...form, assistantName: e.target.value })} placeholder="e.g. Priya" />
          </label>
          <label className="text-[11px] text-tlw-warm-gray sm:col-span-2">
            Assistant email
            <input className={input} type="email" value={form.assistantEmail} disabled={!assistantAvailable} onChange={(e) => setForm({ ...form, assistantEmail: e.target.value })} placeholder="assistant@…" />
          </label>
          {!assistantAvailable && <p className="text-[12px] text-tlw-signal-orange sm:col-span-3">Apply migration 074 to save a scheduling assistant.</p>}
          <div className="flex gap-2 sm:col-span-3">
            <button className={btnPrimary} disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button className={btnSecondary} onClick={() => setEdit(false)}>
              Cancel
            </button>
          </div>
          <div className="sm:col-span-3">
            <ErrorLine error={error} />
          </div>
        </div>
      )}
    </li>
  )
}

export function CoachesPanel() {
  const { coaches, assistantAvailable, reload } = useAdminCoaches()
  const [local, setLocal] = useState<Record<string, AdminCoach>>({})
  const rows = (coaches || []).map((c) => local[c.id] || c)

  return (
    <Section
      title="Coaches"
      sub="How each coach's portal clients book them. Set a booking link, an assistant, or both. Upcoming sessions reach a client's portal from the coach's Google Calendar, so every coach must sign in to the app once (Google connected) and have their scheduler write to that same calendar with the client's email as a guest. Add coaches in the Command Center."
      actions={
        <button className={btnLink} onClick={reload}>
          Refresh
        </button>
      }
    >
      {coaches === null ? (
        <p className="text-[13px] text-tlw-warm-gray">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-tlw-warm-gray">No coaches yet.</p>
      ) : (
        <ul className="divide-y divide-tlw-warm-gray/10">
          {rows.map((c) => (
            <CoachRow key={c.id} coach={c} assistantAvailable={assistantAvailable} onSaved={(n) => setLocal((m) => ({ ...m, [n.id]: n }))} />
          ))}
        </ul>
      )}
    </Section>
  )
}
