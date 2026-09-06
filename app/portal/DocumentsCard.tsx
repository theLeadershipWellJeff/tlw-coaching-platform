'use client'
import { useEffect, useRef, useState } from 'react'
import { InfoPopover } from './InfoPopover'

type Doc = {
  id: string
  kind: 'assessment_360' | 'personnel_review' | 'general' | string
  title: string | null
  extraction_status: string
  uploader_role: string
  visible_to_coach: boolean
  assessment_date: string | null
  created_at: string
}

const KIND_LABEL: Record<string, string> = {
  assessment_360: '360 report',
  personnel_review: 'Personnel review',
  general: 'Document',
  company_doc: 'Company document',
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * "Your documents" — everything the client (or their coach) has added to their
 * portal. Upload a 360 report, a private personnel review, or any other
 * document; download anything, any time; choose what a coach can see; remove
 * what they no longer want. Other documents join the assistant's context, so
 * the portal works as a general coaching tool, not only a 360 debrief.
 */
export function DocumentsCard({ hasCoach }: { hasCoach: boolean }) {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [kind, setKind] = useState<'general' | 'assessment_360' | 'personnel_review'>('general')
  const [title, setTitle] = useState('')
  const [share, setShare] = useState(hasCoach)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    try {
      const res = await fetch('/api/portal/documents')
      const d = res.ok ? await res.json() : { documents: [] }
      setDocs(d.documents || [])
    } catch {
      setDocs([])
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function upload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', kind)
      if (title.trim()) fd.append('title', title.trim())
      if (kind !== 'personnel_review') fd.append('visibleToCoach', share ? '1' : '0')
      const res = await fetch('/api/portal/documents', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not upload that file.')
      setMessage(d.message || 'Added.')
      setTitle('')
      if (fileRef.current) fileRef.current.value = ''
      await load()
      if (kind === 'assessment_360' && d.document?.extraction_status === 'complete') window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload that file.')
    } finally {
      setBusy(false)
    }
  }
  async function toggleShare(doc: Doc) {
    setBusy(true)
    try {
      await fetch(`/api/portal/documents/${doc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visibleToCoach: !doc.visible_to_coach }) })
      await load()
    } finally {
      setBusy(false)
    }
  }
  async function remove(doc: Doc) {
    if (!window.confirm(`Remove "${doc.title || KIND_LABEL[doc.kind] || 'this document'}"? This deletes the file.`)) return
    setBusy(true)
    try {
      await fetch(`/api/portal/documents/${doc.id}`, { method: 'DELETE' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const accept = kind === 'assessment_360' ? '.pdf' : '.pdf,.docx,.txt,.md'

  return (
    <div id="your-documents" className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">Your documents</h2>
        <InfoPopover
          label="Your documents"
          text="Add a 360 report, a personnel review (private to you), or any document you want the assistant to know about — a role description, a plan, feedback you received. Download anything any time. You choose what your coach can see."
        />
      </div>

      <div className="mt-3">
        {docs === null ? (
          <p className="text-[13px] text-tlw-warm-gray">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="text-[13px] text-tlw-warm-gray">Nothing added yet.</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[13px]">
                <div className="min-w-0">
                  <p className="truncate font-medium text-tlw-navy-deep">{d.title || KIND_LABEL[d.kind] || 'Document'}</p>
                  <p className="text-[12px] text-tlw-warm-gray">
                    {KIND_LABEL[d.kind] || d.kind} · {fmtDate(d.assessment_date || d.created_at)}
                    {d.extraction_status === 'failed' && ' · could not be read — support has been notified'}
                    {d.extraction_status === 'unsupported' && ' · layout not recognised — support has been notified'}
                    {d.kind === 'personnel_review' && ' · private to you'}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-3 text-[12px]">
                  <a href={`/api/portal/documents/${d.id}/download`} className="font-medium text-tlw-signal-orange hover:underline">Download</a>
                  {hasCoach && d.kind !== 'personnel_review' && (
                    <button onClick={() => toggleShare(d)} disabled={busy} className="text-tlw-warm-gray hover:text-tlw-espresso">
                      {d.visible_to_coach ? 'Shared with coach' : 'Not shared'}
                    </button>
                  )}
                  <button onClick={() => remove(d)} disabled={busy} className="text-tlw-warm-gray hover:text-tlw-espresso">Remove</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 rounded-tlw-xl bg-tlw-canvas p-3">
        <p className="text-[12px] font-medium text-tlw-espresso">Add a document</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange">
            <option value="general">Other document (PDF, Word, or text)</option>
            <option value="assessment_360">360 feedback report (PDF)</option>
            <option value="personnel_review">Personnel review — private to me</option>
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange" />
          <input ref={fileRef} type="file" accept={accept} className="rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso sm:col-span-2" />
        </div>
        {kind === 'personnel_review' ? (
          <p className="mt-2 text-[12px] text-tlw-warm-gray">A personnel review is never visible to any coach. Only you can open it.</p>
        ) : hasCoach ? (
          <label className="mt-2 flex items-center gap-2 text-[12px] text-tlw-espresso">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
            Let my coach see this document
          </label>
        ) : null}
        <div className="mt-2 flex items-center gap-3">
          <button onClick={upload} disabled={busy} className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50">
            {busy ? 'Uploading…' : 'Upload'}
          </button>
          {message && <p className="text-[12px] text-emerald-700">{message}</p>}
          {error && <p className="text-[12px] text-tlw-signal-orange">{error}</p>}
        </div>
      </div>
    </div>
  )
}
