'use client'
import { useEffect, useState } from 'react'
import type { Client } from '@/lib/supabase/types'
import { Modal } from '@/app/components/shared/Modal'
import { TimezoneCombobox } from '@/app/components/shared/TimezoneCombobox'

const FIELDS: { key: keyof Client; label: string; type?: string; placeholder?: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'company', label: 'Company' },
  { key: 'title', label: 'Title / role' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
]

const STATUSES = ['active', 'prospect', 'inactive']

export function EditClientModal({
  client,
  onClose,
  onSaved,
}: {
  client: Client
  onClose: () => void
  onSaved: (c: Client) => void
}) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {
      status: client.status || 'active',
      bio: client.bio || '',
      session_fee: client.session_fee != null ? String(client.session_fee) : '',
      timezone: client.timezone || '',
      timezone_label: client.timezone_label || '',
      client_type: (client as any).client_type || 'client',
    }
    for (const { key } of FIELDS) f[key] = (client[key] as string) || ''
    return f
  })
  // Agreement acknowledgment — the same clients columns the scoring engine's
  // Gate 1 reads (migration 018). Lets the coach record an agreement signed on
  // another platform (e.g. Coach Accountable) without re-issuing one here.
  const [agreementOnFile, setAgreementOnFile] = useState<boolean>(!!client.agreement_on_file)
  const [recording, setRecording] = useState<'yes' | 'no' | 'unset'>(
    client.recording_authorized === true ? 'yes' : client.recording_authorized === false ? 'no' : 'unset'
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Favorite zones learned from the coach's existing clients (+ their own zone).
  const [favorites, setFavorites] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/clients/timezones')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => Array.isArray(d?.favorites) && setFavorites(d.favorites))
      .catch(() => {})
  }, [])

  function set(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const feeRaw = form.session_fee.trim()
      const fee = feeRaw ? Number(feeRaw) : null
      if (feeRaw && (Number.isNaN(fee) || (fee as number) < 0)) {
        throw new Error('Session fee must be a non-negative number.')
      }
      const payload: Record<string, unknown> = {
        status: form.status,
        bio: form.bio.trim() || null,
        session_fee: fee,
        timezone: form.timezone.trim() || null,
        timezone_label: form.timezone.trim() ? form.timezone_label.trim() || null : null,
        client_type: form.client_type,
        agreement_on_file: agreementOnFile,
        recording_authorized: recording === 'yes' ? true : recording === 'no' ? false : null,
      }
      for (const { key } of FIELDS) payload[key] = form[key].trim() || (key === 'name' ? form[key] : null)
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      onSaved(data.client)
      onClose()
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <Modal title="Edit client" onClose={onClose}>
      <div className="space-y-3">
        {FIELDS.map(({ key, label, type, placeholder }) => (
          <label key={key} className="block">
            <span className="text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">{label}</span>
            <input
              type={type || 'text'}
              value={form[key]}
              placeholder={placeholder}
              onChange={(e) => set(key, e.target.value)}
              className="mt-1 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
            />
          </label>
        ))}

        <div className="block">
          <span className="text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">Timezone</span>
          <div className="mt-1">
            <TimezoneCombobox
              value={form.timezone}
              label={form.timezone_label || undefined}
              onChange={(z, lbl) => {
                set('timezone', z)
                set('timezone_label', z ? lbl || '' : '')
              }}
              favorites={favorites}
              placeholder="Type a city — e.g. Austin, London…"
            />
          </div>
          <span className="mt-1 block text-[11px] text-tlw-warm-gray">
            Type a city to set the zone. Shown under the scheduler so you can confirm the client&apos;s local time.
          </span>
        </div>

        <div className="block">
          <span className="text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">Role</span>
          <div className="mt-1 flex gap-2">
            {(['client', 'coach'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set('client_type', t)}
                className={`flex-1 rounded-tlw-md border px-3 py-2 text-[13px] font-medium capitalize transition-colors ${
                  form.client_type === t
                    ? 'border-tlw-navy-rich bg-tlw-navy-rich text-tlw-cream'
                    : 'border-tlw-warm-gray/25 text-tlw-espresso hover:bg-tlw-canvas'
                }`}
              >
                {t === 'coach' ? 'Team coach' : 'Coaching client'}
              </button>
            ))}
          </div>
          {form.client_type === 'coach' && (
            <p className="mt-1 text-[11px] text-tlw-warm-gray">
              This person will appear in &ldquo;My Team&rdquo; on the roster instead of the main client list. Notes and transcripts are unchanged.
            </p>
          )}
        </div>

        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">Status</span>
          <select
            value={form.status}
            onChange={(e) => set('status', e.target.value)}
            className="mt-1 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] capitalize text-tlw-espresso outline-none focus:border-tlw-signal-orange"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div className="block rounded-tlw-md border border-tlw-warm-gray/20 bg-tlw-canvas/60 p-3">
          <span className="text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">Agreement &amp; recording</span>
          <label className="mt-2 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={agreementOnFile}
              onChange={(e) => setAgreementOnFile(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-tlw-navy-rich"
            />
            <span className="text-[13px] text-tlw-espresso">
              Signed coaching agreement on file
              <span className="mt-0.5 block text-[11px] leading-snug text-tlw-warm-gray">
                Check this for an agreement signed outside this platform (e.g. Coach Accountable) — no need to
                re-issue. The scorecard&apos;s ethics gate (C1) reads this directly.
              </span>
            </span>
          </label>
          <div className="mt-3">
            <span className="text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">
              Recording &amp; AI processing
            </span>
            <div className="mt-1 flex gap-2">
              {([
                { val: 'yes', label: 'Authorized' },
                { val: 'no', label: 'Do not record' },
                { val: 'unset', label: 'Not set' },
              ] as const).map(({ val, label }) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRecording(val)}
                  className={`flex-1 rounded-tlw-md border px-2 py-1.5 text-[12px] font-medium transition-colors ${
                    recording === val
                      ? val === 'no'
                        ? 'border-tlw-signal-orange bg-tlw-signal-orange/10 text-tlw-signal-orange'
                        : 'border-tlw-navy-rich bg-tlw-navy-rich text-tlw-cream'
                      : 'border-tlw-warm-gray/25 text-tlw-espresso hover:bg-tlw-canvas'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {recording === 'no' && (
              <p className="mt-1.5 text-[11px] leading-snug" style={{ color: '#E8650A' }}>
                ⚑ A non-dismissible no-recording flag will show on this client&apos;s workspace, and any scored
                session will carry a manual-review flag.
              </p>
            )}
          </div>
        </div>

        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">Session fee (per hour)</span>
          <div className="mt-1 flex items-center rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 focus-within:border-tlw-signal-orange">
            <span className="text-[13px] text-tlw-warm-gray">$</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={form.session_fee}
              placeholder="e.g. 350"
              onChange={(e) => set('session_fee', e.target.value)}
              className="w-full bg-transparent py-2 pl-1 text-[13px] text-tlw-espresso outline-none"
            />
          </div>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">Background / bio</span>
          <textarea
            value={form.bio}
            onChange={(e) => set('bio', e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
          />
        </label>

        {error && <p className="text-[12px] text-tlw-signal-orange">{error}</p>}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button onClick={onClose} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
