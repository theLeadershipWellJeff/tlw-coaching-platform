'use client'
import { useState } from 'react'

type SyncResult = {
  configured?: boolean
  message?: string
  indexed?: number
  surfaceable?: number
  edges?: number
  ignored?: number
  removed?: number
  errors?: string[]
}

/**
 * A self-contained "Sync vault" button — POSTs /api/vault/sync and surfaces the
 * result (indexed / ignored / removed counts, or the not-connected message) inline.
 * Used on the Nudges page so the coach can re-index frameworks and confirm the vault
 * connection is working without leaving the queue. (Account → Vault has the full
 * panel with the indexed list.)
 */
export function VaultSyncButton() {
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function sync() {
    setSyncing(true)
    setMsg(null)
    try {
      const res = await fetch('/api/vault/sync', { method: 'POST' })
      const data: SyncResult = await res.json().catch(() => ({}))
      if (res.ok) {
        setMsg({ ok: data.configured !== false, text: data.message || 'Synced.' })
      } else {
        setMsg({ ok: false, text: (data as any).error || 'Sync failed.' })
      }
    } catch {
      setMsg({ ok: false, text: 'Network error during sync.' })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={sync}
        disabled={syncing}
        className="rounded-tlw-md border border-tlw-warm-gray/30 px-4 py-2 text-[13px] font-medium text-tlw-espresso transition-colors hover:bg-tlw-warm-gray/[0.08] disabled:opacity-40"
      >
        {syncing ? 'syncing…' : 'Sync vault'}
      </button>
      {msg && (
        <span
          className="text-[12px]"
          style={{ color: msg.ok ? 'var(--color-success)' : 'var(--color-danger)' }}
        >
          {msg.text}
        </span>
      )}
    </div>
  )
}
