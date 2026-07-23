'use client'
import { useEffect, useState } from 'react'
import {
  WEEKDAY_LABELS,
  REMINDER_LEAD_OPTIONS,
  DEFAULT_MEETING_LINK,
  defaultAvailability,
  defaultReminderSettings,
  normalizeAvailability,
  normalizeReminderSettings,
  type CoachAvailability,
  type ReminderSettings,
} from '@/lib/scheduling'

/** A readable label for a lead time in hours (e.g. 1 → "1 hour", 48 → "2 days"). */
function leadLabel(hours: number): string {
  if (hours % 24 === 0) {
    const d = hours / 24
    return `${d} day${d === 1 ? '' : 's'} before`
  }
  return `${hours} hour${hours === 1 ? '' : 's'} before`
}

/**
 * Per-coach scheduling settings: the bookable hours for each weekday (the
 * workspace scheduler warns when a pick falls outside these) and the session
 * reminders that fire (the booking confirmation + any number of pre-session
 * nudges). Saved to the coach profile via PATCH /api/coach. Timezone lives in its
 * own card just above this (it drives how these hours are read).
 */
export function SchedulingSettings() {
  const [availability, setAvailability] = useState<CoachAvailability>(defaultAvailability())
  const [reminders, setReminders] = useState<ReminderSettings>(defaultReminderSettings())
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/coach')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.coach) {
          setAvailability(normalizeAvailability(d.coach.availability))
          setReminders(normalizeReminderSettings(d.coach.reminder_settings))
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  function setDay(day: number, patch: Partial<CoachAvailability[string]>) {
    setAvailability((a) => ({ ...a, [String(day)]: { ...a[String(day)], ...patch } }))
  }

  function setReminderRule(idx: number, patch: Partial<ReminderSettings['reminders'][number]>) {
    setReminders((r) => ({
      ...r,
      reminders: r.reminders.map((rule, i) => (i === idx ? { ...rule, ...patch } : rule)),
    }))
  }

  function addReminder() {
    setReminders((r) => {
      const used = new Set(r.reminders.map((x) => x.hoursBefore))
      const next = REMINDER_LEAD_OPTIONS.find((h) => !used.has(h)) ?? REMINDER_LEAD_OPTIONS[0]
      return { ...r, reminders: [...r.reminders, { hoursBefore: next, enabled: true }] }
    })
  }

  function removeReminder(idx: number) {
    setReminders((r) => ({ ...r, reminders: r.reminders.filter((_, i) => i !== idx) }))
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/coach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability, reminderSettings: reminders }),
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
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Scheduling</p>
      <p className="mb-5 text-[13px] text-tlw-warm-gray">
        Set the hours you take sessions and the reminders that go out. The scheduler reads these in your timezone.
      </p>

      {/* Weekly availability */}
      <p className="mb-3 text-[12px] font-medium text-tlw-espresso">Weekly availability</p>
      <div className="space-y-2">
        {WEEKDAY_LABELS.map((label, day) => {
          const win = availability[String(day)]
          return (
            <div key={day} className="flex flex-wrap items-center gap-3">
              <label className="flex w-[120px] items-center gap-2 text-[13px] text-tlw-espresso">
                <input
                  type="checkbox"
                  checked={win.enabled}
                  disabled={!loaded}
                  onChange={(e) => setDay(day, { enabled: e.target.checked })}
                  className="h-4 w-4 accent-blue-600"
                />
                {label}
              </label>
              <div className={`flex items-center gap-2 ${win.enabled ? '' : 'opacity-40'}`}>
                <input
                  type="time"
                  value={win.start}
                  disabled={!loaded || !win.enabled}
                  onChange={(e) => setDay(day, { start: e.target.value })}
                  className="rounded-tlw-md border border-tlw-warm-gray/25 bg-white px-2 py-1 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                />
                <span className="text-[12px] text-tlw-warm-gray">to</span>
                <input
                  type="time"
                  value={win.end}
                  disabled={!loaded || !win.enabled}
                  onChange={(e) => setDay(day, { end: e.target.value })}
                  className="rounded-tlw-md border border-tlw-warm-gray/25 bg-white px-2 py-1 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Meeting link */}
      <p className="mb-1 mt-6 text-[12px] font-medium text-tlw-espresso">Meeting link</p>
      <p className="mb-2 text-[12px] text-tlw-warm-gray">
        The Zoom link added to every calendar invite and reminder email, so clients can join in one tap.
      </p>
      <input
        type="url"
        inputMode="url"
        value={reminders.meetingLink ?? ''}
        disabled={!loaded}
        placeholder={DEFAULT_MEETING_LINK}
        onChange={(e) => setReminders((r) => ({ ...r, meetingLink: e.target.value }))}
        className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-white px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
      />
      <p className="mt-1 text-[11px] text-tlw-warm-gray">Leave blank to use the default room ({DEFAULT_MEETING_LINK}).</p>

      {/* Reminders */}
      <p className="mb-3 mt-6 text-[12px] font-medium text-tlw-espresso">Session reminders</p>
      <label className="flex items-center gap-2 text-[13px] text-tlw-espresso">
        <input
          type="checkbox"
          checked={reminders.confirmation}
          disabled={!loaded}
          onChange={(e) => setReminders((r) => ({ ...r, confirmation: e.target.checked }))}
          className="h-4 w-4 accent-blue-600"
        />
        Email a confirmation when a session is booked
      </label>

      <div className="mt-3 space-y-2">
        {reminders.reminders.map((rule, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-tlw-espresso">
              <input
                type="checkbox"
                checked={rule.enabled}
                disabled={!loaded}
                onChange={(e) => setReminderRule(idx, { enabled: e.target.checked })}
                className="h-4 w-4 accent-blue-600"
              />
              Remind
            </label>
            <select
              value={rule.hoursBefore}
              disabled={!loaded}
              onChange={(e) => setReminderRule(idx, { hoursBefore: Number(e.target.value) })}
              className="rounded-tlw-md border border-tlw-warm-gray/25 bg-white px-2 py-1 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
            >
              {/* Keep a stored non-standard lead selectable. */}
              {!REMINDER_LEAD_OPTIONS.includes(rule.hoursBefore as (typeof REMINDER_LEAD_OPTIONS)[number]) && (
                <option value={rule.hoursBefore}>{leadLabel(rule.hoursBefore)}</option>
              )}
              {REMINDER_LEAD_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {leadLabel(h)}
                </option>
              ))}
            </select>
            <button
              onClick={() => removeReminder(idx)}
              className="text-[12px] text-tlw-warm-gray hover:text-red-600"
            >
              remove
            </button>
          </div>
        ))}
        <button
          onClick={addReminder}
          disabled={!loaded}
          className="text-[12px] font-medium text-blue-600 hover:underline disabled:opacity-40"
        >
          + Add a reminder
        </button>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !loaded}
          className="rounded-tlw-md bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity duration-tlw-base hover:opacity-90 disabled:opacity-40"
        >
          {saving ? 'saving…' : 'save'}
        </button>
        {msg && (
          <p className="text-[12px]" style={{ color: msg.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  )
}
