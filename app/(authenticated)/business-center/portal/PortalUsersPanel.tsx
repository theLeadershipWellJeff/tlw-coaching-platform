'use client'
import { useEffect, useMemo, useState } from 'react'
import { api, btnLink, btnPrimary, btnSecondary, Chip, ErrorLine, fmtDate, input, Section, statusTone } from './ui'
import { cohortStatus, type Company } from './CompaniesPanel'

type PortalUser = {
  id: string
  name: string
  email: string | null
  client_type: string
  kind: 'coaching' | 'coaching_zf' | 'standalone' | 'enterprise'
  company_id: string | null
  company_name: string | null
  cohort_id: string | null
  cohort_name: string | null
  assessments_enabled: boolean
  portal_access_expires_at: string | null
  portal: { invitedAt: string | null; lastSeenAt: string | null; locked: boolean }
  document: { id: string; extraction_status: string; extraction_error: string | null; assessment_date: string | null } | null
  document_count: number
  engagement: { chat_messages: number; goals_created: number; downloads: number; last_event_at: string | null; talk_to_coach_clicks: number }
  has_coach_relationship: boolean
}

export function PortalUsersPanel({ companies, initialCohortId = '' }: { companies: Company[]; initialCohortId?: string }) {
  const [users, setUsers] = useState<PortalUser[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filterCohort, setFilterCohort] = useState(initialCohortId)
  const [filterKind, setFilterKind] = useState<'' | PortalUser['kind']>('')
  const [form, setForm] = useState({ name: '', email: '', companyId: '', cohortId: '' })
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<PortalUser | null>(null)
  const [editForm, setEditForm] = useState({ cohortId: '', companyId: '', accessExpiresAt: '', maxAssessments: '', maxDocuments: '' })

  const cohorts = useMemo(() => companies.flatMap((c) => c.cohorts.map((k) => ({ ...k, company_name: c.name }))), [companies])

  async function load() {
    try {
      const qs = new URLSearchParams()
      if (filterCohort) qs.set('cohortId', filterCohort)
      if (filterKind) qs.set('kind', filterKind)
      const d = await api<{ users: PortalUser[] }>(`/api/admin/portal-users${qs.toString() ? `?${qs}` : ''}`)
      setUsers(d.users)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load.')
      setUsers([])
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCohort, filterKind])

  function replace(u: PortalUser | null) {
    if (!u) return load()
    setUsers((us) => (us || []).map((x) => (x.id === u.id ? u : x)))
  }

  async function create() {
    setCreating(true)
    setError('')
    try {
      await api('/api/admin/portal-users', { method: 'POST', body: JSON.stringify({ name: form.name, email: form.email, companyId: form.companyId || null, cohortId: form.cohortId || null }) })
      setForm({ name: '', email: '', companyId: form.companyId, cohortId: form.cohortId })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create.')
    } finally {
      setCreating(false)
    }
  }
  async function toggleFlag(u: PortalUser) {
    setBusy(u.id)
    setError('')
    try {
      const d = await api<{ user: PortalUser | null }>(`/api/admin/portal-users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ assessments: !u.assessments_enabled }) })
      replace(d.user)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update.')
    } finally {
      setBusy(null)
    }
  }
  async function invite(u: PortalUser) {
    setBusy(u.id)
    setError('')
    setNotice('')
    try {
      const d = await api<{ sentTo: string; via: string; warning?: string }>(`/api/admin/portal-users/${u.id}/invite`, { method: 'POST' })
      setNotice(`Invitation sent to ${d.sentTo} via ${d.via === 'resend' ? 'the portal address' : 'Gmail'}.${d.warning ? ` ${d.warning}` : ''}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send.')
    } finally {
      setBusy(null)
    }
  }
  function openEdit(u: PortalUser) {
    setEditing(u)
    setEditForm({ cohortId: u.cohort_id || '', companyId: u.company_id || '', accessExpiresAt: u.portal_access_expires_at?.slice(0, 10) || '', maxAssessments: '', maxDocuments: '' })
  }
  async function saveEdit() {
    if (!editing) return
    setBusy(editing.id)
    setError('')
    try {
      const body: Record<string, unknown> = { cohortId: editForm.cohortId || null, companyId: editForm.companyId || null, accessExpiresAt: editForm.accessExpiresAt || null }
      if (editForm.maxAssessments) body.maxAssessments = Number(editForm.maxAssessments)
      if (editForm.maxDocuments) body.maxDocuments = Number(editForm.maxDocuments)
      const d = await api<{ user: PortalUser | null }>(`/api/admin/portal-users/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      replace(d.user)
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <Section title="Add a ZF participant" sub="Leave company and cohort empty for a standalone participant (bought their own report, no coach). Pick a company for an enterprise participant; a cohort is optional. Either way they are linked to the house coach automatically and never appear in the coaching roster. Existing coaching clients get the 360 by toggling the flag in the list below, not here.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name (as on their report)" />
          <input className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
          <select className={input} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value, cohortId: '' })}>
            <option value="">No company (standalone)</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={input} value={form.cohortId} onChange={(e) => setForm({ ...form, cohortId: e.target.value })} disabled={!form.companyId}>
            <option value="">No cohort</option>
            {cohorts.filter((c) => c.company_id === form.companyId && cohortStatus(c.status) !== 'archived').map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className={btnPrimary} disabled={creating || !form.name.trim() || !form.email.trim()} onClick={create}>{creating ? 'Adding…' : '+ Add participant'}</button>
        </div>
        <ErrorLine error={error} />
      </Section>

      <Section
        title="Portal users"
        sub="Everyone using the portal: coaching clients (general portal), coaching clients with the 360 on, standalone ZF participants, and enterprise cohort participants. The 360 flag is per client — switch it on here for any coaching client without re-onboarding."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 text-[12px]">
              {([['', 'All'], ['coaching', 'Coaching'], ['coaching_zf', 'Coaching + ZF'], ['standalone', 'Standalone ZF'], ['enterprise', 'Enterprise']] as const).map(([k, label]) => (
                <button key={k} className={`rounded-tlw-lg px-2 py-1 ${filterKind === k ? 'bg-tlw-navy-deep text-white' : 'text-tlw-espresso hover:bg-tlw-canvas'}`} onClick={() => setFilterKind(k)}>{label}</button>
              ))}
            </div>
            <select className={`${input} w-auto`} value={filterCohort} onChange={(e) => setFilterCohort(e.target.value)}>
              <option value="">All cohorts</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name} · {c.name}</option>
              ))}
            </select>
          </div>
        }
      >
        {notice && <p className="mb-2 text-[12px] text-emerald-700">{notice}</p>}
        {users === null ? (
          <p className="text-[13px] text-tlw-warm-gray">Loading…</p>
        ) : users.length === 0 ? (
          <p className="text-[13px] text-tlw-warm-gray">No portal users yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-[11px] uppercase tracking-wider text-tlw-warm-gray">
                <tr>
                  <th className="py-2 pr-3">Participant</th>
                  <th className="py-2 pr-3">Cohort</th>
                  <th className="py-2 pr-3">360</th>
                  <th className="py-2 pr-3">Report</th>
                  <th className="py-2 pr-3">Portal</th>
                  <th className="py-2 pr-3">Engagement</th>
                  <th className="py-2 pr-3">Access ends</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tlw-warm-gray/10">
                {users.map((u) => (
                  <tr key={u.id} className="align-top">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-tlw-navy-deep">
                        {u.name}{' '}
                        <Chip tone={u.kind === 'coaching' ? 'gray' : 'navy'}>{{ coaching: 'coaching', coaching_zf: 'coaching + ZF', standalone: 'standalone ZF', enterprise: 'enterprise' }[u.kind]}</Chip>
                      </p>
                      <p className="text-tlw-warm-gray">{u.email || 'no email'}</p>
                    </td>
                    <td className="py-2 pr-3 text-tlw-espresso">{u.cohort_name ? `${u.company_name || ''} · ${u.cohort_name}` : u.company_name || '—'}</td>
                    <td className="py-2 pr-3">
                      <button className={btnLink} disabled={busy === u.id} onClick={() => toggleFlag(u)}>
                        {u.assessments_enabled ? <Chip tone="green">on</Chip> : <Chip>off</Chip>}
                      </button>
                    </td>
                    <td className="py-2 pr-3">
                      {u.document ? (
                        <>
                          <Chip tone={statusTone(u.document.extraction_status)}>{u.document.extraction_status}</Chip>
                          <p className="text-tlw-warm-gray">{fmtDate(u.document.assessment_date)}{u.document_count > 1 ? ` · ${u.document_count} on file` : ''}</p>
                        </>
                      ) : (
                        <Chip>none</Chip>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-tlw-espresso">
                      {u.portal.lastSeenAt ? `seen ${fmtDate(u.portal.lastSeenAt)}` : u.portal.invitedAt ? `invited ${fmtDate(u.portal.invitedAt)}` : 'not invited'}
                      {u.portal.locked && <Chip tone="red">locked</Chip>}
                    </td>
                    <td className="py-2 pr-3 text-tlw-espresso">
                      {u.engagement.chat_messages} msgs · {u.engagement.goals_created} goals · {u.engagement.downloads} views{u.engagement.talk_to_coach_clicks ? ` · ${u.engagement.talk_to_coach_clicks} coach clicks` : ''}
                    </td>
                    <td className="py-2 pr-3 text-tlw-espresso">{fmtDate(u.portal_access_expires_at)}</td>
                    <td className="py-2 whitespace-nowrap">
                      <button className={btnLink} disabled={busy === u.id || !u.email} onClick={() => invite(u)}>{u.portal.invitedAt ? 'Resend' : 'Invite'}</button>
                      <span className="mx-1 text-tlw-warm-gray">·</span>
                      <button className={btnLink} onClick={() => openEdit(u)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tlw-navy-deep/40 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-tlw-2xl bg-tlw-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[14px] font-medium text-tlw-navy-deep">{editing.name}</h3>
            <div className="mt-3 space-y-2">
              <label className="block text-[11px] text-tlw-warm-gray">Cohort
                <select className={input} value={editForm.cohortId} onChange={(e) => setEditForm({ ...editForm, cohortId: e.target.value })}>
                  <option value="">None</option>
                  {cohorts.filter((c) => cohortStatus(c.status) !== 'archived' || c.id === editForm.cohortId).map((c) => <option key={c.id} value={c.id}>{c.company_name} · {c.name}</option>)}
                </select>
              </label>
              <label className="block text-[11px] text-tlw-warm-gray">Company
                <select className={input} value={editForm.companyId} onChange={(e) => setEditForm({ ...editForm, companyId: e.target.value })}>
                  <option value="">None</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block text-[11px] text-tlw-warm-gray">Access ends
                <input className={input} type="date" value={editForm.accessExpiresAt} onChange={(e) => setEditForm({ ...editForm, accessExpiresAt: e.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[11px] text-tlw-warm-gray">Max assessments (default 5)
                  <input className={input} type="number" min={1} value={editForm.maxAssessments} onChange={(e) => setEditForm({ ...editForm, maxAssessments: e.target.value })} />
                </label>
                <label className="block text-[11px] text-tlw-warm-gray">Max documents (default 10)
                  <input className={input} type="number" min={1} value={editForm.maxDocuments} onChange={(e) => setEditForm({ ...editForm, maxDocuments: e.target.value })} />
                </label>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className={btnSecondary} onClick={() => setEditing(null)}>Cancel</button>
              <button className={btnPrimary} disabled={busy === editing.id} onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
