'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

interface PdfRow {
  id: string
  name: string
  size_bytes: number | null
  created_at: string
}

function fmtSize(b: number | null): string {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

/** Upload, view and delete the PDFs in one PDF-Resources folder. */
export function FolderPdfs({ folderId }: { folderId: string }) {
  const [pdfs, setPdfs] = useState<PdfRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/library/pdfs?folderId=${encodeURIComponent(folderId)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load PDFs')
      setPdfs(data.pdfs || [])
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }, [folderId])

  useEffect(() => {
    load()
  }, [load])

  async function upload(file: File) {
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('folderId', folderId)
      form.append('file', file)
      const res = await fetch('/api/library/pdfs', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function view(id: string) {
    try {
      const res = await fetch(`/api/library/pdfs/${id}`)
      const data = await res.json()
      if (res.ok && data.url) window.open(data.url, '_blank', 'noopener')
    } catch {
      /* ignore */
    }
  }

  async function remove(id: string) {
    setDeleting(id)
    try {
      const res = await fetch(`/api/library/pdfs/${id}`, { method: 'DELETE' })
      if (res.ok) await load()
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-tlw-warm-gray">PDF files up to 4 MB.</p>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload(f)
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-tlw-lg bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {uploading ? 'Uploading…' : '↑ Upload PDF'}
          </button>
        </div>
      </div>

      {error && <p className="text-[13px] text-tlw-signal-orange">{error}</p>}

      {loading ? (
        <div className="h-24 animate-pulse rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface/60" />
      ) : pdfs.length === 0 ? (
        <div className="rounded-tlw-xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 p-8 text-center">
          <p className="text-[13px] text-tlw-warm-gray">No PDFs in this folder yet. Upload one to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pdfs.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-4 rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-4"
            >
              <button onClick={() => view(p.id)} className="min-w-0 text-left">
                <p className="truncate text-[14px] font-medium text-tlw-navy-deep hover:underline">{p.name}</p>
                {p.size_bytes != null && <p className="text-[11px] text-tlw-warm-gray">{fmtSize(p.size_bytes)}</p>}
              </button>
              <div className="flex shrink-0 items-center gap-3 text-[12px] font-medium">
                <button onClick={() => view(p.id)} className="text-tlw-warm-gray hover:text-tlw-espresso">
                  view
                </button>
                <button onClick={() => remove(p.id)} disabled={deleting === p.id} className="text-red-600 hover:underline disabled:opacity-40">
                  {deleting === p.id ? 'deleting…' : 'delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
