'use client'
/**
 * Command Center drill-down: one coach's client roster with per-client portal
 * state (never invited / invited / active / locked) and the supervisor support
 * actions — resend the portal sign-in link, clear a password lockout, jump to
 * the client workspace.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'

export type PortalState = {
  invitedAt: string | null
  lastSeenAt: string | null
  username: string | null
  locked: boolean
}

type ClientRow = {
  id: string
  name: string
  email: string | null
  status: string
  agreement_on_file: boolean
  portal: PortalState
}

function shortDate(ts: string): string {
  const d = new Date(ts)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

function relative(ts: string): string {
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days}d ago`
  return shortDate(ts)
}

/** The one-glance portal chip for a client row. */
function PortalChip({ portal }: { portal: PortalState }) {
  if (portal.locked) {
    return (
      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        LOCKED
      </span>
    )
  }
  if (portal.lastSeenAt) {
    return (
      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
        PORTAL · {relative(portal.lastSeenAt)}
      </span>
    )
  }
  if (portal.invitedAt) {
    return (
      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        INVITED {shortDate(portal.invitedAt)}
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-full bg-tlw-canvas px-2 py-0.5 text-[10px] font-medium text-tlw-warm-gray">
      NOT INVITED
    </span>
  )
}

function ClientLine({ coachId, client, onChanged }: {
  coachId: string
  client: ClientRow
  onChanged: (c: ClientRow) => void
}) {
  const [busy, setBusy] = useState<'invite' | 'unlock' | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  async function resendInvite() {
    setBusy('invite')
    setNote(null)
    const res = await fetch(`/api/coaches/${coachId}/clients/${client.id}/portal-invite`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (res.ok) {
      setNote({ ok: true, text: `Link sent to ${d.sentTo}` })
      onChanged({ ...client, portal: { ...client.portal, invitedAt: new Date().toISOString() } })
    } else {
      setNote({ ok: false, text: d.error ?? 'Send failed' })
    }
  }

  async function unlock() {
    setBusy('unlock')
    setNote(null)
    const res = await fetch(`/api/coaches/${coachId}/clients/${client.id}/portal-unlock`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (res.ok) {
      setNote({ ok: true, text: 'Unlocked' })
      onChanged({ ...client, portal: { ...client.portal, locked: false } })
    } else {
      setNote({ ok: false, text: d.error ?? 'Unlock failed' })
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href={`/clients/${client.id}`}
          className="truncate text-[13px] font-medium text-tlw-navy-deep hover:underline"
        >
          {client.name}
        </Link>
        <PortalChip portal={client.portal} />
        {client.status !== 'active' && (
          <span className="shrink-0 rounded-full bg-tlw-canvas px-2 py-0.5 text-[10px] capitalize text-tlw-warm-gray">
            {client.status}
          </span>
        )}
        {client.portal.username && (
          <span className="hidden shrink-0 text-[11px] text-tlw-warm-gray sm:inline">
            @{client.portal.username}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {note && (
          <span className={`text-[11px] ${note.ok ? 'text-emerald-700' : 'text-red-600'}`}>{note.text}</span>
        )}
        {client.portal.locked && (
          <button
            onClick={unlock}
            disabled={busy !== null}
            className="text-[11px] font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            {busy === 'unlock' ? 'Unlocking…' : 'Unlock'}
          </button>
        )}
        <button
          onClick={resendInvite}
          disabled={busy !== null || !client.email}
          title={client.email ? undefined : 'No email on file'}
          className="text-[11px] font-medium text-tlw-navy-deep hover:underline disabled:opacity-50"
        >
          {busy === 'invite'
            ? 'Sending…'
            : client.portal.invitedAt || client.portal.lastSeenAt
              ? 'Resend portal link'
              : 'Invite to portal'}
        </button>
      </div>
    </div>
  )
}

export function CoachClientsPanel({ coachId }: { coachId: string }) {
  const [clients, setClients] = useState<ClientRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/coaches/${coachId}/clients`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setClients(d.clients ?? []))
      .catch(() => setError('Could not load this coach’s clients.'))
  }, [coachId])

  if (error) return <p className="px-4 py-3 text-[12px] text-red-600">{error}</p>
  if (clients === null) return <div className="mx-4 my-3 h-16 animate-pulse rounded-tlw-lg bg-tlw-canvas" />
  if (clients.length === 0)
    return <p className="px-4 py-3 text-[12px] text-tlw-warm-gray">No clients linked to this coach yet.</p>

  const inPortal = clients.filter((c) => c.portal.lastSeenAt).length
  return (
    <div className="mt-3 rounded-tlw-lg border border-tlw-warm-gray/20 bg-white">
      <p className="border-b border-tlw-warm-gray/10 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-tlw-warm-gray">
        Clients ({clients.length}) · {inPortal} in portal
      </p>
      <div className="divide-y divide-tlw-warm-gray/10">
        {clients.map((c) => (
          <ClientLine
            key={c.id}
            coachId={coachId}
            client={c}
            onChanged={(updated) => setClients((all) => (all ?? []).map((x) => (x.id === updated.id ? updated : x)))}
          />
        ))}
      </div>
    </div>
  )
}
