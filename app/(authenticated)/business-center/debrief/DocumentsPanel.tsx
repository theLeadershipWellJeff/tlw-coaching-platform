'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, btnLink, btnPrimary, Chip, ErrorLine, fmtDate, input, Section, statusTone } from './ui'
import type { Company } from './CompaniesPanel'

type Doc = {
  id: string
  client_id: string
  kind: string
  title: string | null
  extraction_status: string
  extraction_error: string | null
  uploader_role: string
  visible_to_coach: boolean
  assessment_date: string | null
  instrument: string | null
  created_at: string
  client: { id: string; name: string; email: string | null } | null
}
type BulkResult = {
  placed: Array<{ file: string; client_name: string; status: string }>
  held: Array<{ file: string; reason: string; participant_name?: string; candidates?: string[] }>
}

export function DocumentsPanel({ companies }: { companies: Company[] }) {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [filter, setFilter] = useState<'attention' | 'all'>('attention')
  const [error, setError] = useState('')
  const [cohortId, setCohortId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cohorts = useMemo(() => companies.flatMap((c) => c.cohorts.map((k) => ({ ...k, company_name: c.name }))), [companies])

  async function load() {
    try {
      const d = await api<{ documents: Doc[] }>('/api/admin/documents')
      setDocs(d.documents)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load.')
      setDocs([])
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function upload() {
    const files = fileRef.current?.files
    if (!files?.length) return
    setUploading(true)
    setError('')
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('cohortId', cohortId)
      Array.from(files).forEach((f) => fd.append('files', f))
      const res = await fetch('/api/admin/documents', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Upload failed.')
      setResult(d)
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }
  async function retry(doc: Doc, confirmName: boolean) {
    if (confirmName && !window.confirm(`Confirm this report belongs to ${doc.client?.name || 'this client'}? The name printed on it did not match.`)) return
    setBusy(doc.id)
    setError('')
    try {
      await api(`/api/admin/documents/${doc.id}`, { method: 'POST', body: JSON.stringify({ confirmName }) })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed.')
    } finally {
      setBusy(null)
    }
  }
  async function remove(doc: Doc) {
    if (!window.confirm(`Delete "${doc.title || 'this document'}" for ${doc.client?.name || 'this client'}? This removes the file too.`)) return
    setBusy(doc.id)
    setError('')
    try {
      await api(`/api/admin/documents/${doc.id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.')
    } finally {
      setBusy(null)
    }
  }

  const shown = (docs || []).filter((d) => filter === 'all' || d.extraction_status !== 'complete')

  return (
    <div className="space-y-4">
      <Section title="Bulk upload" sub="Pick a cohort and the reports. Each PDF is read first and matched by the participant name on its cover; exactly one match files it, anything else is held for you to place by hand. Nothing becomes client-visible unless extraction completes.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select className={input} value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
            <option value="">Match against all portal users</option>
            {cohorts.map((c) => <option key={c.id} value={c.id}>{c.company_name} · {c.name}</option>)}
          </select>
          <input ref={fileRef} type="file" accept=".pdf" multiple className={input} />
          <button className={btnPrimary} disabled={uploading} onClick={upload}>{uploading ? 'Reading reports…' : 'Upload & verify'}</button>
        </div>
        <ErrorLine error={error} />
        {result && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[12px] font-semibold text-emerald-700">Placed ({result.placed.length})</p>
              <ul className="mt-1 space-y-0.5 text-[12px] text-tlw-espresso">
                {result.placed.map((p) => <li key={p.file}>{p.file} → {p.client_name} <Chip tone={statusTone(p.status)}>{p.status}</Chip></li>)}
              </ul>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-amber-800">Held ({result.held.length})</p>
              <ul className="mt-1 space-y-0.5 text-[12px] text-tlw-espresso">
                {result.held.map((h) => (
                  <li key={h.file}>
                    {h.file}{h.participant_name ? ` (report for "${h.participant_name}")` : ''}: {h.reason}
                    {h.candidates && h.candidates.length > 1 && ` — ${h.candidates.join(', ')}`}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Documents"
        sub="Failed and unsupported reports need a human: confirm a name mismatch, retry after a parser fix, or delete a wrong file. Personnel reviews are the client's alone and are never opened here."
        actions={
          <div className="flex gap-1 text-[12px]">
            <button className={`rounded-tlw-lg px-2 py-1 ${filter === 'attention' ? 'bg-tlw-navy-deep text-white' : 'text-tlw-espresso hover:bg-tlw-canvas'}`} onClick={() => setFilter('attention')}>Needs attention</button>
            <button className={`rounded-tlw-lg px-2 py-1 ${filter === 'all' ? 'bg-tlw-navy-deep text-white' : 'text-tlw-espresso hover:bg-tlw-canvas'}`} onClick={() => setFilter('all')}>All</button>
          </div>
        }
      >
        {docs === null ? (
          <p className="text-[13px] text-tlw-warm-gray">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="text-[13px] text-tlw-warm-gray">{filter === 'attention' ? 'Nothing needs attention.' : 'No documents yet.'}</p>
        ) : (
          <ul className="divide-y divide-tlw-warm-gray/10">
            {shown.map((d) => {
              const mismatch = d.extraction_status === 'failed' && (d.extraction_error || '').startsWith('name_mismatch')
              return (
                <li key={d.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-tlw-navy-deep">
                      {d.client?.name || 'Unknown client'} <span className="font-normal text-tlw-warm-gray">· {d.kind.replace('_', ' ')}{d.assessment_date ? ` · ${fmtDate(d.assessment_date)}` : ''}</span>
                    </p>
                    <p className="text-[12px] text-tlw-warm-gray">
                      <Chip tone={statusTone(d.extraction_status)}>{d.extraction_status}</Chip>
                      <span className="ml-2">{d.title}</span> · uploaded by {d.uploader_role} · {fmtDate(d.created_at)}
                    </p>
                    {d.extraction_error && d.extraction_status !== 'complete' && <p className="mt-0.5 text-[12px] text-tlw-espresso">{d.extraction_error}</p>}
                  </div>
                  {d.kind !== 'personnel_review' && (
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      {mismatch && <button className={btnLink} disabled={busy === d.id} onClick={() => retry(d, true)}>Confirm it&apos;s theirs</button>}
                      {d.extraction_status !== 'complete' && <button className={btnLink} disabled={busy === d.id} onClick={() => retry(d, false)}>Retry</button>}
                      <button className={btnLink} disabled={busy === d.id} onClick={() => remove(d)}>Delete</button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}
