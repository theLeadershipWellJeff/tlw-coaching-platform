'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { Client } from '@/lib/supabase/types'
import { NameCard } from './NameCard'
import { ScheduleCard } from './ScheduleCard'
import { TranscriptsCard, NotesCard } from './SummaryCards'
import { GoalsCard } from './GoalsCard'
import { ActionsCard } from './ActionsCard'
import { AgreementsCard } from './AgreementsCard'
import { IssueAgreementModal } from './IssueAgreementModal'
import { AgendaCard } from './AgendaCard'
import { EmailModal } from './EmailModal'
import { CommunicationCard } from './CommunicationCard'
import { ImportTranscriptsModal } from './ImportTranscriptsModal'

export function ClientDetail({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<Client | null>(null)
  // The coach's timezone — so the scheduler and the upcoming-sessions list render
  // every time in the coach's zone, not the browser's.
  const [coachTimezone, setCoachTimezone] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [emailing, setEmailing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [txReload, setTxReload] = useState(0)
  // Bumped on book/cancel so the Sessions card and the name-card list refetch together.
  const [apptReload, setApptReload] = useState(0)
  // Bumped after a send so the Recent Communication card refreshes.
  const [commReload, setCommReload] = useState(0)
  // Bumped after issuing an agreement so the Agreement card refetches.
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

      <NameCard client={client} onUpdated={setClient} apptReload={apptReload} coachTimezone={coachTimezone} />

      {/* Compliance guardrail — non-dismissible (migration 018). */}
      {client.recording_authorized === false && (
        <div
          className="rounded-tlw-lg px-4 py-2.5 text-[13px] font-medium"
          style={{ background: 'rgba(232,101,10,.10)', color: '#E8650A' }}
        >
          ⚑ No recording — this client has not authorized AI processing.
        </div>
      )}

      <ScheduleCard
        clientId={clientId}
        reloadKey={apptReload}
        onChanged={() => setApptReload((n) => n + 1)}
        coachTimezone={coachTimezone}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TranscriptsCard clientId={clientId} reloadKey={txReload} />
        <NotesCard clientId={clientId} />
      </div>

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
        <button
          onClick={() => setImporting(true)}
          className="rounded-tlw-lg border border-tlw-warm-gray/30 px-4 py-2 text-[13px] font-medium text-tlw-espresso transition-colors hover:border-tlw-warm-gray/50"
        >
          Import transcripts from Plaud
        </button>
      </div>

      <GoalsCard client={client} onUpdated={setClient} />

      <ActionsCard clientId={clientId} />

      <CommunicationCard clientId={clientId} reloadKey={commReload} />

      <AgendaCard clientId={clientId} />

      <AgreementsCard client={client} reloadKey={agrReload} onIssue={() => setIssuing(true)} />

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

      {importing && (
        <ImportTranscriptsModal
          clientId={clientId}
          clientName={client.name}
          onClose={() => setImporting(false)}
          onImported={() => setTxReload((n) => n + 1)}
        />
      )}
    </div>
  )
}
