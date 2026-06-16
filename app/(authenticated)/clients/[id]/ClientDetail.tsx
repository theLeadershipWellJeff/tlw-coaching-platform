'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { Client } from '@/lib/supabase/types'
import { NameCard } from './NameCard'
import { TranscriptsCard, NotesCard } from './SummaryCards'
import { GoalsCard } from './GoalsCard'
import { ActionsCard } from './ActionsCard'
import { AgreementsCard } from './AgreementsCard'
import { AgendaCard } from './AgendaCard'
import { EmailModal } from './EmailModal'
import { ImportTranscriptsModal } from './ImportTranscriptsModal'

export function ClientDetail({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [emailing, setEmailing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [txReload, setTxReload] = useState(0)

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

      <NameCard client={client} onUpdated={setClient} />

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
          Send an email
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

      <AgendaCard clientId={clientId} />

      <AgreementsCard clientId={clientId} />

      {emailing && (
        <EmailModal to={client.email || ''} clientName={client.name} onClose={() => setEmailing(false)} />
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
