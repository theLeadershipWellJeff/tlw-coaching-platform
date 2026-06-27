'use client'
import { useEffect, useState } from 'react'
import type { Client } from '@/lib/supabase/types'
import { EditClientModal } from './EditClientModal'
import { UpcomingSessions } from './UpcomingSessions'

type SessionEntry = {
  engagementId: string
  sessionCount: number
  sessionsUsed: number
  billingMode: string
}

function SessionsProgress({ clientId }: { clientId: string }) {
  const [sessions, setSessions] = useState<SessionEntry[] | null>(null)

  useEffect(() => {
    fetch(`/api/clients/${clientId}/billing/sessions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSessions(d.sessions ?? []))
      .catch(() => {})
  }, [clientId])

  if (!sessions || sessions.length === 0) return null

  return (
    <div className="mt-3 space-y-1.5">
      {sessions.map((s) => {
        const pct = Math.min(100, s.sessionCount > 0 ? Math.round((s.sessionsUsed / s.sessionCount) * 100) : 0)
        return (
          <div key={s.engagementId}>
            <div className="mb-0.5 flex items-center justify-between">
              <span className="text-[11px] text-tlw-warm-gray">
                Sessions: {s.sessionsUsed} / {s.sessionCount}
              </span>
              <span className="text-[11px] text-tlw-warm-gray">{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-tlw-warm-gray/20">
              <div
                className="h-full rounded-full bg-tlw-navy-deep transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function NameCard({
  client,
  onUpdated,
  apptReload = 0,
  coachTimezone,
}: {
  client: Client
  onUpdated: (c: Client) => void
  apptReload?: number
  coachTimezone?: string
}) {
  const [editing, setEditing] = useState(false)

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-medium text-tlw-navy-deep">{client.name}</h2>
          {client.company && <p className="mt-0.5 text-[13px] text-tlw-warm-gray">{client.company}</p>}
          {client.email && <p className="mt-0.5 text-[13px] text-tlw-espresso">{client.email}</p>}

          {(client.title || client.phone || client.timezone || client.address) && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-tlw-warm-gray">
              {client.title && <span>{client.title}</span>}
              {client.phone && <span>{client.phone}</span>}
              {client.timezone && <span>{client.timezone}</span>}
              {client.address && <span>{client.address}</span>}
            </div>
          )}

          <UpcomingSessions clientId={client.id} reloadKey={apptReload} compact timeZone={coachTimezone} />
          <SessionsProgress clientId={client.id} />
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${
              client.status === 'active'
                ? 'bg-tlw-navy-rich/10 text-tlw-navy-rich'
                : 'bg-tlw-warm-gray/15 text-tlw-warm-gray'
            }`}
          >
            {client.status}
          </span>
          <button
            onClick={() => setEditing(true)}
            title="Edit client"
            aria-label="Edit client"
            className="rounded-tlw-md p-1.5 text-tlw-warm-gray transition-colors hover:bg-tlw-canvas hover:text-tlw-espresso"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {client.bio && (
        <p className="mt-4 border-t border-tlw-warm-gray/15 pt-4 text-[13px] leading-relaxed text-tlw-espresso">
          {client.bio}
        </p>
      )}

      {editing && <EditClientModal client={client} onClose={() => setEditing(false)} onSaved={onUpdated} />}
    </div>
  )
}
