'use client'
import { useState } from 'react'
import type { Client } from '@/lib/supabase/types'

/**
 * Persistent, per-client "key info" the coach wants in front of them every
 * session (boss's name, spouse, kids, context to remember). Edits save straight
 * to the client record via PATCH /api/clients/[id].
 */
export function KeyInfoCard({
  client,
  onUpdated,
}: {
  client: Client
  onUpdated: (c: Client) => void
}) {
  const value = client.key_info || ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_info: draft.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      onUpdated(data.client)
      setEditing(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-deep">Key info</p>
        {!editing && (
          <button
            onClick={() => {
              setDraft(value)
              setEditing(true)
            }}
            className="text-[11px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
          >
            edit
          </button>
        )}
      </div>

      {error && <p className="mb-2 text-[11px] text-tlw-signal-orange">{error}</p>}

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            autoFocus
            placeholder="Boss's name, spouse, kids, anything to remember…"
            className="w-full rounded-tlw-md border border-tlw-warm-gray/20 bg-tlw-surface px-2 py-1.5 text-[12px] leading-relaxed text-tlw-espresso outline-none focus:border-tlw-signal-orange"
          />
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setEditing(false)}
              className="text-[11px] text-tlw-warm-gray hover:text-tlw-espresso"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="rounded-tlw-md bg-tlw-navy-rich px-3 py-1.5 text-[11px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : value ? (
        <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-tlw-espresso">{value}</p>
      ) : (
        <p className="text-[12px] text-tlw-warm-gray/70">Add the details you want at hand each session.</p>
      )}
    </div>
  )
}
