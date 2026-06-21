'use client'
import { useEffect, useState } from 'react'

interface FrameworkRow {
  id: string
  slug: string
  name: string
  aliases: string[]
  trigger_signals: string[]
  when_to_use: string | null
  vault_path: string
  linked_slugs: string[]
  last_synced_at: string
}

/**
 * Account → Vault. Point the framework indexer at one folder in the vault repo and
 * set the frontmatter tag, then sync (manual button; an hourly cron also runs).
 * Shows exactly what got indexed so the coach can confirm their tagging worked.
 */
export function VaultSettings() {
  const [folder, setFolder] = useState('')
  const [tag, setTag] = useState('framework')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [frameworks, setFrameworks] = useState<FrameworkRow[]>([])

  function loadFrameworks() {
    fetch('/api/vault/frameworks')
      .then((r) => (r.ok ? r.json() : { frameworks: [] }))
      .then((d) => setFrameworks(d.frameworks || []))
      .catch(() => {})
  }

  useEffect(() => {
    fetch('/api/coach')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const ns = d?.coach?.nudge_settings
        if (ns) {
          setFolder(ns.vault_folder_path || '')
          setTag(ns.framework_tag || 'framework')
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
    loadFrameworks()
  }, [])

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/coach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultFolderPath: folder, frameworkTag: tag }),
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
        const extra =
          data.ignored || data.removed
            ? ` (${data.ignored} untagged ignored, ${data.removed} removed)`
            : ''
        setMsg({ ok: data.configured !== false, text: (data.message || 'Synced.') + extra })
        loadFrameworks()
      } else {
        setMsg({ ok: false, text: data.error || 'Sync failed.' })
      }
    } catch {
      setMsg({ ok: false, text: 'Network error during sync.' })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
        Vault (frameworks)
      </p>
      <p className="mb-4 text-[13px] text-tlw-warm-gray">
        Point the framework indexer at one folder in your vault repo. Only notes in that folder
        whose frontmatter carries the tag below (e.g. <code className="text-tlw-espresso">framework: true</code>)
        are indexed. Note content is never copied — it&apos;s pulled live when a nudge is drafted.
      </p>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[12px] text-tlw-warm-gray">Folder path in repo</span>
          <input
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="e.g. Frameworks"
            disabled={!loaded}
            className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-navy-rich"
          />
        </label>
        <label className="block max-w-[220px]">
          <span className="mb-1 block text-[12px] text-tlw-warm-gray">Frontmatter tag</span>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="framework"
            disabled={!loaded}
            className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-navy-rich"
          />
        </label>
      </div>

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

      {frameworks.length > 0 && (
        <div className="mt-5 border-t border-tlw-warm-gray/15 pt-4">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">
            Indexed frameworks · {frameworks.length}
          </p>
          <ul className="space-y-2">
            {frameworks.map((f) => (
              <li key={f.id} className="text-[13px]">
                <span className="font-medium text-tlw-espresso">{f.name}</span>
                <span className="text-tlw-warm-gray"> · {f.slug}</span>
                {f.aliases.length > 0 && (
                  <span className="text-tlw-warm-gray"> — aliases: {f.aliases.join(', ')}</span>
                )}
                {f.linked_slugs.length > 0 && (
                  <span className="text-tlw-warm-gray"> · links: {f.linked_slugs.join(', ')}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
