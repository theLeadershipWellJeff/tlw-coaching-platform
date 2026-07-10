'use client'
import { useRef, useState } from 'react'
import { Modal } from '@/app/components/shared/Modal'
import { startScoring } from '@/lib/scoring-jobs'

// Keep in sync with lib/transcripts/extract.ts (server-only — don't import it here).
const TRANSCRIPT_FILE_ACCEPT = '.md,.markdown,.txt,.text,.vtt,.srt,.docx,.pdf'

/**
 * Import a transcript from a file the coach picks off their machine —
 * md/txt/vtt/srt/docx/pdf all work (the server extracts the text). The file is
 * attached straight to this client (no matching), and scoring runs in the
 * background afterward (same fire-and-forget jobs as the review queue), so the
 * coach isn't held on the ~2-minute engine run. Replaces the old Drive-folder
 * "Import from Plaud" picker.
 */
export function ImportTranscriptModal({
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
  const [files, setFiles] = useState<File[]>([])
  const [score, setScore] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [failures, setFailures] = useState<string[]>([])
  const [done, setDone] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  function pick(list: FileList | null) {
    if (!list || list.length === 0) return
    setFiles((prev) => {
      const next = [...prev]
      for (const f of Array.from(list)) {
        if (!next.some((p) => p.name === f.name && p.size === f.size)) next.push(f)
      }
      return next
    })
    setDone(null)
    setFailures([])
  }

  async function run() {
    setBusy(true)
    setFailures([])
    const errors: string[] = []
    let imported = 0
    let duplicates = 0

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      setProgress(files.length > 1 ? `Importing ${i + 1} of ${files.length}…` : 'Importing…')
      try {
        const form = new FormData()
        form.append('file', f)
        const res = await fetch(`/api/clients/${clientId}/import-file`, { method: 'POST', body: form })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Import failed.')
        imported++
        if (data.duplicate) duplicates++
        if (score && data.transcriptId) {
          // Fire-and-forget — the score runs server-side (~2 min); progress
          // shows on the transcripts list and the Practice queue meanwhile.
          startScoring({
            transcriptId: data.transcriptId,
            label: data.title || f.name,
            body: { rescore: true },
          })
        }
      } catch (e: any) {
        errors.push(`${f.name}: ${e.message}`)
      }
    }

    setBusy(false)
    setProgress('')
    setFailures(errors)
    if (imported > 0) onImported()
    if (errors.length === 0) {
      setDone(
        `Imported ${imported} transcript${imported === 1 ? '' : 's'}` +
          (duplicates ? ` (${duplicates} already on file)` : '') +
          (score ? '. Scoring runs in the background (~2 min) — progress shows on the transcripts list.' : '.')
      )
    } else if (imported > 0) {
      setDone(null)
      setFiles((prev) => prev.filter((f) => errors.some((e) => e.startsWith(f.name + ':'))))
    }
  }

  return (
    <Modal title={`Import transcript for ${clientName}`} onClose={busy ? () => {} : onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-[13px]" style={{ color: 'var(--color-success)' }}>{done}</p>
          <div className="flex justify-end">
            <button onClick={onClose} className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream hover:opacity-90">
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12px] text-tlw-warm-gray">
            Pick the transcript file{files.length > 1 ? 's' : ''} to attach to {clientName}. Markdown, plain
            text, captions (.vtt/.srt), Word (.docx), and PDF all work.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept={TRANSCRIPT_FILE_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              pick(e.target.files)
              e.target.value = ''
            }}
          />

          {files.length === 0 ? (
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="w-full rounded-tlw-lg border border-dashed border-tlw-warm-gray/35 px-4 py-8 text-[13px] text-tlw-warm-gray transition-colors hover:border-tlw-warm-gray/60 hover:text-tlw-espresso"
            >
              Choose a file…
            </button>
          ) : (
            <div className="space-y-1 rounded-tlw-lg border border-tlw-warm-gray/15 p-1">
              {files.map((f) => (
                <div key={f.name + f.size} className="flex items-center gap-3 rounded-tlw-md px-2 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-tlw-espresso">{f.name}</span>
                  <span className="shrink-0 text-[11px] text-tlw-warm-gray">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                  {!busy && (
                    <button
                      onClick={() => setFiles((prev) => prev.filter((p) => p !== f))}
                      title="Remove"
                      aria-label={`Remove ${f.name}`}
                      className="rounded-md px-1.5 py-0.5 text-[13px] leading-none text-tlw-warm-gray transition-colors hover:bg-tlw-warm-gray/15 hover:text-tlw-espresso"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {!busy && (
                <button
                  onClick={() => inputRef.current?.click()}
                  className="w-full rounded-tlw-md px-2 py-1.5 text-left text-[12px] font-medium text-tlw-signal-orange hover:bg-tlw-canvas"
                >
                  + Add another file
                </button>
              )}
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-tlw-espresso">
            <input
              type="checkbox"
              checked={score}
              onChange={(e) => setScore(e.target.checked)}
              disabled={busy}
              className="accent-tlw-navy-rich"
            />
            Score {files.length > 1 ? 'these sessions' : 'this session'}
            <span className="text-[11px] text-tlw-warm-gray">(uncheck for orientations, teaching sessions, etc.)</span>
          </label>

          {failures.length > 0 && (
            <div className="space-y-1">
              {failures.map((f) => (
                <p key={f} className="text-[12px] text-tlw-signal-orange">{f}</p>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-[12px] text-tlw-warm-gray">{progress}</span>
            <div className="flex items-center gap-3">
              <button onClick={onClose} disabled={busy} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso disabled:opacity-40">
                Cancel
              </button>
              <button
                onClick={run}
                disabled={busy || files.length === 0}
                className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy ? 'Working…' : files.length > 1 ? `Import ${files.length}` : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
