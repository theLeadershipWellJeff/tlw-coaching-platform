'use client'
import { useEffect, useState } from 'react'
import { api, btnLink, btnPrimary, Chip, ErrorLine, fmtDate, input, Section } from './ui'

type Ticket = {
  id: string
  subject: string
  body: string
  status: string
  created_at: string
  closed_at: string | null
  client: { id: string; name: string; email: string | null; company: string | null; cohort: string | null } | null
  messages: Array<{ id: string; author_role: string; body: string; created_at: string }>
}

export function SupportPanel() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    try {
      const d = await api<{ tickets: Ticket[] }>('/api/admin/support')
      setTickets(d.tickets)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load.')
      setTickets([])
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function act(id: string, body: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      await api(`/api/admin/support/${id}`, { method: 'POST', body: JSON.stringify(body) })
      setReply('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.')
    } finally {
      setBusy(false)
    }
  }

  const openCount = (tickets || []).filter((t) => t.status === 'open').length

  return (
    <Section title="Support queue" sub={`Messages from participants who have no coach to write to. ${openCount} open.`}>
      <ErrorLine error={error} />
      {tickets === null ? (
        <p className="text-[13px] text-tlw-warm-gray">Loading…</p>
      ) : tickets.length === 0 ? (
        <p className="text-[13px] text-tlw-warm-gray">No tickets.</p>
      ) : (
        <ul className="divide-y divide-tlw-warm-gray/10">
          {tickets.map((t) => (
            <li key={t.id} className="py-3">
              <button className="w-full text-left" onClick={() => setOpen(open === t.id ? null : t.id)}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[13px] font-medium text-tlw-navy-deep">
                    <Chip tone={t.status === 'open' ? 'amber' : 'gray'}>{t.status}</Chip> <span className="ml-1">{t.subject}</span>
                  </p>
                  <p className="text-[12px] text-tlw-warm-gray">
                    {t.client?.name || 'Unknown'}{t.client?.company ? ` · ${t.client.company}` : ''}{t.client?.cohort ? ` · ${t.client.cohort}` : ''} · {fmtDate(t.created_at)}
                  </p>
                </div>
              </button>
              {open === t.id && (
                <div className="mt-2 rounded-tlw-xl bg-tlw-canvas p-3">
                  <ul className="space-y-2">
                    {t.messages.map((m) => (
                      <li key={m.id} className="text-[13px]">
                        <p className="text-[11px] uppercase tracking-wider text-tlw-warm-gray">{m.author_role === 'client' ? t.client?.name || 'client' : 'you'} · {fmtDate(m.created_at)}</p>
                        <p className="whitespace-pre-wrap text-tlw-espresso">{m.body}</p>
                      </li>
                    ))}
                  </ul>
                  <textarea className={`${input} mt-3`} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Reply to ${t.client?.name || 'the participant'} by email…`} />
                  <div className="mt-2 flex items-center gap-3">
                    <button className={btnPrimary} disabled={busy || !reply.trim() || !t.client?.email} onClick={() => act(t.id, { action: 'reply', body: reply })}>Send reply</button>
                    {t.status === 'open' ? (
                      <button className={btnLink} disabled={busy} onClick={() => act(t.id, { action: 'close' })}>Close ticket</button>
                    ) : (
                      <button className={btnLink} disabled={busy} onClick={() => act(t.id, { action: 'reopen' })}>Reopen</button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
