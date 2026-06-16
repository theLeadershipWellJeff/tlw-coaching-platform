'use client'
import { useEffect, useState } from 'react'

interface Agenda {
  id: string
  items: { q: string; a: string }[] | null
  status: string
  created_at: string
  submitted_at: string | null
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * What the client asked for on the agenda via the prep email's "shape our
 * agenda" link. Shows their submitted answers (or that we're still awaiting
 * them). Read-only.
 */
export function AgendaCard({ clientId, reloadKey = 0 }: { clientId: string; reloadKey?: number }) {
  const [agenda, setAgenda] = useState<Agenda | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/clients/${clientId}/agenda`)
      .then((r) => (r.ok ? r.json() : { agenda: null }))
      .then((d) => !cancelled && setAgenda(d.agenda || null))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [clientId, reloadKey])

  if (loading || !agenda) return null

  const submitted = agenda.status === 'submitted'

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Client&apos;s agenda</p>
        <span className="text-[11px] text-tlw-warm-gray">
          {submitted ? `submitted ${fmtDate(agenda.submitted_at)}` : `requested ${fmtDate(agenda.created_at)}`}
        </span>
      </div>

      {!submitted ? (
        <p className="text-[13px] text-tlw-warm-gray">Agenda invite sent — awaiting their response.</p>
      ) : (
        <ul className="space-y-3">
          {(agenda.items || []).map((it, i) => (
            <li key={i}>
              <p className="text-[12px] font-medium text-tlw-warm-gray">{it.q}</p>
              <p className="mt-0.5 text-[14px] leading-relaxed text-tlw-espresso">{it.a}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
