'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

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
  const [scoring, setScoring] = useState<string | null>(null)
  const [scoringElapsed, setScoringElapsed] = useState(0)
  const [scoreError, setScoreError] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const r = await fetch(`/api/clients/${clientId}/transcripts`)
    const d = r.ok ? await r.json() : { transcripts: [] }
    setRows(d.transcripts || [])
  }, [clientId])

  useEffect(() => {
    let cancelled = false
    load().finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [load])

  useEffect(() => {
    if (!scoring) { setScoringElapsed(0); return }
    const t = setInterval(() => setScoringElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [scoring])

  // Score a filed-but-unscored transcript (e.g. one added via "add, don't
  // score" that turned out to be a real coaching conversation after all).
  async function scoreNow(transcriptId: string) {
    setScoring(transcriptId)
    setScoreError((e) => ({ ...e, [transcriptId]: '' }))
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rescore: true }),
      })
      if (res.ok) {
        await load()
      } else {
        const data = await res.json().catch(() => ({}))
        setScoreError((e) => ({ ...e, [transcriptId]: data.error || 'Scoring failed. Please try again.' }))
      }
    } catch {
      setScoreError((e) => ({ ...e, [transcriptId]: 'Network error while scoring. Please try again.' }))
    } finally {
      setScoring(null)
    }
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
        const inner = (
          <div className="flex items-center justify-between gap-4 rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-4 transition-colors duration-tlw-base hover:border-tlw-warm-gray/30">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-tlw-navy-deep">{t.title || t.filename || 'Transcript'}</p>
              <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
                {fmtDate(t.session_date)} · {t.source}
              </p>
              {scoreError[t.id] && (
                <p className="mt-0.5 text-[12px]" style={{ color: 'var(--color-danger)' }}>
                  {scoreError[t.id]}
                </p>
              )}
            </div>
            <span className="flex shrink-0 items-center gap-2 text-[12px] font-medium">
              {t.reportId ? (
                <span className="text-tlw-signal-orange">view report →</span>
              ) : t.match_status === 'needs_review' ? (
                <span style={{ color: 'var(--color-warning)' }}>needs client</span>
              ) : (
                <>
                  <span className="text-tlw-warm-gray">not scored</span>
                  <button
                    onClick={() => scoreNow(t.id)}
                    disabled={scoring === t.id}
                    className="rounded-tlw-md border border-tlw-warm-gray/25 px-2.5 py-1 text-[12px] text-tlw-espresso transition-opacity duration-tlw-base hover:opacity-80 disabled:opacity-40"
                  >
                    {scoring === t.id ? `scoring… ${scoringElapsed}s` : 'score now'}
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
