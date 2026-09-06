'use client'
/**
 * Cohorts tab — every cohort across every company in one list, split by
 * lifecycle: Active (running), Inactive (finished, kept for reference),
 * Archived (out of the working lists). Rows reuse CohortRow, so edit / roster /
 * invitations behave exactly as they do under the company on the Companies tab.
 */
import { useEffect, useMemo, useState } from 'react'
import { api, Section } from './ui'
import { CohortRow, cohortStatus, type Cohort, type CohortStatus, type Company } from './CompaniesPanel'

export function CohortsPanel({ onViewParticipants }: { onViewParticipants: (cohortId: string) => void }) {
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [error, setError] = useState('')
  const [view, setView] = useState<CohortStatus>('active')

  async function load() {
    try {
      const d = await api<{ companies: Company[] }>('/api/admin/companies')
      setCompanies(d.companies)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load.')
      setCompanies([])
    }
  }
  useEffect(() => {
    load()
  }, [])

  const rows = useMemo(
    () => (companies || []).flatMap((co) => co.cohorts.map((c) => ({ cohort: c, companyName: co.name }))),
    [companies]
  )
  const counts = useMemo(() => {
    const n: Record<CohortStatus, number> = { active: 0, inactive: 0, archived: 0 }
    for (const r of rows) n[cohortStatus(r.cohort.status)]++
    return n
  }, [rows])
  const visible = rows.filter((r) => cohortStatus(r.cohort.status) === view)

  function replace(nc: Cohort) {
    setCompanies((cs) => (cs || []).map((co) => ({ ...co, cohorts: co.cohorts.map((c) => (c.id === nc.id ? nc : c)) })))
  }

  const EMPTY: Record<CohortStatus, string> = {
    active: 'No active cohorts. Create one under its company on the Companies tab.',
    inactive: 'No inactive cohorts. Set a finished cohort to inactive from its Edit form.',
    archived: 'Nothing archived.',
  }

  return (
    <Section
      title="Cohorts"
      sub="Every cohort across every company. Active = running; inactive = finished, kept for reference; archived = out of the working lists. Change a cohort's status from its Edit form."
      actions={
        <div className="flex gap-1 rounded-tlw-lg bg-tlw-canvas p-0.5">
          {(['active', 'inactive', 'archived'] as CohortStatus[]).map((st) => (
            <button
              key={st}
              onClick={() => setView(st)}
              className={`rounded-tlw-md px-3 py-1 text-[12px] font-medium capitalize transition-colors ${
                view === st ? 'bg-tlw-surface text-tlw-navy-deep shadow-sm' : 'text-tlw-warm-gray hover:text-tlw-espresso'
              }`}
            >
              {st} <span className="tabular-nums">({counts[st]})</span>
            </button>
          ))}
        </div>
      }
    >
      {error && <p className="text-[12px] text-tlw-signal-orange">{error}</p>}
      {companies === null ? (
        <p className="text-[13px] text-tlw-warm-gray">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-[13px] text-tlw-warm-gray">{EMPTY[view]}</p>
      ) : (
        <ul className="space-y-2">
          {visible.map(({ cohort, companyName }) => (
            <CohortRow key={cohort.id} cohort={cohort} companyName={companyName} onChanged={replace} onViewParticipants={() => onViewParticipants(cohort.id)} />
          ))}
        </ul>
      )}
    </Section>
  )
}
