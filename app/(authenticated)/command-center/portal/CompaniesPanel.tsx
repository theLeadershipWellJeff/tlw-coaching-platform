'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { api, btnLink, btnPrimary, btnSecondary, Chip, DocumentPickers, ErrorLine, fmtDate, input, Section, statusTone, uploadPickedDocuments } from './ui'
import type { PortalUser } from './PortalUsersPanel'

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

/** Cohort lifecycle. The legacy 'closed' value reads as inactive. */
export type CohortStatus = 'active' | 'inactive' | 'archived'
export const COHORT_STATUSES: CohortStatus[] = ['active', 'inactive', 'archived']
export function cohortStatus(status: string | null | undefined): CohortStatus {
  if (status === 'archived') return 'archived'
  if (status === 'inactive' || status === 'closed') return 'inactive'
  return 'active'
}

export function CohortRow({
  cohort,
  onChanged,
  companyName,
  onViewParticipants,
  participants,
}: {
  cohort: Cohort
  onChanged: (c: Cohort) => void
  /** Shown when the row is listed outside its company (the Cohorts tab). */
  companyName?: string
  /** Jump to the Portal users tab filtered to this cohort. */
  onViewParticipants?: () => void
  /** The cohort's portal users, listed beneath the row (Companies tab). */
  participants?: PortalUser[]
}) {
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState({
    name: cohort.name,
    seatsPurchased: String(cohort.seats_purchased),
    accessStartsAt: cohort.access_starts_at?.slice(0, 10) || '',
    accessExpiresAt: cohort.access_expires_at?.slice(0, 10) || '',
    debriefCoachName: cohort.debrief_coach_name || '',
    status: cohortStatus(cohort.status) as string,
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
              {COHORT_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
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
              {cohort.name}
              {companyName && <span className="ml-2 text-[12px] font-normal text-tlw-warm-gray">{companyName}</span>}
              {cohortStatus(cohort.status) !== 'active' && <span className="ml-2"><Chip tone={cohortStatus(cohort.status) === 'archived' ? 'gray' : 'amber'}>{cohortStatus(cohort.status)}</Chip></span>}
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
            {participants && <ParticipantList users={participants} />}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className={btnLink} onClick={() => setEdit(true)}>Edit</button>
            {onViewParticipants && <button className={btnLink} onClick={onViewParticipants}>Participants</button>}
            <a className={btnLink} href={`/api/admin/cohorts/${cohort.id}/roster`}>Roster CSV</a>
            <button className={btnLink} disabled={inviting} onClick={() => sendInvites(true)}>{inviting ? 'Sending…' : 'Send invitations'}</button>
            <button className={btnLink} disabled={inviting} onClick={() => sendInvites(false)}>Re-send all</button>
          </div>
        </div>
      )}
    </li>
  )
}

type CompanyDoc = { id: string; title: string; extraction_status: string; extraction_error: string | null; include_in_chat: boolean; text_chars: number; created_at: string }

