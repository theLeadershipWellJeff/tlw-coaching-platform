'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/app/components/shared/Modal'

interface DriveFile {
  id: string
  name: string
  modifiedTime: string
}

function fmt(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ImportTranscriptsModal({
  clientId,
  clientName,
  onClose,
  onImported,
}: {
  clientId: string
  clientName: string
  onClose: () => void
  onImported: () => void
}) {
  const [files, setFiles] = useState<DriveFile[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/drive/transcripts')
      .then(async (r) => ({ ok: r.ok, data: await r.json() }))
      .then(({ ok, data }) => {
        if (cancelled) return
        if (!ok) setError(data.error || 'Could not list Drive files.')
        else setFiles(data.files || [])
      })
      .catch(() => !cancelled && setError('Network error.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  function toggle(id: string) {
    setPicked((p) => {
      const next = new Set(p)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function run() {
    setError('')
    setProgress('Importing…')
    try {
      const res = await fetch(`/api/clients/${clientId}/import-transcripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds: Array.from(picked) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed.')

      const toScore: string[] = (data.results || [])
        .filter((r: any) => r.transcriptId && !r.duplicate)
        .map((r: any) => r.transcriptId)
      const dupes = (data.results || []).filter((r: any) => r.duplicate).length

      // Score each transcript one request at a time (keeps within timeouts).
      let scored = 0
      for (const tid of toScore) {
        setProgress(`Scoring ${scored + 1} of ${toScore.length}…`)
        await fetch(`/api/transcripts/${tid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }).catch(() => {})
        scored++
      }

      onImported()
      setProgress(null)
      setDone(
        `Imported ${toScore.length} transcript${toScore.length === 1 ? '' : 's'}` +
          (dupes ? ` (${dupes} already on file)` : '') +
          '. Scored reports are on the Scorecard.'
      )
    } catch (e: any) {
      setProgress(null)
      setError(e.message)
    }
  }

  const busy = progress !== null

  return (
    <Modal title={`Import transcripts for ${clientName}`} onClose={busy ? () => {} : onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-[13px]" style={{ color: 'var(--color-success)' }}>{done}</p>
          <div className="flex justify-end">
            <button onClick={onClose} className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream hover:opacity-90">
              Done
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-tlw-md bg-tlw-canvas" />
          ))}
        </div>
      ) : error ? (
        <div className="space-y-4">
          <p className="text-[13px] text-tlw-signal-orange">{error}</p>
          <div className="flex justify-end">
            <button onClick={onClose} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
              Close
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12px] text-tlw-warm-gray">
            Pick the transcripts from your Plaud-Transcripts folder that belong to {clientName}. They&apos;ll
            be attached to this client and scored.
          </p>

          <div className="max-h-72 space-y-1 overflow-y-auto rounded-tlw-lg border border-tlw-warm-gray/15 p-1">
            {files.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] text-tlw-warm-gray">No files in the folder.</p>
            ) : (
              files.map((f) => (
                <label
                  key={f.id}
                  className="flex cursor-pointer items-center gap-3 rounded-tlw-md px-2 py-2 hover:bg-tlw-canvas"
                >
                  <input
                    type="checkbox"
                    checked={picked.has(f.id)}
                    onChange={() => toggle(f.id)}
                    disabled={busy}
                    className="accent-tlw-navy-rich"
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-tlw-espresso">{f.name}</span>
                  <span className="shrink-0 text-[11px] text-tlw-warm-gray">{fmt(f.modifiedTime)}</span>
                </label>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-[12px] text-tlw-warm-gray">
              {progress || `${picked.size} selected`}
            </span>
            <div className="flex items-center gap-3">
              <button onClick={onClose} disabled={busy} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso disabled:opacity-40">
                Cancel
              </button>
              <button
                onClick={run}
                disabled={busy || picked.size === 0}
                className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy ? 'Working…' : `Import ${picked.size || ''}`.trim()}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
