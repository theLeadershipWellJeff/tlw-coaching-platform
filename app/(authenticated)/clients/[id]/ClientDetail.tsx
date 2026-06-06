'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { Client, Note } from '@/lib/supabase/types'
import { NotesPanel } from './NotesPanel'

export function ClientDetail({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

      {/* Client header card */}
      <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-medium text-tlw-navy-deep">{client.name}</h2>
            <p className="mt-1 text-[13px] text-tlw-warm-gray">
              {[client.title, client.company].filter(Boolean).join(' · ') || '—'}
            </p>
            {client.email && (
              <p className="mt-0.5 text-[13px] text-tlw-espresso">{client.email}</p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${
              client.status === 'active'
                ? 'bg-tlw-navy-rich/10 text-tlw-navy-rich'
                : 'bg-tlw-warm-gray/15 text-tlw-warm-gray'
            }`}
          >
            {client.status}
          </span>
        </div>
        {client.bio && (
          <p className="mt-4 border-t border-tlw-warm-gray/15 pt-4 text-[13px] leading-relaxed text-tlw-espresso">
            {client.bio}
          </p>
        )}
      </div>

      {/* Notes */}
      <NotesPanel clientId={clientId} />
    </div>
  )
}
