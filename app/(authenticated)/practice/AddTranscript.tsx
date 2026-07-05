'use client'
import { useState } from 'react'
import Link from 'next/link'

interface Result {
  transcriptId: string
  matchStatus: string
  matchConfidence: number
  clientInitials: string | null
  speakerSeparated: boolean
  reportId: string | null
  scoringError: string | null
  duplicate?: boolean
  scored?: boolean // whether scoring was requested for this add
}

/**
 * Paste a transcript straight into the app — for backfilling past sessions or
 * anything that didn't arrive via Zapier. Runs the same match-and-score
 * pipeline as the webhook (POST /api/transcripts/manual).
 */
export function AddTranscript({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [text, setText] = useState('')
  const [score, setScore] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  async function submit() {
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/transcripts/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: text, title: title || null, sessionDate: date || null, autoScore: score }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
      } else {
        setResult({ ...data, scored: score })
        setTitle('')
        setDate('')
        setText('')
        onAdded()
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-tlw-md bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity duration-tlw-base hover:opacity-90"
      >
        + add a transcript
      </button>
    )
  }

  return (
    <div className="rounded-tlw-lg p-4" style={{ backgroundColor: 'var(--color-surface)' }}>
      <p className="text-[13px] font-medium text-tlw-navy-deep">Add a transcript</p>
      <p className="mt-1 text-[12px] text-tlw-warm-gray">
        Paste a session transcript to score it — or untick &ldquo;score this session&rdquo; to just file
        it on the client (e.g. an orientation that isn&apos;t really a coaching conversation). Put the
        client&apos;s name in the title so it can be matched — if it can&apos;t match confidently,
        it&apos;ll wait in the needs-review queue below.
      </p>

      <div className="mt-3 flex flex-wrap gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="title (e.g. Coaching · Michel W. · session 3)"
          className="min-w-[260px] flex-1 rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso"
        />
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="paste the full transcript here…"
        rows={8}
        className="mt-3 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface p-3 text-[13px] text-tlw-espresso"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="rounded-tlw-md bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity duration-tlw-base hover:opacity-90 disabled:opacity-40"
        >
          {busy ? (score ? 'scoring…' : 'adding…') : score ? 'add & score' : 'add only'}
        </button>
        <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-tlw-espresso">
          <input type="checkbox" checked={score} onChange={(e) => setScore(e.target.checked)} />
          score this session
        </label>
        <button
          onClick={() => {
            setOpen(false)
            setError(null)
            setResult(null)
          }}
          className="text-[12px] text-tlw-warm-gray hover:text-tlw-espresso"
        >
          close
        </button>
        {busy && score && <span className="text-[11px] text-tlw-warm-gray">this can take ~20–40s</span>}
      </div>

      {error && (
        <p className="mt-3 text-[12px]" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 text-[12px]">
          {result.duplicate ? (
            <p className="text-tlw-warm-gray">Already ingested — this exact transcript is on file.</p>
          ) : result.matchStatus === 'matched' && result.scored === false ? (
            <p style={{ color: 'var(--color-success)' }}>
              Added to the client&apos;s file ({result.clientInitials}) without scoring. You can score it
              later from their transcripts list.
            </p>
          ) : result.matchStatus === 'matched' && result.reportId ? (
            <p style={{ color: 'var(--color-success)' }}>
              Scored ({result.clientInitials}).{' '}
              <Link href={`/practice/${result.reportId}`} className="underline">
                open the report →
              </Link>
            </p>
          ) : result.matchStatus === 'matched' && result.scoringError ? (
            <p style={{ color: 'var(--color-warning)' }}>Matched, but scoring failed: {result.scoringError}</p>
          ) : (
            <p style={{ color: 'var(--color-warning)' }}>
              Couldn&apos;t match the client confidently — it&apos;s in the needs-review queue below. Confirm
              the client there to score it.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