/** Sponsor material for one company — feeds the chat of this company's participants only. */
function CompanyDocuments({ companyId }: { companyId: string }) {
  const [docs, setDocs] = useState<CompanyDoc[] | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    try {
      const d = await api<{ documents: CompanyDoc[] }>(`/api/admin/companies/${companyId}/documents`)
      setDocs(d.documents)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load documents.')
      setDocs([])
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  async function upload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (title.trim()) fd.append('title', title.trim())
      const res = await fetch(`/api/admin/companies/${companyId}/documents`, { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Upload failed.')
      setTitle('')
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }
  async function toggle(doc: CompanyDoc) {
    setBusy(true)
    try {
      await api(`/api/admin/companies/${companyId}/documents/${doc.id}`, { method: 'PATCH', body: JSON.stringify({ includeInChat: !doc.include_in_chat }) })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update.')
    } finally {
      setBusy(false)
    }
  }
  async function remove(doc: CompanyDoc) {
    if (!window.confirm(`Remove "${doc.title}"?`)) return
    setBusy(true)
    try {
      await api(`/api/admin/companies/${companyId}/documents/${doc.id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-tlw-warm-gray">Company documents</p>
      <p className="mt-0.5 text-[12px] text-tlw-warm-gray">Vision decks, values, a leadership framework, strategy — anything that should shape the assistant for this company&apos;s people. PDF, Word, or text. Only this company&apos;s participants ever see it.</p>
      <ul className="mt-2 space-y-1">
        {docs === null ? (
          <li className="text-[12px] text-tlw-warm-gray">Loading…</li>
        ) : docs.length === 0 ? (
          <li className="text-[12px] text-tlw-warm-gray">No documents yet.</li>
        ) : (
          docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
              <span className="text-tlw-espresso">
                {d.title} <Chip tone={d.extraction_status === 'complete' ? 'green' : 'red'}>{d.extraction_status === 'complete' ? `${Math.round(d.text_chars / 1000)}k chars` : d.extraction_status}</Chip>
                {d.extraction_error && <span className="ml-1 text-tlw-warm-gray">{d.extraction_error}</span>}
              </span>
              <span className="flex items-center gap-3">
                <button className={btnLink} disabled={busy} onClick={() => toggle(d)}>{d.include_in_chat ? 'In chat ✓' : 'Reference only'}</button>
                <button className={btnLink} disabled={busy} onClick={() => remove(d)}>Remove</button>
              </span>
            </li>
          ))
        )}
      </ul>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" />
        <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" className={input} />
        <button className={btnSecondary} disabled={busy} onClick={upload}>{busy ? 'Working…' : '+ Upload document'}</button>
      </div>
      <ErrorLine error={error} />
    </div>
  )
}

/** The portal users under a cohort / company, each linking to their page. */
function ParticipantList({ users }: { users: PortalUser[] }) {
  if (!users.length) return <p className="mt-2 text-[12px] text-tlw-warm-gray">No participants yet.</p>
  return (
    <ul className="mt-2 divide-y divide-tlw-warm-gray/10 rounded-tlw-lg bg-tlw-canvas px-3">
      {users.map((u) => (
        <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-[12px]">
          <span className="min-w-0">
            <Link href={`/command-center/portal/users/${u.id}`} className="font-medium text-tlw-navy-deep hover:text-tlw-signal-orange hover:underline">{u.name}</Link>
            <span className="ml-2 text-tlw-warm-gray">{u.email || 'no email'}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-tlw-warm-gray">
            {u.document ? <Chip tone={statusTone(u.document.extraction_status)}>report: {u.document.extraction_status}</Chip> : <Chip>no report</Chip>}
            <span>{u.portal.lastSeenAt ? `seen ${fmtDate(u.portal.lastSeenAt)}` : u.portal.invitedAt ? `invited ${fmtDate(u.portal.invitedAt)}` : 'not invited'}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Add a participant directly under a company (cohort optional), with their documents. */
function AddParticipant({ company, onAdded }: { company: Company; onAdded: (note: string) => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', cohortId: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reportRef = useRef<HTMLInputElement>(null)
  const othersRef = useRef<HTMLInputElement>(null)
  async function create() {
    setBusy(true)
    setError('')
    try {
      const created = await api<{ id: string }>('/api/admin/portal-users', { method: 'POST', body: JSON.stringify({ name: form.name, email: form.email, companyId: company.id, cohortId: form.cohortId || null }) })
      const notes = await uploadPickedDocuments(created.id, reportRef.current?.files?.[0] || null, Array.from(othersRef.current?.files || []))
      setForm({ name: '', email: '', cohortId: form.cohortId })
      setOpen(false)
      onAdded(`${created.id ? form.name.trim() : 'Participant'} added.${notes.length ? ` ${notes.join(' · ')}` : ''}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add.')
    } finally {
      setBusy(false)
    }
  }
  if (!open) return <button className={btnLink} onClick={() => setOpen(true)}>+ Add participant</button>
  return (
    <div className="mt-2 grid grid-cols-1 gap-2 rounded-tlw-xl border border-dashed border-tlw-warm-gray/30 p-3 sm:grid-cols-4">
      <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name (as on their report)" />
      <input className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
      <select className={input} value={form.cohortId} onChange={(e) => setForm({ ...form, cohortId: e.target.value })}>
        <option value="">No cohort</option>
        {company.cohorts.filter((c) => cohortStatus(c.status) !== 'archived').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={busy || !form.name.trim() || !form.email.trim()} onClick={create}>{busy ? 'Adding…' : 'Add'}</button>
        <button className={btnSecondary} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <DocumentPickers reportRef={reportRef} othersRef={othersRef} className="sm:col-span-4" />
      {error && <p className="text-[12px] text-tlw-signal-orange sm:col-span-4">{error}</p>}
    </div>
  )
}

function CompanyCard({ company, users, onChanged, onUsersChanged }: { company: Company; users: PortalUser[]; onChanged: (c: Company) => void; onUsersChanged: () => void }) {
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState({ name: company.name, vision: company.vision || '', values: company.values || '', notes: company.notes || '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [newCohort, setNewCohort] = useState<{ name: string; seatsPurchased: string; accessExpiresAt: string; debriefCoachName: string } | null>(null)
  const [addedNote, setAddedNote] = useState('')

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

      <CompanyDocuments companyId={company.id} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-tlw-warm-gray">Cohorts &amp; participants</p>
        <div className="flex items-center gap-3">
          <AddParticipant
            company={company}
            onAdded={(note) => {
              setAddedNote(note)
              onUsersChanged()
            }}
          />
          {!newCohort && (
            <button className={btnLink} onClick={() => setNewCohort({ name: '', seatsPurchased: '', accessExpiresAt: '', debriefCoachName: '' })}>+ New cohort</button>
          )}
        </div>
      </div>
      {addedNote && <p className="mt-1 text-[12px] text-emerald-700">{addedNote} Open them to invite.</p>}
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
          <CohortRow
            key={c.id}
            cohort={c}
            participants={users.filter((u) => u.cohort_id === c.id)}
            onChanged={(nc) => onChanged({ ...company, cohorts: company.cohorts.map((x) => (x.id === nc.id ? nc : x)) })}
          />
        ))}
      </ul>
      {users.some((u) => u.company_id === company.id && !u.cohort_id) && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-tlw-warm-gray">Participants without a cohort</p>
          <ParticipantList users={users.filter((u) => u.company_id === company.id && !u.cohort_id)} />
        </div>
      )}
    </div>
  )
}

export function CompaniesPanel() {
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [users, setUsers] = useState<PortalUser[]>([])
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  // Every portal user once; grouped under company → cohort in the cards.
  async function loadUsers() {
    try {
      const d = await api<{ users: PortalUser[] }>('/api/admin/portal-users')
      setUsers(d.users)
    } catch {
      /* the cards still render without the lists */
    }
  }
  async function load() {
    loadUsers()
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
      <Section title="Companies — cohorts, documents, participants" sub="Enterprise sponsors live here: their documents shape the assistant for their people, cohorts carry seats purchased vs activated, and participants can be added under the company with or without a cohort. Standalone participants (no company) are added from the Portal users tab. Debrief coaches are a name on the cohort — they have no app access.">
        <div className="flex gap-2">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="New company name" onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} />
          <button className={btnPrimary} disabled={creating || !name.trim()} onClick={create}>+ Add company</button>
        </div>
        <ErrorLine error={error} />
      </Section>
      {companies === null ? (
        <p className="text-[13px] text-tlw-warm-gray">Loading…</p>
      ) : (
        companies.map((c) => (
          <CompanyCard key={c.id} company={c} users={users} onUsersChanged={loadUsers} onChanged={(nc) => setCompanies((cs) => (cs || []).map((x) => (x.id === nc.id ? nc : x)))} />
        ))
      )}
    </div>
  )
}
