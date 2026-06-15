'use client'
import { useEffect, useState } from 'react'

/** Set the coach's supervisor email — the address a session scorecard can be
 *  emailed to from a report. */
export function SupervisorSettings() {
  const [value, setValue] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/coach')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setValue(d?.coach?.supervisor_email || ''))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/coach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supervisorEmail: value.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setMsg({ ok: true, text: data.supervisor_email ? 'Saved.' : 'Cleared.' })
      else setMsg({ ok: false, text: data.error || 'Could not save.' })
    } catch {
      setMsg({ ok: false, text: 'Network error while saving.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Supervisor</p>
      <p className="mb-4 text-[13px] text-tlw-warm-gray">
        The email a session scorecard can be sent to. Leave blank if you don&apos;t have one.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="supervisor@example.com"
          disabled={!loaded}
          className="min-w-[240px] flex-1 rounded-tlw-md border border-tlw-warm-gray/25 bg-white px-3 py-2 text-[13px] text-tlw-espresso disabled:opacity-50"
        />
        <button
          onClick={save}
          disabled={saving || !loaded}
          className="rounded-tlw-md bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity duration-tlw-base hover:opacity-90 disabled:opacity-40"
        >
          {saving ? 'saving…' : 'save'}
        </button>
      </div>
      {msg && (
        <p className="mt-2 text-[12px]" style={{ color: msg.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
