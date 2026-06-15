'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Row {
  id: string
  session_date: string | null
  filename: string | null
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

  useEffect(() => {
    let cancelled = false
    fetch(`/api/clients/${clientId}/transcripts`)
      .then((r) => (r.ok ? r.json() : { transcripts: [] }))
      .then((d) => !cancelled && setRows(d.transcripts || []))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [clientId])

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
              <p className="truncate text-[14px] font-medium text-tlw-navy-deep">{t.filename || 'Transcript'}</p>
              <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
                {fmtDate(t.session_date)} · {t.source}
              </p>
            </div>
            <span className="shrink-0 text-[12px] font-medium">
              {t.reportId ? (
                <span className="text-tlw-signal-orange">view report →</span>
              ) : t.match_status === 'needs_review' ? (
                <span style={{ color: 'var(--color-warning)' }}>needs client</span>
              ) : (
                <span className="text-tlw-warm-gray">not scored</span>
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
