'use client'
/**
 * Assessment debrief command center (supervisor-only; Phase 4 of the debrief
 * add-on). Companies & cohorts, portal users, documents, the support queue,
 * and the interpretation brief — everything the coach-less portal product
 * needs to be run without a deploy. All data comes from /api/admin/*, each
 * gated by requireSupervisor and written to the admin audit log.
 */
import { useEffect, useState } from 'react'
import { PageHeader } from '@/app/components/layout/PageHeader'
import { api } from './ui'
import { CompaniesPanel, type Company } from './CompaniesPanel'
import { PortalUsersPanel } from './PortalUsersPanel'
import { DocumentsPanel } from './DocumentsPanel'
import { SupportPanel } from './SupportPanel'
import { BriefPanel } from './BriefPanel'

const TABS = [
  ['companies', 'Companies & cohorts'],
  ['users', 'Portal users'],
  ['documents', 'Documents'],
  ['support', 'Support'],
  ['brief', 'Brief'],
] as const
type Tab = (typeof TABS)[number][0]

export default function DebriefCommandCenter() {
  const [tab, setTab] = useState<Tab>('companies')
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    api<{ companies: Company[] }>('/api/admin/companies')
      .then((d) => setCompanies(d.companies))
      .catch((e) => {
        if (/Supervisor|403|Unauthorized/i.test(String(e?.message))) setDenied(true)
        setCompanies([])
      })
  }, [tab])

  return (
    <>
      <PageHeader backHref="/business-center/coaches" backLabel="Command Center" title="Assessment Debrief" subtitle="Companies, cohorts, portal users, reports, support, and the interpretation brief" />
      {denied ? (
        <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6 text-[14px] text-tlw-espresso">
          Supervisor access required.
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-1 border-b border-tlw-warm-gray/15">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
                  tab === key ? 'border-tlw-signal-orange text-tlw-navy-deep' : 'border-transparent text-tlw-warm-gray hover:text-tlw-espresso'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'companies' && <CompaniesPanel />}
          {tab === 'users' && <PortalUsersPanel companies={companies || []} />}
          {tab === 'documents' && <DocumentsPanel companies={companies || []} />}
          {tab === 'support' && <SupportPanel />}
          {tab === 'brief' && <BriefPanel />}
        </>
      )}
    </>
  )
}
