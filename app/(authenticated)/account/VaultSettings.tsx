'use client'
import { useEffect, useState } from 'react'

interface GardenNote {
  id: string
  title: string
  type: string | null
  themes: string[]
  summary: string | null
  nudge_eligible: boolean
  aliases: string[]
  vault_path: string
  last_synced_at: string
}
interface GardenEdge {
  source_id: string
  target_id: string
  relation: string
}

/**
 * Account → Vault. Point the garden indexer at one folder in the vault repo, then
 * sync (manual button; an hourly cron also runs). Leaves are detected structurally
 * (frontmatter nudge_eligible / themes) — there is no tag to set. Shows exactly
 * what got indexed (with the surfacing gate) so the coach can confirm it worked.
 */
export function VaultSettings() {
  const [folder, setFolder] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [notes, setNotes] = useState<GardenNote[]>([])
  const [edges, setEdges] = useState<GardenEdge[]>([])

  function loadGarden() {
    fetch('/api/vault/garden')
      .then((r) => (r.ok ? r.json() : { notes: [], edges: [] }))
      .then((d) => {
        setNotes(d.notes || [])
        setEdges(d.edges || [])
      })
      .catch(() => {})
  }

  useEffect(() => {
    fetch('/api/coach')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const ns = d?.coach?.nudge_settings
        if (ns) setFolder(ns.vault_folder_path || '')
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
    loadGarden()
  }, [])

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/coach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultFolderPath: folder }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setMsg({ ok: true, text: 'Saved.' })
      else setMsg({ ok: false, text: data.error || 'Could not save.' })
    } catch {
      setMsg({ ok: false, text: 'Network error while saving.' })
    } finally {
      setSaving(false)
    }
  }

  async function sync() {
    setSyncing(true)
    setMsg(null)
    try {
      const res = await fetch('/api/vault/sync', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMsg({ ok: data.configured !== false, text: data.message || 'Synced.' })
        loadGarden()
      } else {
        setMsg({ ok: false, text: data.error || 'Sync failed.' })
      }
    } catch {
      setMsg({ ok: false, text: 'Network error during sync.' })
    } finally {
      setSyncing(false)
    }
  }

  const surfaceable = notes.filter((n) => n.nudge_eligible).length

  return (
    <div className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
        Vault (garden)
      </p>
      <p className="mb-4 text-[13px] text-tlw-warm-gray">
        Point the indexer at one folder in your vault repo. Every note there with a{' '}
        <code className="text-tlw-espresso">nudge_eligible</code> field (or a{' '}
        <code className="text-tlw-espresso">themes</code> list) is indexed as a leaf; only{' '}
        <code className="text-tlw-espresso">nudge_eligible: true</code> leaves are ever surfaced to a
        client. Note content is never copied — it&apos;s pulled live when a nudge is drafted.
      </p>

      <label className="block">
        <span className="mb-1 block text-[12px] text-tlw-warm-gray">Folder path in repo</span>
        <input
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          placeholder="e.g. 06-Wissensgarten-Knowledge-Base"
          disabled={!loaded}
          className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-navy-rich"
        />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !loaded}
          className="rounded-tlw-md border border-tlw-warm-gray/30 px-4 py-2 text-[13px] font-medium text-tlw-espresso transition-colors hover:bg-tlw-warm-gray/[0.08] disabled:opacity-40"
        >
          {saving ? 'saving…' : 'Save'}
        </button>
        <button
          onClick={sync}
          disabled={syncing || !loaded || !folder.trim()}
          className="rounded-tlw-md bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {syncing ? 'syncing…' : 'Sync vault'}
        </button>
      </div>

      {msg && (
        <p className="mt-3 text-[12px]" style={{ color: msg.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {msg.text}
        </p>
      )}

      {notes.length > 0 && (
        <div className="mt-5 border-t border-tlw-warm-gray/15 pt-4">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">
            Indexed leaves · {notes.length} · {surfaceable} surfaceable · {edges.length} edges
          </p>
          <ul className="space-y-2">
            {notes.map((n) => {
              const out = edges.filter((e) => e.source_id === n.id)
              return (
                <li key={n.id} className="text-[13px]">
                  <span className="font-medium text-tlw-espresso">{n.title}</span>
                  <span className="text-tlw-warm-gray"> · {n.id}</span>
                  {n.type && <span className="text-tlw-warm-gray"> · {n.type}</span>}
                  {n.nudge_eligible ? (
                    <span style={{ color: 'var(--color-success)' }}> · surfaceable</span>
                  ) : (
                    <span className="text-tlw-warm-gray"> · not surfaced</span>
                  )}
                  {n.themes.length > 0 && (
                    <span className="text-tlw-warm-gray"> — themes: {n.themes.join(', ')}</span>
                  )}
                  {out.length > 0 && (
                    <span className="text-tlw-warm-gray">
                      {' '}
                      · links: {out.map((e) => e.target_id).join(', ')}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
