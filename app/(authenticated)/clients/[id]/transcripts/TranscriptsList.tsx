'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useScoringJobs, startScoring, retryScoring, dismissScoringJob } from '@/lib/scoring-jobs'
import { ScoringProgressBar } from '@/app/components/shared/ScoringProgress'

interface Row {
  id: string
  session_date: string | null
  filename: string | null
  title: string | null
  source: string
  match_status: string
  reportId: string | null
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function TranscriptsList({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  // Background scoring jobs (shared with the Practice review queue) — a score
  // started on either page shows its progress bar here too.
  const jobs = useScoringJobs()

  const load = useCallback(async () => {
    const r = await fetch(`/api/clients/${clientId}/transcripts`)
    const d = r.ok ? await r.json() : { transcripts: [] }
    setRows(d.transcripts || [])
    return (d.transcripts || []) as Row[]
  }, [clientId])

  useEffect(() => {
    let cancelled = false
    load().finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [load])

  // When a job for one of these rows completes, refresh so the row flips to
  // "view report →", then clear the finished job.
  useEffect(() => {
    const finished = jobs.filter(
      (j) => j.status === 'done' && rows.some((r) => r.id === j.transcriptId && !r.reportId)
    )
    if (finished.length === 0) return
    load().then(() => finished.forEach((j) => dismissScoringJob(j.transcriptId)))
  }, [jobs, rows, load])

  // Score a filed-but-unscored transcript (e.g. one added via "add, don't
  // score" that turned out to be a real coaching conversation after all).
  // Fire-and-forget: the score runs server-side (~2 min) — the button becomes
  // a progress bar and the coach is free to leave the page meanwhile.
  function scoreNow(t: Row) {
    startScoring({
      transcriptId: t.id,
      label: t.title || t.filename || 'Transcript',
      body: { rescore: true },
    })
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface/60" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-tlw-xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 p-8 text-center">
        <p className="text-[13px] text-tlw-warm-gray">No transcripts for this client yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {rows.map((t) => {
        const job = jobs.find((j) => j.transcriptId === t.id)
        const inner = (
          <div className="flex items-center justify-between gap-4 rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-4 transition-colors duration-tlw-base hover:border-tlw-warm-gray/30">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-tlw-navy-deep">{t.title || t.filename || 'Transcript'}</p>
              <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
                {fmtDate(t.session_date)} · {t.source}
              </p>
              {job?.status === 'error' && (
                <p className="mt-0.5 text-[12px]" style={{ color: 'var(--color-danger)' }}>
                  {job.error}
                </p>
              )}
            </div>
            <span className="flex shrink-0 items-center gap-2 text-[12px] font-medium">
              {t.reportId ? (
                <span className="text-tlw-signal-orange">view report →</span>
              ) : t.match_status === 'needs_review' ? (
                <span style={{ color: 'var(--color-warning)' }}>needs client</span>
              ) : job && (job.status === 'running' || job.status === 'done') ? (
                <ScoringProgressBar job={job} compact />
              ) : job?.status === 'error' ? (
                <>
                  <button
                    onClick={() => retryScoring(t.id)}
                    className="rounded-tlw-md border border-tlw-warm-gray/25 px-2.5 py-1 text-[12px] text-tlw-espresso transition-opacity duration-tlw-base hover:opacity-80"
                  >
                    retry
                  </button>
                  <button
                    onClick={() => dismissScoringJob(t.id)}
                    title="Dismiss"
                    aria-label="Dismiss"
                    className="rounded-md px-1.5 py-0.5 text-[13px] leading-none text-tlw-warm-gray transition-colors hover:bg-tlw-warm-gray/15 hover:text-tlw-espresso"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <span className="text-tlw-warm-gray">not scored</span>
                  <button
                    onClick={() => scoreNow(t)}
                    title="Scoring runs in the background (~2 min) — you can leave this page and check back"
                    className="rounded-tlw-md border border-tlw-warm-gray/25 px-2.5 py-1 text-[12px] text-tlw-espresso transition-opacity duration-tlw-base hover:opacity-80"
                  >
                    score now
                  </button>
                </>
              )}
            </span>
          </div>
        )
        return t.reportId ? (
          <Link key={t.id} href={`/practice/${t.reportId}`} className="block">
            {inner}
          </Link>
        ) : (
          <div key={t.id}>{inner}</div>
        )
      })}
    </div>
  )
}
