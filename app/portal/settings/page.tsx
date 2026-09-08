'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { orderedTimeZones } from '@/lib/scheduling'

/**
 * Portal account settings — two sections:
 *   1. Personal information — name, "What should I call you" (preferred name,
 *      migration 061), phone, timezone. Email is shown read-only: it is the
 *      sign-in identity, so it changes through the coach / support.
 *   2. Email reminders — the master switch (portal_features.reminders) and
 *      which ones: weekly planning nudge + day, away check-in + interval,
 *      quarterly goal review (portal_features.reminder_settings).
 *   3. Sign in — the optional username + password (migration 054).
 * Reaching this page requires a portal session, so the client arrived via a
 * magic link; possession of the email account is what authorizes changes here.
 */

const field =
  'mt-1 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange disabled:opacity-60'
const label = 'text-[12px] font-medium text-tlw-espresso'
const button =
  'rounded-tlw-lg bg-tlw-navy-deep px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50'

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null
  return <p className={`text-[12px] ${msg.ok ? 'text-emerald-700' : 'text-tlw-signal-orange'}`}>{msg.text}</p>
}

function ProfileSection() {
  const [form, setForm] = useState({ name: '', preferredName: '', phone: '', timezone: '' })
  const [email, setEmail] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const zones = orderedTimeZones()

  useEffect(() => {
    fetch('/api/portal/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.profile) return
        setForm({
          name: d.profile.name || '',
          preferredName: d.profile.preferred_name || '',
          phone: d.profile.phone || '',
          timezone: d.profile.timezone || '',
        })
        setEmail(d.profile.email)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setSaving(true)
    try {
      const res = await fetch('/api/portal/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setMsg({ ok: true, text: d.warning || 'Saved.' })
      else setMsg({ ok: false, text: d.error || 'Could not save that.' })
    } catch {
      setMsg({ ok: false, text: 'Something went wrong. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <h1 className="text-[16px] font-medium text-tlw-navy-deep">Personal information</h1>
      <p className="mt-1 text-[13px] text-tlw-warm-gray">How the portal knows you and addresses you.</p>
      <form onSubmit={save} className="mt-5 space-y-3">
        <div>
          <label className={label}>Full name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!loaded} autoComplete="name" className={field} />
          <p className="mt-1 text-[11px] text-tlw-warm-gray">As it appears on any report uploaded for you.</p>
        </div>
        <div>
          <label className={label}>What should I call you?</label>
          <input
            value={form.preferredName}
            onChange={(e) => setForm({ ...form, preferredName: e.target.value })}
            disabled={!loaded}
            placeholder={form.name.split(' ')[0] || 'First name'}
            className={field}
          />
          <p className="mt-1 text-[11px] text-tlw-warm-gray">The greeting on your home page and how the assistant addresses you. Leave blank to use your first name.</p>
        </div>
        <div>
          <label className={label}>Email</label>
          <input value={email || ''} disabled className={field} />
          <p className="mt-1 text-[11px] text-tlw-warm-gray">Your sign-in address. To change it, contact your coach or support.</p>
        </div>
        <div>
          <label className={label}>Phone</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!loaded} autoComplete="tel" placeholder="Optional" className={field} />
        </div>
        <div>
          <label className={label}>Timezone</label>
          <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} disabled={!loaded} className={field}>
            <option value="">Not set</option>
            {zones.map((z) => (
              <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-tlw-warm-gray">Session times on your home page show in this timezone.</p>
        </div>
        <Msg msg={msg} />
        <button type="submit" disabled={saving || !loaded || form.name.trim().length < 2} className={button}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  )
}

type ReminderSettings = { weekly: boolean; weekly_day: number; comeback: boolean; comeback_days: 14 | 30 | 60; quarterly: boolean }
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function RemindersSection() {
  const [on, setOn] = useState<boolean | null>(null)
  const [prefs, setPrefs] = useState<ReminderSettings>({ weekly: false, weekly_day: 1, comeback: true, comeback_days: 14, quarterly: true })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    fetch('/api/portal/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.profile) return setOn(true)
        setOn(d.profile.reminders !== false)
        if (d.profile.reminderSettings) setPrefs(d.profile.reminderSettings)
      })
      .catch(() => setOn(true))
  }, [])
  function set<K extends keyof ReminderSettings>(k: K, v: ReminderSettings[K]) {
    setPrefs((p) => ({ ...p, [k]: v }))
    setDirty(true)
    setMsg(null)
  }
  async function save(nextOn = on ?? true) {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/portal/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reminders: nextOn, reminderSettings: prefs }) })
      if (!res.ok) throw new Error()
      setDirty(false)
      setMsg({ ok: true, text: nextOn ? 'Saved.' : 'Reminders are off. You can turn them back on any time.' })
    } catch {
      setMsg({ ok: false, text: 'Could not save that. Please try again.' })
    } finally {
      setSaving(false)
    }
  }
  const row = 'flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-tlw-espresso'
  const select = 'rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-2 py-1 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange disabled:opacity-50'
  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <h2 className="text-[16px] font-medium text-tlw-navy-deep">Email reminders</h2>
      <p className="mt-1 text-[13px] text-tlw-warm-gray">
        Occasional emails from the portal, each with a one-click sign-in link. Never more than one a day. Choose which ones you want.
      </p>
      <label className="mt-4 flex items-center gap-3 text-[14px] font-medium text-tlw-espresso">
        <input
          type="checkbox"
          checked={on ?? true}
          disabled={on === null || saving}
          onChange={(e) => {
            setOn(e.target.checked)
            save(e.target.checked)
          }}
          className="h-4 w-4 accent-tlw-signal-orange"
        />
        Send me reminders
      </label>
      <div className={`mt-4 space-y-3 border-l-2 border-tlw-warm-gray/15 pl-4 ${on === false ? 'opacity-50' : ''}`}>
        <div className={row}>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={prefs.weekly} disabled={on !== true} onChange={(e) => set('weekly', e.target.checked)} className="h-4 w-4 accent-tlw-signal-orange" />
            A nudge to plan my week
          </label>
          <span className="text-[13px] text-tlw-warm-gray">on</span>
          <select className={select} value={prefs.weekly_day} disabled={on !== true || !prefs.weekly} onChange={(e) => set('weekly_day', Number(e.target.value))}>
            {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <span className="text-[12px] text-tlw-warm-gray">— only if I have not saved a plan for that week yet</span>
        </div>
        <div className={row}>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={prefs.comeback} disabled={on !== true} onChange={(e) => set('comeback', e.target.checked)} className="h-4 w-4 accent-tlw-signal-orange" />
            A check-in when I have been away
          </label>
          <span className="text-[13px] text-tlw-warm-gray">after</span>
          <select className={select} value={prefs.comeback_days} disabled={on !== true || !prefs.comeback} onChange={(e) => set('comeback_days', Number(e.target.value) as 14 | 30 | 60)}>
            <option value={14}>2 weeks</option>
            <option value={30}>1 month</option>
            <option value={60}>2 months</option>
          </select>
          <span className="text-[12px] text-tlw-warm-gray">— once, then one more a while later</span>
        </div>
        <div className={row}>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={prefs.quarterly} disabled={on !== true} onChange={(e) => set('quarterly', e.target.checked)} className="h-4 w-4 accent-tlw-signal-orange" />
            A goal review at the start of each quarter
          </label>
          <span className="text-[12px] text-tlw-warm-gray">— the first week of January, April, July, and October</span>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={() => save()} disabled={saving || !dirty || on !== true} className={button}>
          {saving ? 'Saving…' : 'Save reminders'}
        </button>
        <Msg msg={msg} />
      </div>
    </div>
  )
}

