/**
 * Roll a coach's scored sessions up into the headline numbers the dashboard
 * card and the scorecard space show: the average overall score across all
 * sessions, and the highest- and lowest-scoring competencies averaged across
 * sessions (spec §5 score summary, §11 trend).
 */
import { COMPETENCIES, bandForScore } from './rubric'
import type { Band } from './types'
import type { SessionReport } from '@/lib/supabase/types'

export interface CompetencyAverage {
  id: number
  name: string
  domain: string
  average: number // rounded to 1 decimal
  band: Band
}

export interface ScorecardSummary {
  sessionCount: number
  averageOverall: number | null // mean of session overall scores, 1 decimal
  averageBand: Band | null
  strongest: CompetencyAverage | null
  lowest: CompetencyAverage | null
  competencies: CompetencyAverage[]
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function summarize(reports: SessionReport[]): ScorecardSummary {
  const empty: ScorecardSummary = {
    sessionCount: reports.length,
    averageOverall: null,
    averageBand: null,
    strongest: null,
    lowest: null,
    competencies: [],
  }
  if (reports.length === 0) return empty

  // Per-competency running totals across all sessions.
  const totals = new Map<number, { sum: number; n: number }>()
  let overallSum = 0
  let overallN = 0

  for (const r of reports) {
    if (typeof r.overall_score === 'number') {
      overallSum += r.overall_score
      overallN++
    }
    for (const c of r.report?.competencies || []) {
      const t = totals.get(c.id) || { sum: 0, n: 0 }
      t.sum += c.score
      t.n++
      totals.set(c.id, t)
    }
  }

  const competencies: CompetencyAverage[] = COMPETENCIES.map((def) => {
    const t = totals.get(def.id)
    const average = t && t.n > 0 ? round1(t.sum / t.n) : 0
    return { id: def.id, name: def.name, domain: def.domain, average, band: bandForScore(average) }
  }).filter((c) => c.average > 0)

  const ranked = [...competencies].sort((a, b) => b.average - a.average)
  const averageOverall = overallN > 0 ? round1(overallSum / overallN) : null

  return {
    sessionCount: reports.length,
    averageOverall,
    averageBand: averageOverall != null ? bandForScore(averageOverall) : null,
    strongest: ranked[0] || null,
    lowest: ranked.length > 0 ? ranked[ranked.length - 1] : null,
    competencies,
  }
}
