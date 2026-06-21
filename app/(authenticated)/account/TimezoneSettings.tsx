'use client'
import { useEffect, useState } from 'react'
import { TimezoneCombobox } from '@/app/components/shared/TimezoneCombobox'

/** Set the coach's timezone — the zone the app reads every date/time in (session
 *  dates, the dashboard, scored reports). Stored on the coach profile. */
export function TimezoneSettings() {
  const [value, setValue] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [favorites, setFavorites] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/coach')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const tz =
          d?.coach?.timezone ||
          Intl.DateTimeFormat().resolvedOptions().timeZone ||
          'America/Los_Angeles'
        setValue(tz)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
    fetch('/api/clients/timezones')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => Array.isArray(d?.favorites) && setFavorites(d.favorites))
      .catch(() => {})
  }, [])

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/coach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: value }),
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

  return (
    <div className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Timezone</p>
      <p className="mb-4 text-[13px] text-tlw-warm-gray">
        The app reads every date and time in this zone — session dates, your dashboard, and scored
        reports. Set it to where you coach from.
      </p>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[240px] flex-1">
          <TimezoneCombobox
            value={value}
            onChange={setValue}
            favorites={favorites}
            allowEmpty={false}
            disabled={!loaded}
          />
        </div>
        <button
          onClick={save}
          disabled={saving || !loaded || !value}
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
