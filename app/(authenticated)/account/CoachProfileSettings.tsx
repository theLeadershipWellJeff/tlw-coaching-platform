'use client'
import { useEffect, useState } from 'react'
import { GUIDE_STORAGE_PREFIX } from '@/lib/workspace-guides'

type Profile = { name: string; preferredName: string; title: string; phone: string }

/**
 * Account → Profile: how the app refers to the coach. The full name is what
 * emails, prompts, and sign-offs use (Google supplied it at first sign-in; from
 * here the coach owns it); the greeting name is what the dashboard says hello
 * with ("Dr. Jeff"); title and phone are reference fields. Saved via
 * PATCH /api/coach (name + migration 064's preferred_name/title/phone).
 */
export function CoachProfileSettings() {
  const [form, setForm] = useState<Profile>({ name: '', preferredName: '', title: '', phone: '' })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [guidesReset, setGuidesReset] = useState(false)

  useEffect(() => {
    fetch('/api/coach')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const c = d?.coach
        if (!c) return
        setForm({
          name: c.name || '',
          preferredName: c.preferred_name || '',
          title: c.title || '',
          phone: c.phone || '',
        })
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const firstName = form.name.trim().split(/\s+/)[0] || 'there'
  const greetsAs = form.preferredName.trim() || firstName

  function set<K extends keyof Profile>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    if (!form.name.trim()) {
      setMsg({ ok: false, text: 'Enter your name.' })
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/coach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          preferredName: form.preferredName,
          title: form.title,
          phone: form.phone,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMsg({ ok: true, text: `Saved — the app will greet you as “${greetsAs}”.` })
        // The top-bar avatar and greeting read the profile on load; tell them.
        window.dispatchEvent(new Event('tlw-coach-profile-changed'))
      } else {
        setMsg({ ok: false, text: data.error || 'Could not save.' })
      }
    } catch {
      setMsg({ ok: false, text: 'Network error while saving.' })
    } finally {
      setSaving(false)
    }
  }

  function showGuidesAgain() {
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(GUIDE_STORAGE_PREFIX)) keys.push(k)
      }
      keys.forEach((k) => localStorage.removeItem(k))
    } catch {
      /* ignore */
    }
    setGuidesReset(true)
  }

  const inputCls =
    'w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso placeholder:text-tlw-warm-gray/70 focus:border-tlw-navy-rich focus:outline-none disabled:opacity-60'
  const labelCls = 'mb-1 block text-[12px] font-medium text-tlw-espresso'

  return (
    <div className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Profile</p>
      <p className="mb-4 text-[13px] text-tlw-warm-gray">
        How the app refers to you. Your full name signs emails and voices every draft written as you;
        the greeting name is what the dashboard says hello with.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="coach-name">
            Full name
          </label>
          <input
            id="coach-name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            disabled={!loaded}
            placeholder="Jeff Holmes"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="coach-preferred">
            What should the app call you?
          </label>
          <input
            id="coach-preferred"
            value={form.preferredName}
            onChange={(e) => set('preferredName', e.target.value)}
            disabled={!loaded}
            placeholder={firstName === 'there' ? 'Dr. Jeff' : firstName}
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-tlw-warm-gray">
            Greeting preview: “Good morning, {greetsAs}”
          </p>
        </div>
        <div>
          <label className={labelCls} htmlFor="coach-title">
            Title / credentials
          </label>
          <input
            id="coach-title"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            disabled={!loaded}
            placeholder="Executive Coach, PCC"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="coach-phone">
            Phone
          </label>
          <input
            id="coach-phone"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            disabled={!loaded}
            placeholder="+1 (555) 555-5555"
            className={inputCls}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !loaded}
          className="rounded-tlw-md bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        {msg && (
          <span className={`text-[12px] ${msg.ok ? 'text-tlw-warm-gray' : 'text-tlw-signal-orange'}`}>
            {msg.text}
          </span>
        )}
      </div>

      <div className="mt-5 border-t border-tlw-warm-gray/15 pt-4 text-[12px] text-tlw-warm-gray">
        Closed a workspace guide (the note under each workspace title) and want it back?{' '}
        {guidesReset ? (
          <span className="text-tlw-espresso">Done — the guides will show again on each workspace.</span>
        ) : (
          <button onClick={showGuidesAgain} className="font-medium text-tlw-navy-rich hover:underline">
            Show the workspace guides again
          </button>
        )}
      </div>
    </div>
  )
}
