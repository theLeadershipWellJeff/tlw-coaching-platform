'use client'
import { useEffect, useState } from 'react'

type CalendarOption = {
  id: string
  summary: string
  primary: boolean
  accessRole: string | null
}

/**
 * Account → Calendar. Pick which Google calendar the app uses — transcript
 * matching, session booking, conflict checks, reminders, and external-booking
 * capture all read/write this calendar. Default = the primary calendar.
 */
export function CalendarSettings() {
  const [calendars, setCalendars] = useState<CalendarOption[]>([])
  const [selected, setSelected] = useState('primary')
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/calendar/list')
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!r.ok) {
          setLoadError(d.error || 'Could not load your calendars.')
          return
        }
        const list: CalendarOption[] = d.calendars || []
        setCalendars(list)
        // Normalize: a stored id that IS the primary calendar reads as 'primary'.
        const sel = d.selected || 'primary'
        const primaryId = list.find((c) => c.primary)?.id
        setSelected(sel === primaryId ? 'primary' : sel)
      })
      .catch(() => !cancelled && setLoadError('Network error while loading your calendars.'))
      .finally(() => !cancelled && setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [])

  async function save(nextId: string) {
    setSelected(nextId)
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/coach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId: nextId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setMsg({ ok: true, text: 'Saved — the app now uses this calendar.' })
      else setMsg({ ok: false, text: data.error || 'Could not save.' })
    } catch {
      setMsg({ ok: false, text: 'Network error while saving.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Calendar</p>
      <p className="mb-4 text-[13px] text-tlw-warm-gray">
        The Google calendar your coaching sessions live on. Session booking, transcript matching,
        conflict checks, and reminders all use this calendar.
      </p>

      {!loaded && <div className="h-9 w-64 animate-pulse rounded-tlw-md bg-tlw-warm-gray/10" />}

      {loaded && loadError && <p className="text-[12px]" style={{ color: 'var(--color-danger)' }}>{loadError}</p>}

      {loaded && !loadError && (
        <select
          value={selected}
          onChange={(e) => save(e.target.value)}
          disabled={saving}
          className="min-w-[260px] rounded-tlw-md border border-tlw-warm-gray/25 bg-white px-3 py-2 text-[13px] text-tlw-espresso disabled:opacity-50"
        >
          {calendars.map((c) => (
            <option key={c.id} value={c.primary ? 'primary' : c.id}>
              {c.summary}
              {c.primary ? ' (primary)' : ''}
            </option>
          ))}
        </select>
      )}

      {msg && (
        <p className="mt-2 text-[12px]" style={{ color: msg.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
