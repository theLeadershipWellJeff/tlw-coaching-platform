'use client'
import { useEffect, useState } from 'react'
import { EXPECTED_SCORING_SECONDS, type ScoringJob } from '@/lib/scoring-jobs'

/**
 * The scoring progress bar — replaces the score button while a job runs. The
 * dark fill advances at the average scoring rate (~120s to full); it holds just
 * short of the end until the report actually lands, so it never lies "done".
 */
export function ScoringProgressBar({ job, compact = false }: { job: ScoringJob; compact?: boolean }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (job.status !== 'running') return
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [job.status])

  const elapsed = Math.max(0, Math.floor((Date.now() - job.startedAt) / 1000))
  const pct = job.status === 'done' ? 100 : Math.min(96, (elapsed / EXPECTED_SCORING_SECONDS) * 100)
  const overdue = job.status === 'running' && elapsed > EXPECTED_SCORING_SECONDS

  return (
    <div className={compact ? 'w-40' : 'w-full'}>
      <div className={`overflow-hidden rounded-full bg-tlw-warm-gray/20 ${compact ? 'h-1.5' : 'h-2'}`}>
        <div
          className={`h-full rounded-full bg-tlw-navy-rich transition-[width] duration-1000 ease-linear ${
            overdue ? 'animate-pulse' : ''
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-tlw-warm-gray">
        {job.status === 'done'
          ? 'Scored ✓'
          : overdue
            ? `Almost done… ${elapsed}s`
            : `Scoring · ${elapsed}s of ~${EXPECTED_SCORING_SECONDS}s`}
      </p>
    </div>
  )
}
