'use client'
/**
 * One portal user (supervisor-only). Everything the command center knows about
 * them in one place: identity + access, usage, coach-private key info, the
 * documents on file (upload / retry / remove), recent mail, and the event
 * timeline. Reads /api/admin/portal-users/[id]; every action here is audited.
 * Key info is the COACH side of the wall — it never reaches the portal.
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/app/components/layout/PageHeader'
import { api, btnLink, btnPrimary, btnSecondary, Chip, ErrorLine, fmtDate, input, Section, statusTone, uploadUserDocument } from '../../ui'
import type { PortalUser } from '../../PortalUsersPanel'
import type { Company } from '../../CompaniesPanel'

type Doc = {
  id: string
  kind: string
  title: string | null
  size_bytes: number | null
  extraction_status: string
  extraction_error: string | null
  uploader_role: string
  visible_to_coach: boolean
  assessment_date: string | null
  instrument: string | null
  created_at: string
}
type Detail = {
  user: PortalUser
  keyInfo: string | null
  profile: { phone: string | null; timezone: string | null; preferred_name: string | null; status: string | null; created_at: string | null }
  documents: Doc[]
  events: Array<{ event_type: string; metadata: Record<string, unknown> | null; created_at: string }>
  communications: Array<{ id: string; type: string; direction: string; subject: string | null; status: string; sent_at: string }>
}

const KIND_LABEL: Record<string, string> = { assessment_360: '360 report', personnel_review: 'Personnel review (private to the client)', general: 'Document', company_doc: 'Company document' }
const KIND_LABELS: Record<PortalUser['kind'], string> = { coaching: 'coaching', coaching_zf: 'coaching + ZF', standalone: 'standalone ZF', enterprise: 'enterprise' }

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function PortalUserPage({ params }: { params: { id: string } }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [denied, setDenied] = useState(false)

  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', companyId: '', cohortId: '', accessExpiresAt: '' })
  const [keyInfo, setKeyInfo] = useState('')
  const [keyDirty, setKeyDirty] = useState(false)

  const [docKind, setDocKind] = useState<'assessment_360' | 'general'>('assessment_360')
  const [docTitle, setDocTitle] = useState('')
  const [confirmName, setConfirmName] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    try {
      const [d, c] = await Promise.all([api<Detail>(`/api/admin/portal-users/${params.id}`), api<{ companies: Company[] }>('/api/admin/companies').catch(() => ({ companies: [] }))])
      setDetail(d)
      setCompanies(c.companies)
      setForm({
        name: d.user.name,
        email: d.user.email || '',
        phone: d.profile.phone || '',
        companyId: d.user.company_id || '',
        cohortId: d.user.cohort_id || '',
        accessExpiresAt: d.user.portal_access_expires_at?.slice(0, 10) || '',
      })
      if (!keyDirty) setKeyInfo(d.keyInfo || '')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load.'
      if (/Supervisor|403|Unauthorized/i.test(msg)) setDenied(true)
      setError(msg)
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  async function patch(body: Record<string, unknown>, ok: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api(`/api/admin/portal-users/${params.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      setNotice(ok)
      await load()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
      return false
    } finally {
      setBusy(false)
    }
  }
  async function saveProfile() {
    const ok = await patch({ name: form.name, email: form.email, phone: form.phone, companyId: form.companyId || null, cohortId: form.cohortId || null, accessExpiresAt: form.accessExpiresAt || null }, 'Saved.')
    if (ok) setEdit(false)
  }
  async function saveKeyInfo() {
    const ok = await patch({ keyInfo }, 'Key info saved.')
    if (ok) setKeyDirty(false)
  }
  async function invite() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const d = await api<{ sentTo: string; via: string; warning?: string }>(`/api/admin/portal-users/${params.id}/invite`, { method: 'POST' })
      setNotice(`Invitation sent to ${d.sentTo} via ${d.via === 'resend' ? 'the portal address' : 'Gmail'}.${d.warning ? ` ${d.warning}` : ''}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send.')
    } finally {
      setBusy(false)
    }
  }
  async function upload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const r = await uploadUserDocument(params.id, file, docKind, { title: docTitle.trim() || undefined, confirmName })
      setNotice(r.message)
      setDocTitle('')
      setConfirmName(false)
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }
  async function retry(doc: Doc, confirm: boolean) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const d = await api<{ message: string }>(`/api/admin/documents/${doc.id}`, { method: 'POST', body: JSON.stringify({ confirmName: confirm }) })
      setNotice(d.message)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed.')
    } finally {
      setBusy(false)
    }
  }
  async function removeDoc(doc: Doc) {
    if (!window.confirm(`Remove "${doc.title || KIND_LABEL[doc.kind] || 'this document'}"? This deletes the file.`)) return
    setBusy(true)
    setError('')
    try {
      await api(`/api/admin/documents/${doc.id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove.')
    } finally {
      setBusy(false)
    }
  }

  const cohorts = companies.flatMap((c) => c.cohorts.map((k) => ({ ...k, company_name: c.name })))
  const u = detail?.user

  return (
    <>
      <PageHeader backHref="/business-center/portal" backLabel="Client Portal" title={u ? u.name : 'Portal user'} subtitle={u ? `${KIND_LABELS[u.kind]}${u.company_name ? ` · ${u.company_name}` : ''}${u.cohort_name ? ` · ${u.cohort_name}` : ''}` : ''} />
      {denied ? (
        <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6 text-[14px] text-tlw-espresso">Supervisor access required.</div>
      ) : !detail || !u ? (
        <p className="text-[13px] text-tlw-warm-gray">{error || 'Loading…'}</p>
      ) : (
        <div className="space-y-4">
          {notice && <p className="text-[12px] text-emerald-700">{notice}</p>}
          <ErrorLine error={error} />

          {/* Identity + access */}
          <Section
            title="Identity & access"
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <button className={btnLink} disabled={busy || !u.email} onClick={invite}>{u.portal.invitedAt ? 'Resend portal link' : 'Invite to portal'}</button>
                {u.has_coach_relationship && <Link className={btnLink} href={`/clients/${u.id}`}>Coach workspace →</Link>}
                {!edit && <button className={btnLink} onClick={() => setEdit(true)}>Edit</button>}
              </div>
            }
          >
            {edit ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name (as on their report)" />
                <input className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
                <input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" />
                <select className={input} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value, cohortId: '' })}>
                  <option value="">No company</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className={input} value={form.cohortId} onChange={(e) => setForm({ ...form, cohortId: e.target.value })} disabled={!form.companyId}>
                  <option value="">No cohort</option>
                  {cohorts.filter((c) => c.company_id === form.companyId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <label className="text-[11px] text-tlw-warm-gray">
                  Access ends
                  <input className={input} type="date" value={form.accessExpiresAt} onChange={(e) => setForm({ ...form, accessExpiresAt: e.target.value })} />
                </label>
                <div className="flex gap-2 sm:col-span-3">
                  <button className={btnPrimary} disabled={busy} onClick={saveProfile}>{busy ? 'Saving…' : 'Save'}</button>
                  <button className={btnSecondary} onClick={() => setEdit(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                <div><dt className="text-[11px] uppercase tracking-wider text-tlw-warm-gray">Email</dt><dd className="text-tlw-espresso">{u.email || '—'}</dd></div>
                <div><dt className="text-[11px] uppercase tracking-wider text-tlw-warm-gray">Phone</dt><dd className="text-tlw-espresso">{detail.profile.phone || '—'}</dd></div>
                <div><dt className="text-[11px] uppercase tracking-wider text-tlw-warm-gray">Goes by</dt><dd className="text-tlw-espresso">{detail.profile.preferred_name || u.name.split(' ')[0]}</dd></div>
                <div><dt className="text-[11px] uppercase tracking-wider text-tlw-warm-gray">Timezone</dt><dd className="text-tlw-espresso">{detail.profile.timezone || '—'}</dd></div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-tlw-warm-gray">360 debrief</dt>
                  <dd>
                    <button className={btnLink} disabled={busy} onClick={() => patch({ assessments: !u.assessments_enabled }, u.assessments_enabled ? '360 switched off.' : '360 switched on.')}>
                      {u.assessments_enabled ? <Chip tone="green">on</Chip> : <Chip>off</Chip>} <span className="ml-1">switch {u.assessments_enabled ? 'off' : 'on'}</span>
                    </button>
                  </dd>
                </div>
                <div><dt className="text-[11px] uppercase tracking-wider text-tlw-warm-gray">Access ends</dt><dd className="text-tlw-espresso">{fmtDate(u.portal_access_expires_at)}</dd></div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-tlw-warm-gray">Portal</dt>
                  <dd className="text-tlw-espresso">
                    {u.portal.lastSeenAt ? `last seen ${fmtDateTime(u.portal.lastSeenAt)}` : u.portal.invitedAt ? `invited ${fmtDate(u.portal.invitedAt)}, not yet in` : 'not invited'}
                    {u.portal.username && <span className="ml-2 text-tlw-warm-gray">@{u.portal.username}</span>}
                    {u.portal.locked && <span className="ml-2"><Chip tone="red">locked</Chip></span>}
                  </dd>
                </div>
                <div><dt className="text-[11px] uppercase tracking-wider text-tlw-warm-gray">Added</dt><dd className="text-tlw-espresso">{fmtDate(detail.profile.created_at)}</dd></div>
              </dl>
            )}
          </Section>

          {/* Usage */}
          <Section title="Usage" sub="From the portal's outcomes log — what they have actually done in there.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ['Chat messages', u.engagement.chat_messages],
                ['Goals created', u.engagement.goals_created],
                ['Report views', u.engagement.downloads],
                ['Coach clicks', u.engagement.talk_to_coach_clicks],
                ['Documents', u.document_count],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-tlw-lg bg-tlw-canvas px-3 py-2 text-center">
                  <p className="text-[16px] font-semibold tabular-nums text-tlw-navy-deep">{value}</p>
                  <p className="text-[10px] text-tlw-warm-gray">{label}</p>
                </div>
              ))}
            </div>
            {detail.events.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[12px] font-medium text-tlw-signal-orange">Event timeline ({detail.events.length})</summary>
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-[12px]">
                  {detail.events.map((e, i) => (
                    <li key={i} className="flex justify-between gap-3 text-tlw-espresso">
                      <span>{e.event_type.replace(/_/g, ' ')}</span>
                      <span className="shrink-0 text-tlw-warm-gray">{fmtDateTime(e.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Section>

          {/* Key info — coach-private */}
          <Section title="Key info" sub="Coach-private reference: role, boss, context, anything worth remembering. Never shown to the client and never part of the assistant's context.">
            <textarea
              className={`${input} min-h-[96px]`}
              value={keyInfo}
              onChange={(e) => {
                setKeyInfo(e.target.value)
                setKeyDirty(true)
              }}
              placeholder="e.g. VP Operations, reports to the COO; two direct reports; wants to move into a GM role."
            />
            <div className="mt-2 flex items-center gap-3">
              <button className={btnPrimary} disabled={busy || !keyDirty} onClick={saveKeyInfo}>Save key info</button>
              {keyDirty && <span className="text-[12px] text-tlw-warm-gray">unsaved</span>}
            </div>
          </Section>

          {/* Documents */}
          <Section title="Documents" sub="Everything on file for this person. A 360 that reads clean switches their debrief on; a name mismatch is held until a human confirms it.">
            {detail.documents.length === 0 ? (
              <p className="text-[13px] text-tlw-warm-gray">Nothing on file yet.</p>
            ) : (
              <ul className="divide-y divide-tlw-warm-gray/10">
                {detail.documents.map((d) => {
                  const mismatch = d.extraction_status === 'failed' && /^name_mismatch/.test(d.extraction_error || '')
                  const privateReview = d.kind === 'personnel_review'
                  return (
                    <li key={d.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-[13px]">
                      <div className="min-w-0">
                        <p className="font-medium text-tlw-navy-deep">
                          {privateReview ? KIND_LABEL[d.kind] : d.title || KIND_LABEL[d.kind] || d.kind}{' '}
                          {!privateReview && <Chip tone={statusTone(d.extraction_status)}>{d.extraction_status}</Chip>}
                        </p>
                        <p className="text-[12px] text-tlw-warm-gray">
                          {KIND_LABEL[d.kind] || d.kind} · {fmtDate(d.assessment_date || d.created_at)} · added by {d.uploader_role}
                          {d.instrument ? ` · ${d.instrument}` : ''}
                          {!privateReview && d.extraction_error && <span className="ml-1 text-tlw-signal-orange">{d.extraction_error.replace(/^name_mismatch:\s*/, 'name mismatch: ')}</span>}
                        </p>
                      </div>
                      {!privateReview && (
                        <span className="flex shrink-0 items-center gap-3">
                          {mismatch && <button className={btnLink} disabled={busy} onClick={() => retry(d, true)}>Accept name & retry</button>}
                          {d.extraction_status !== 'complete' && !mismatch && d.kind !== 'general' && <button className={btnLink} disabled={busy} onClick={() => retry(d, false)}>Retry</button>}
                          <button className={btnLink} disabled={busy} onClick={() => removeDoc(d)}>Remove</button>
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="mt-4 rounded-tlw-xl bg-tlw-canvas p-3">
              <p className="text-[12px] font-medium text-tlw-espresso">Add a document</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select className={input} value={docKind} onChange={(e) => setDocKind(e.target.value as typeof docKind)}>
                  <option value="assessment_360">360 report (PDF)</option>
                  <option value="general">Other document (PDF, Word, or text)</option>
                </select>
                <input className={input} value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Title (optional)" />
                <input ref={fileRef} type="file" accept={docKind === 'assessment_360' ? '.pdf' : '.pdf,.docx,.txt,.md'} className={input} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <button className={btnPrimary} disabled={busy} onClick={upload}>{busy ? 'Working…' : 'Upload'}</button>
                {docKind === 'assessment_360' && (
                  <label className="flex items-center gap-2 text-[12px] text-tlw-espresso">
                    <input type="checkbox" checked={confirmName} onChange={(e) => setConfirmName(e.target.checked)} />
                    I have checked this report is {u.name.split(' ')[0]}&apos;s (accept a name mismatch)
                  </label>
                )}
              </div>
            </div>
          </Section>

          {/* Recent mail */}
          {detail.communications.length > 0 && (
            <Section title="Recent mail" sub="The last few messages the platform sent to or received from them.">
              <ul className="divide-y divide-tlw-warm-gray/10 text-[13px]">
                {detail.communications.map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate text-tlw-espresso">
                      {c.direction === 'inbound' ? '← ' : '→ '}{c.subject || c.type} {c.status === 'failed' && <Chip tone="red">failed</Chip>}
                    </span>
                    <span className="shrink-0 text-[12px] text-tlw-warm-gray">{fmtDateTime(c.sent_at)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </>
  )
}
