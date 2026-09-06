'use client'
/**
 * Client Portal admin (supervisor-only). Two layers, mirroring the product:
 *   - Portal users — every client using the portal, across all four use cases
 *     (coaching, coaching + ZF, standalone ZF participant, enterprise cohort)
 *   - ZF Portal — the assessment-debrief set-up: companies (with their
 *     documents and participants), cohorts, report uploads, support, brief
 * All data comes from /api/admin/*, each gated by requireSupervisor and
 * written to the admin audit log.
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
  ['users', 'Portal users'],
  ['zf', 'ZF Portal'],
  ['documents', 'Reports'],
  ['support', 'Support'],
  ['brief', 'Brief'],
] as const
type Tab = (typeof TABS)[number][0]

export default function ClientPortalAdmin() {
  const [tab, setTab] = useState<Tab>('users')
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
      <PageHeader
        backHref="/business-center/coaches"
        backLabel="Command Center"
        title="Client Portal"
        subtitle="Every client in the portal — coaching clients, ZF participants, and enterprise cohorts — plus the ZF set-up"
      />
      {denied ? (
        <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6 text-[14px] text-tlw-espresso">Supervisor access required.</div>
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
          {tab === 'users' && <PortalUsersPanel companies={companies || []} />}
          {tab === 'zf' && <CompaniesPanel />}
          {tab === 'documents' && <DocumentsPanel companies={companies || []} />}
          {tab === 'support' && <SupportPanel />}
          {tab === 'brief' && <BriefPanel />}
        </>
      )}
    </>
  )
}
