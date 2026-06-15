'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ScorecardSummary } from '@/lib/scoring/aggregate'
import { bandColor } from '../practice/ui'

interface Payload {
  summary: ScorecardSummary
  needsReview: number
}

/**
 * The coaching workspace's headline scorecard read (spec §5.2 applied at the
 * practice level): average score across all sessions, strongest competency,
 * lowest competency. Quiet and flat; the full instrument lives at /practice.
 */
export function ScorecardSummary() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/reports/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <div className="h-28 animate-pulse rounded-tlw-xl" style={{ backgroundColor: 'var(--color-surface)' }} />
  }

  const summary = data?.summary
  const needsReview = data?.needsReview || 0

  // Nothing scored yet — keep it inviting, not empty.
  if (!summary || summary.sessionCount === 0) {
    return (
      <Link
        href="/practice"
        className="block rounded-tlw-xl p-5 transition-colors duration-tlw-base hover:opacity-90"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Coaching scorecard</p>
        <p className="mt-2 text-[13px] text-tlw-espresso">
          No sessions scored yet. Scored transcripts will show your average and your strongest and
          lowest competencies here.
        </p>
        {needsReview > 0 && (
          <p className="mt-2 text-[12px]" style={{ color: 'var(--color-warning)' }}>
            {needsReview} transcript{needsReview === 1 ? '' : 's'} need a client confirmed →
          </p>
        )}
      </Link>
    )
  }

  const cards = [
    {
      label: 'average score',
      value: summary.averageOverall != null ? summary.averageOverall.toFixed(1) : '—',
      sub: summary.averageBand ? summary.averageBand.toLowerCase() : '',
      color: summary.averageBand ? bandColor(summary.averageBand) : 'var(--tlw-navy-deep)',
      big: true as const,
    },
    {
      label: 'strongest area',
      value: summary.strongest?.name || '—',
      sub: summary.strongest ? `${summary.strongest.average.toFixed(1)} · ${summary.strongest.band.toLowerCase()}` : '',
      color: summary.strongest ? bandColor(summary.strongest.band) : 'var(--color-muted)',
      big: false as const,
    },
    {
      label: 'lowest area',
      value: summary.lowest?.name || '—',
      sub: summary.lowest ? `${summary.lowest.average.toFixed(1)} · ${summary.lowest.band.toLowerCase()}` : '',
      color: summary.lowest ? bandColor(summary.lowest.band) : 'var(--color-muted)',
      big: false as const,
    },
  ]

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          Coaching scorecard
        </p>
        <Link href="/practice" className="text-[12px] font-medium text-tlw-signal-orange hover:underline">
          Open scorecard →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-tlw-lg p-4" style={{ backgroundColor: 'var(--color-surface)' }}>
            <p className="text-[11px] text-tlw-warm-gray">{c.label}</p>
            {c.big ? (
              <p className="mt-2 text-[30px] font-medium leading-none" style={{ color: c.color }}>
                {c.value}
              </p>
            ) : (
              <p className="mt-2 text-[15px] font-medium leading-tight text-tlw-navy-deep">{c.value}</p>
            )}
            {c.sub && (
              <p className="mt-1.5 text-[11px]" style={{ color: c.color }}>
                {c.sub}
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-tlw-warm-gray">
        across {summary.sessionCount} scored session{summary.sessionCount === 1 ? '' : 's'} · 1 = emerging,
        3 = proficient, 5 = masterful
        {needsReview > 0 && (
          <>
            {' '}·{' '}
            <Link href="/practice" style={{ color: 'var(--color-warning)' }} className="hover:underline">
              {needsReview} need a client confirmed
            </Link>
          </>
        )}
      </p>
    </section>
  )
}
