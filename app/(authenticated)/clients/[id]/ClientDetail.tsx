'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { Client } from '@/lib/supabase/types'
import { NameCard } from './NameCard'
import { IssueAgreementModal } from './IssueAgreementModal'
import { EmailModal } from './EmailModal'
import { WorkspaceProvider } from '@/components/workspace/WorkspaceContext'
import { WorkspaceSurface } from '@/components/workspace/WorkspaceSurface'

export function ClientDetail({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<Client | null>(null)
  const [coachTimezone, setCoachTimezone] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [emailing, setEmailing] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [txReload, setTxReload] = useState(0)
  const [apptReload, setApptReload] = useState(0)
  const [commReload, setCommReload] = useState(0)
  const [agrReload, setAgrReload] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${clientId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load client')
      setClient(data.client)
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    fetch('/api/coach')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.coach?.timezone && setCoachTimezone(d.coach.timezone))
      .catch(() => {})
  }, [])

  // Opened from the roster's "issue agreement now?" prompt.
  const searchParams = useSearchParams()
  useEffect(() => {
    if (searchParams.get('issue') === '1') setIssuing(true)
  }, [searchParams])

  if (loading) {
    return <div className="h-40 animate-pulse rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface/60" />
  }

  if (error || !client) {
    return (
      <div className="rounded-tlw-xl border border-tlw-warm-gray/20 bg-tlw-surface p-8 text-center">
        <p className="text-[13px] text-tlw-espresso">{error || 'Client not found.'}</p>
        <Link href="/clients" className="mt-3 inline-block text-[13px] font-medium text-tlw-signal-orange hover:underline">
          ← Back to roster
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link href="/clients" className="text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
        ← Back to roster
      </Link>

      <NameCard
        client={client}
        onUpdated={setClient}
        apptReload={apptReload}
        coachTimezone={coachTimezone}
        onIssueAgreement={() => setIssuing(true)}
      />

      {/* Compliance guardrail — non-dismissible (migration 018). */}
      {client.recording_authorized === false && (
        <div
          className="rounded-tlw-lg px-4 py-2.5 text-[13px] font-medium"
          style={{ background: 'rgba(232,101,10,.10)', color: '#E8650A' }}
        >
          ⚑ No recording — this client has not authorized AI processing.
        </div>
      )}

      {/* Fixed action bar — stays outside the card grid. */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/clients/${clientId}/notes?new=1`}
          className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90"
        >
          + New note
        </Link>
        <button
          onClick={() => setEmailing(true)}
          className="rounded-tlw-lg border border-tlw-warm-gray/30 px-4 py-2 text-[13px] font-medium text-tlw-espresso transition-colors hover:border-tlw-warm-gray/50"
        >
          Compose Email
        </button>
        <Link
          href="/business-center/run"
          className="rounded-tlw-lg border border-tlw-warm-gray/30 px-4 py-2 text-[13px] font-medium text-tlw-espresso transition-colors hover:border-tlw-warm-gray/50"
        >
          Create invoice
        </Link>
      </div>

      {/* Card grid — coach-global layout, per-client data via WorkspaceContext. */}
      <WorkspaceProvider
        value={{
          clientId,
          client,
          setClient,
          coachTimezone,
          apptReload,
          txReload,
          commReload,
          agrReload,
          bumpApptReload: () => setApptReload((n) => n + 1),
          bumpTxReload: () => setTxReload((n) => n + 1),
          bumpCommReload: () => setCommReload((n) => n + 1),
          bumpAgrReload: () => setAgrReload((n) => n + 1),
          onIssueAgreement: () => setIssuing(true),
        }}
      >
        <WorkspaceSurface />
      </WorkspaceProvider>

      {issuing && (
        <IssueAgreementModal
          client={client}
          onClose={() => setIssuing(false)}
          onSent={() => { setAgrReload((n) => n + 1); setCommReload((n) => n + 1) }}
        />
      )}

      {emailing && (
        <EmailModal
          clientId={clientId}
          to={client.email || ''}
          clientName={client.name}
          onClose={() => setEmailing(false)}
          onSent={() => setCommReload((n) => n + 1)}
        />
      )}

    </div>
  )
}