function SignInSection() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [hasPassword, setHasPassword] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/portal/auth/password')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setUsername(d.username || '')
          setHasPassword(!!d.hasPassword)
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (password !== confirm) {
      setMsg({ ok: false, text: 'Those passwords do not match.' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/portal/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setMsg({ ok: true, text: 'Saved. You can now sign in with your username and password.' })
        setHasPassword(true)
        setPassword('')
        setConfirm('')
      } else {
        setMsg({ ok: false, text: d.error || 'Could not save that.' })
      }
    } catch {
      setMsg({ ok: false, text: 'Something went wrong. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <h2 className="text-[16px] font-medium text-tlw-navy-deep">{hasPassword ? 'Your sign-in details' : 'Set a username and password'}</h2>
      <p className="mt-1 text-[13px] text-tlw-warm-gray">
        Optional — you can always sign in with an emailed link instead. Setting a password just makes it quicker to get back in.
      </p>
      <form onSubmit={save} className="mt-5 space-y-3">
        <div>
          <label className={label}>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} disabled={!loaded} autoComplete="username" placeholder="yourname" className={field} />
          <p className="mt-1 text-[11px] text-tlw-warm-gray">3–40 characters: letters, numbers, dots, dashes or underscores.</p>
        </div>
        <div>
          <label className={label}>{hasPassword ? 'New password' : 'Password'}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={!loaded} autoComplete="new-password" className={field} />
          <p className="mt-1 text-[11px] text-tlw-warm-gray">At least 10 characters.</p>
        </div>
        <div>
          <label className={label}>Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={!loaded} autoComplete="new-password" className={field} />
        </div>
        <Msg msg={msg} />
        <button type="submit" disabled={saving || !loaded || !username.trim() || !password} className={button}>
          {saving ? 'Saving…' : hasPassword ? 'Update password' : 'Save password'}
        </button>
      </form>
    </div>
  )
}

export default function PortalSettings() {
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="flex items-center justify-between">
        <Link href="/portal" className="text-[13px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
          ← Back
        </Link>
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Settings</p>
        <span className="w-10" />
      </div>
      <div className="mt-8 space-y-6">
        <ProfileSection />
        <RemindersSection />
        <SignInSection />
      </div>
    </div>
  )
}
