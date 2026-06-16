'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/app/components/shared/Modal'

interface ClientRow {
  id: string
  name: string
  email: string | null
}

/**
 * Pick a client and send them this agreement to sign. The server snapshots the
 * agreement body, emails it with an "I have read and agree" checkbox, and logs
 * it to the client's workspace.
 */
export function AssignAgreementModal({
  templateId,
  templateName,
  onClose,
}: {
  templateId: string
  templateName: string
  onClose: () => void
}) {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [clientId, setClientId] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/clients')
      .then((r) => (r.ok ? r.json() : { clients: [] }))
      .then((d) => !cancelled && setClients(d.clients || []))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const selected = clients.find((c) => c.id === clientId)

  async function send() {
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, clientId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not send the agreement.')
      setSent(true)
      setTimeout(onClose, 1000)
    } catch (e: any) {
      setError(e.message)
      setSending(false)
    }
  }

  return (
    <Modal title={`Assign “${templateName}”`} onClose={onClose}>
      {sent ? (
        <p className="py-6 text-center text-[14px] font-medium" style={{ color: 'var(--color-success)' }}>
          Sent to sign ✓
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-tlw-warm-gray">
            Choose a client. They&apos;ll get this agreement by email with an &ldquo;I have read and agree&rdquo;
            checkbox; signing logs it to their workspace.
          </p>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={loading}
            className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
          >
            <option value="">{loading ? 'Loading clients…' : 'Choose a client…'}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id} disabled={!c.email}>
                {c.name}
                {c.email ? '' : ' (no email)'}
              </option>
            ))}
          </select>
          {selected && !selected.email && (
            <p className="text-[12px] text-tlw-signal-orange">This client has no email on file — add one first.</p>
          )}
          {error && <p className="text-[12px] text-tlw-signal-orange">{error}</p>}
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
              Cancel
            </button>
            <button
              onClick={send}
              disabled={sending || !clientId || !selected?.email}
              className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {sending ? 'Sending…' : 'Send to sign'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
