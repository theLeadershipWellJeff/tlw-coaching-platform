'use client'
/** Small shared bits for the debrief command-center panels. */
import type { ReactNode, RefObject } from 'react'

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `Request failed (${res.status})`)
  return d as T
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function Chip({ tone = 'gray', children }: { tone?: 'gray' | 'green' | 'amber' | 'red' | 'navy'; children: ReactNode }) {
  const styles: Record<string, string> = {
    gray: 'bg-tlw-canvas text-tlw-warm-gray',
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    navy: 'bg-tlw-navy-deep/10 text-tlw-navy-deep',
  }
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[tone]}`}>{children}</span>
}

export function statusTone(status: string | null | undefined): 'gray' | 'green' | 'amber' | 'red' {
  if (status === 'complete') return 'green'
  if (status === 'failed') return 'red'
  if (status === 'unsupported') return 'amber'
  return 'gray'
}

export const input =
  'w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange'
export const btnPrimary =
  'rounded-tlw-lg bg-tlw-navy-deep px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50'
export const btnSecondary =
  'rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas disabled:opacity-50'
export const btnLink = 'text-[12px] font-medium text-tlw-signal-orange hover:underline disabled:opacity-50'

export function Section({ title, sub, actions, children }: { title: string; sub?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">{title}</h2>
          {sub && <p className="mt-0.5 text-[12px] text-tlw-warm-gray">{sub}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function ErrorLine({ error }: { error: string }) {
  return error ? <p className="mt-2 text-[12px] text-tlw-signal-orange">{error}</p> : null
}

/** Upload one document for a portal user (per-user page + add-participant forms). */
export async function uploadUserDocument(
  userId: string,
  file: File,
  kind: 'assessment_360' | 'general',
  opts: { title?: string; confirmName?: boolean } = {}
): Promise<{ document: { id: string; extraction_status: string; extraction_error: string | null }; message: string }> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('kind', kind)
  if (opts.title) fd.append('title', opts.title)
  if (opts.confirmName) fd.append('confirmName', '1')
  const res = await fetch(`/api/admin/portal-users/${userId}/documents`, { method: 'POST', body: fd })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `Upload failed (${res.status})`)
  return d
}

/**
 * Upload the files picked on an add-participant form, one after another, and
 * describe each outcome. Never throws — a failed file is reported, the rest go on.
 */
export async function uploadPickedDocuments(userId: string, report: File | null, others: File[]): Promise<string[]> {
  const notes: string[] = []
  if (report) {
    try {
      const r = await uploadUserDocument(userId, report, 'assessment_360')
      notes.push(`360 report: ${r.document.extraction_status}${r.document.extraction_error ? ` — ${r.document.extraction_error}` : ''}`)
    } catch (e) {
      notes.push(`360 report failed: ${e instanceof Error ? e.message : 'upload error'}`)
    }
  }
  for (const f of others) {
    try {
      const r = await uploadUserDocument(userId, f, 'general')
      notes.push(`${f.name}: ${r.document.extraction_status}`)
    } catch (e) {
      notes.push(`${f.name} failed: ${e instanceof Error ? e.message : 'upload error'}`)
    }
  }
  return notes
}

/** The two file inputs an add-participant form carries (360 PDF + other documents). */
export function DocumentPickers({
  reportRef,
  othersRef,
  className = '',
}: {
  reportRef: RefObject<HTMLInputElement>
  othersRef: RefObject<HTMLInputElement>
  className?: string
}) {
  return (
    <div className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${className}`}>
      <label className="text-[11px] text-tlw-warm-gray">
        360 report (PDF, optional — switches the 360 on when it reads clean)
        <input ref={reportRef} type="file" accept=".pdf" className={input} />
      </label>
      <label className="text-[11px] text-tlw-warm-gray">
        Other documents (PDF, Word, or text — join their chat context)
        <input ref={othersRef} type="file" multiple accept=".pdf,.docx,.txt,.md" className={input} />
      </label>
    </div>
  )
}
