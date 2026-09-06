'use client'
import { useEffect, useState } from 'react'
import { api, btnLink, btnPrimary, btnSecondary, Chip, ErrorLine, fmtDate, input, Section } from './ui'

export type Cohort = {
  id: string
  company_id: string
  name: string
  seats_purchased: number
  seats_activated: number
  access_starts_at: string | null
  access_expires_at: string | null
  debrief_coach_name: string | null
  status: string
}
export type Company = { id: string; name: string; vision: string | null; values: string | null; notes: string | null; cohorts: Cohort[] }

function CohortRow({ cohort, onChanged }: { cohort: Cohort; onChanged: (c: Cohort) => void }) {
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState({
    name: cohort.name,
    seatsPurchased: String(cohort.seats_purchased),
    accessStartsAt: cohort.access_starts_at?.slice(0, 10) || '',
    accessExpiresAt: cohort.access_expires_at?.slice(0, 10) || '',
    debriefCoachName: cohort.debrief_coach_name || '',
    status: cohort.status,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [invite, setInvite] = useState<{ sent: number; failed: number; skipped: number; remaining: number } | null>(null)
  const [inviting, setInviting] = useState(false)

  async function save() {
    setBusy(true)
    setError('')
    try {
      const d = await api<{ cohort: Cohort }>(`/api/admin/cohorts/${cohort.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...form, seatsPurchased: Number(form.seatsPurchased), accessStartsAt: form.accessStartsAt || null, accessExpiresAt: form.accessExpiresAt || null }),
      })
      onChanged(d.cohort)
      setEdit(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  async function sendInvites(onlyUninvited: boolean) {
    const label = onlyUninvited ? 'everyone in this cohort who has not been invited yet' : 'EVERYONE in this cohort, including people already invited'
    if (!window.confirm(`Send portal invitations to ${label}? Sends go out in throttled batches of 25.`)) return
    setInviting(true)
    setError('')
    const totals = { sent: 0, failed: 0, skipped: 0, remaining: 0 }
    try {
      for (let round = 0; round < 20; round++) {
        const d = await api<{ sent: string[]; failed: unknown[]; skipped: number; remaining: number }>(`/api/admin/cohorts/${cohort.id}/invite`, {
          method: 'POST',
          body: JSON.stringify({ onlyUninvited }),
        })
        totals.sent += d.sent.length
        totals.failed += d.failed.length
        totals.skipped = d.skipped
        totals.remaining = d.remaining
        setInvite({ ...totals })
        if (d.remaining === 0 || d.sent.length + d.failed.length === 0) break
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invite run failed.')
    } finally {
      setInviting(false)
    }
  }

  const seatTone = cohort.seats_activated > cohort.seats_purchased ? 'red' : cohort.seats_activated === cohort.seats_purchased ? 'green' : 'gray'

  return (
    <li className="rounded-tlw-xl border border-tlw-warm-gray/15 p-3">
      {edit ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cohort name" />
          <input className={input} type="number" min={0} value={form.seatsPurchased} onChange={(e) => setForm({ ...form, seatsPurchased: e.target.value })} placeholder="Seats purchased" />
          <input className={input} value={form.debriefCoachName} onChange={(e) => setForm({ ...form, debriefCoachName: e.target.value })} placeholder="Debrief coach (name only)" />
          <label className="text-[11px] text-tlw-warm-gray">
            Access starts
            <input className={input} type="date" value={form.accessStartsAt} onChange={(e) => setForm({ ...form, accessStartsAt: e.target.value })} />
          </label>
          <label className="text-[11px] text-tlw-warm-gray">
            Access ends
            <input className={input} type="date" value={form.accessExpiresAt} onChange={(e) => setForm({ ...form, accessExpiresAt: e.target.value })} />
          </label>
          <label className="text-[11px] text-tlw-warm-gray">
            Status
            <select className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">active</option>
              <option value="closed">closed</option>
            </select>
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <button className={btnPrimary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
            <button className={btnSecondary} onClick={() => setEdit(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[14px] font-medium text-tlw-navy-deep">
              {cohort.name} {cohort.status === 'closed' && <Chip>closed</Chip>}
            </p>
            <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
              <Chip tone={seatTone}>{cohort.seats_activated} / {cohort.seats_purchased} seats</Chip>
              <span className="ml-2">{fmtDate(cohort.access_starts_at)} → {fmtDate(cohort.access_expires_at)}</span>
              {cohort.debrief_coach_name && <span className="ml-2">· debrief coach: {cohort.debrief_coach_name}</span>}
            </p>
            {invite && (
              <p className="mt-1 text-[12px] text-tlw-espresso">
                Invitations: {invite.sent} sent · {invite.failed} failed · {invite.skipped} skipped{invite.remaining > 0 ? ` · ${invite.remaining} remaining` : ''}
              </p>
            )}
            <ErrorLine error={error} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className={btnLink} onClick={() => setEdit(true)}>Edit</button>
            <a className={btnLink} href={`/api/admin/cohorts/${cohort.id}/roster`}>Roster CSV</a>
            <button className={btnLink} disabled={inviting} onClick={() => sendInvites(true)}>{inviting ? 'Sending…' : 'Send invitations'}</button>
            <button className={btnLink} disabled={inviting} onClick={() => sendInvites(false)}>Re-send all</button>
          </div>
        </div>
      )}
    </li>
  )
}

function CompanyCard({ company, onChanged }: { company: Company; onChanged: (c: Company) => void }) {
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState({ name: company.name, vision: company.vision || '', values: company.values || '', notes: company.notes || '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [newCohort, setNewCohort] = useState<{ name: string; seatsPurchased: string; accessExpiresAt: string; debriefCoachName: string } | null>(null)

  async function save() {
    setBusy(true)
    setError('')
    try {
      const d = await api<{ company: Omit<Company, 'cohorts'> }>(`/api/admin/companies/${company.id}`, { method: 'PATCH', body: JSON.stringify(form) })
      onChanged({ ...company, ...d.company })
      setEdit(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }
  async function createCohort() {
    if (!newCohort) return
    setBusy(true)
    setError('')
    try {
      const d = await api<{ cohort: Cohort }>('/api/admin/cohorts', {
        method: 'POST',
        body: JSON.stringify({ companyId: company.id, name: newCohort.name, seatsPurchased: Number(newCohort.seatsPurchased || 0), accessExpiresAt: newCohort.accessExpiresAt || null, debriefCoachName: newCohort.debriefCoachName }),
      })
      onChanged({ ...company, cohorts: [d.cohort, ...company.cohorts] })
      setNewCohort(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the cohort.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5">
      {edit ? (
        <div className="space-y-2">
          <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Company name" />
          <textarea className={input} rows={3} value={form.vision} onChange={(e) => setForm({ ...form, vision: e.target.value })} placeholder="Vision (shown to the assistant for this company's participants only)" />
          <textarea className={input} rows={3} value={form.values} onChange={(e) => setForm({ ...form, values: e.target.value })} placeholder="Values" />
          <textarea className={input} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Internal notes (never shown to participants)" />
          <div className="flex gap-2">
            <button className={btnPrimary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
            <button className={btnSecondary} onClick={() => setEdit(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[16px] font-medium text-tlw-navy-deep">{company.name}</h3>
            <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
              {company.vision || company.values ? 'Vision / values on file — included in participants’ chat context.' : 'No vision or values yet — the assistant gets no company context for these participants.'}
            </p>
          </div>
          <button className={btnLink} onClick={() => setEdit(true)}>Edit</button>
        </div>
      )}
      <ErrorLine error={error} />

      <div className="mt-4 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-tlw-warm-gray">Cohorts</p>
        {!newCohort && (
          <button className={btnLink} onClick={() => setNewCohort({ name: '', seatsPurchased: '', accessExpiresAt: '', debriefCoachName: '' })}>+ New cohort</button>
        )}
      </div>
      {newCohort && (
        <div className="mt-2 grid grid-cols-1 gap-2 rounded-tlw-xl border border-dashed border-tlw-warm-gray/30 p-3 sm:grid-cols-4">
          <input className={input} value={newCohort.name} onChange={(e) => setNewCohort({ ...newCohort, name: e.target.value })} placeholder="Cohort name" />
          <input className={input} type="number" min={0} value={newCohort.seatsPurchased} onChange={(e) => setNewCohort({ ...newCohort, seatsPurchased: e.target.value })} placeholder="Seats purchased" />
          <input className={input} type="date" value={newCohort.accessExpiresAt} onChange={(e) => setNewCohort({ ...newCohort, accessExpiresAt: e.target.value })} />
          <input className={input} value={newCohort.debriefCoachName} onChange={(e) => setNewCohort({ ...newCohort, debriefCoachName: e.target.value })} placeholder="Debrief coach name" />
          <div className="flex gap-2 sm:col-span-4">
            <button className={btnPrimary} disabled={busy || !newCohort.name.trim()} onClick={createCohort}>Create cohort</button>
            <button className={btnSecondary} onClick={() => setNewCohort(null)}>Cancel</button>
          </div>
        </div>
      )}
      <ul className="mt-2 space-y-2">
        {company.cohorts.length === 0 && !newCohort && <li className="text-[12px] text-tlw-warm-gray">No cohorts yet.</li>}
        {company.cohorts.map((c) => (
          <CohortRow key={c.id} cohort={c} onChanged={(nc) => onChanged({ ...company, cohorts: company.cohorts.map((x) => (x.id === nc.id ? nc : x)) })} />
        ))}
      </ul>
    </div>
  )
}

export function CompaniesPanel() {
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  async function load() {
    try {
      const d = await api<{ companies: Company[] }>('/api/admin/companies')
      setCompanies(d.companies)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load.')
      setCompanies([])
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function create() {
    setCreating(true)
    setError('')
    try {
      const d = await api<{ company: Omit<Company, 'cohorts'> }>('/api/admin/companies', { method: 'POST', body: JSON.stringify({ name }) })
      setCompanies((cs) => [{ ...d.company, cohorts: [] }, ...(cs || [])])
      setName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      <Section title="Companies & cohorts" sub="Billing is on seats purchased; seats activated is counted from participants assigned to the cohort. Debrief coaches are a name on the cohort — they have no app access.">
        <div className="flex gap-2">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="New company name" onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} />
          <button className={btnPrimary} disabled={creating || !name.trim()} onClick={create}>+ Add company</button>
        </div>
        <ErrorLine error={error} />
      </Section>
      {companies === null ? (
        <p className="text-[13px] text-tlw-warm-gray">Loading…</p>
      ) : (
        companies.map((c) => <CompanyCard key={c.id} company={c} onChanged={(nc) => setCompanies((cs) => (cs || []).map((x) => (x.id === nc.id ? nc : x)))} />)
      )}
    </div>
  )
}
