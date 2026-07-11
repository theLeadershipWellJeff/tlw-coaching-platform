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

// 'archived' = the permanent record of everyone ever coached — hidden from both
// the Active and Inactive roster lists (its own Archived tab), all data intact.
const STATUSES = ['active', 'prospect', 'inactive', 'archived']

// The client's engagement (from /api/clients/[id]/billing) — editable in the
// Engagement & billing section below. length_months is undefined until
// migration 036 is applied.
type EngagementRow = {
  id: string
  billing_mode: string
  status: string
  rate_hourly: number | null
  monthly_amount: number | null
  billing_day: number | null
  engagement_total: number | null
  session_count: number | null
  length_months?: number | null
}

const ENGAGEMENT_MODES = [
  { val: 'arrears', label: 'Hourly' },
  { val: 'subscription', label: 'Monthly subscription' },
  { val: 'per_engagement', label: 'Fixed total' },
] as const

export function EditClientModal({
  client,
  onClose,
  onSaved,
  onIssueAgreement,
}: {
  client: Client
  onClose: () => void
  onSaved: (c: Client) => void
  /** Opens the issue-agreement flow (details → payment → review → send) after saving. */
  onIssueAgreement?: () => void
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
  // Whether any agreement exists — issued through the platform (any state,
  // including sent-awaiting-signature) or acknowledged on file externally.
  // Only affects the issue button's label ("Issue" vs "Issue a new").
  const [hasAgreement, setHasAgreement] = useState<boolean>(
    !!(client.agreement_id || client.agreement_on_file)
  )

  useEffect(() => {
    fetch('/api/clients/timezones')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => Array.isArray(d?.favorites) && setFavorites(d.favorites))
      .catch(() => {})
  }, [])

  // Engagement & billing — load the client's active engagement so its type,
  // session count, and length are adjustable right here.
  const [engagement, setEngagement] = useState<EngagementRow | null>(null)
  const [engForm, setEngForm] = useState({
    mode: '',
    rate: '',
    monthly: '',
    billingDay: '1',
    total: '',
    sessions: '',
    months: '',
  })

  useEffect(() => {
    fetch(`/api/clients/${client.id}/billing`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.linked || !Array.isArray(d.engagements)) return
        const eng: EngagementRow | undefined =
          d.engagements.find((e: EngagementRow) => e.status === 'active') ?? d.engagements[0]
        if (!eng) return
        setEngagement(eng)
        setEngForm({
          mode: eng.billing_mode,
          rate: eng.rate_hourly != null ? String(eng.rate_hourly) : '',
          monthly: eng.monthly_amount != null ? String(eng.monthly_amount) : '',
          billingDay: eng.billing_day != null ? String(eng.billing_day) : '1',
          total: eng.engagement_total != null ? String(eng.engagement_total) : '',
          sessions: eng.session_count != null ? String(eng.session_count) : '',
          months: eng.length_months != null ? String(eng.length_months) : '',
        })
      })
      .catch(() => {})
  }, [client.id])

  function setEng(key: keyof typeof engForm, val: string) {
    setEngForm((f) => ({ ...f, [key]: val }))
  }

  // The engagement PATCH body — only fields that changed; null clears a value.
  // Throws on an invalid number so persist() surfaces it before any write.
  function engagementUpdates(): Record<string, unknown> {
    if (!engagement) return {}
    const num = (raw: string, label: string, integer = false): number | null => {
      const s = raw.trim()
      if (!s) return null
      const n = Number(s)
      if (Number.isNaN(n) || n < 0 || (integer && !Number.isInteger(n))) {
        throw new Error(`${label} must be a non-negative ${integer ? 'whole ' : ''}number.`)
      }
      return n
    }
    const updates: Record<string, unknown> = {}
    const mode = engForm.mode || engagement.billing_mode
    if (mode !== engagement.billing_mode) updates.billing_mode = mode

    const sessions = num(engForm.sessions, 'Sessions', true)
    if (sessions !== (engagement.session_count ?? null)) updates.session_count = sessions
    const months = num(engForm.months, 'Length (months)', true)
    if (months !== (engagement.length_months ?? null)) updates.length_months = months

    if (mode === 'arrears') {
      const rate = num(engForm.rate, 'Hourly rate')
      if (rate !== (engagement.rate_hourly ?? null)) updates.rate_hourly = rate
    } else if (mode === 'subscription') {
      const monthly = num(engForm.monthly, 'Monthly amount')
      if (monthly !== (engagement.monthly_amount ?? null)) updates.monthly_amount = monthly
      const day = num(engForm.billingDay, 'Billing day', true)
      if (day !== null && (day < 1 || day > 28)) throw new Error('Billing day must be between 1 and 28.')
      if (day !== (engagement.billing_day ?? null)) updates.billing_day = day
    } else if (mode === 'per_engagement') {
      const total = num(engForm.total, 'Engagement total')
      if (total !== (engagement.engagement_total ?? null)) updates.engagement_total = total
    }
    return updates
  }

  useEffect(() => {
    if (!onIssueAgreement) return
    fetch(`/api/clients/${client.id}/agreements`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => Array.isArray(d?.agreements) && d.agreements.length > 0 && setHasAgreement(true))
      .catch(() => {})
  }, [client.id, onIssueAgreement])

  function set(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  // Persists the form; returns true on success so callers can chain (close /
  // open the issue-agreement flow).
  async function persist(): Promise<boolean> {
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
      // Validate the engagement edits BEFORE writing anything, so a bad number
      // can't leave the client saved but the engagement not.
      const engUpdates = engagementUpdates()

      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      onSaved(data.client)

      if (engagement && Object.keys(engUpdates).length > 0) {
        const engRes = await fetch(`/api/billing/engagements/${engagement.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(engUpdates),
        })
        const engData = await engRes.json().catch(() => ({}))
        if (!engRes.ok) {
          throw new Error(
            `Client saved, but the engagement update failed: ${engData.error || 'unknown error'}`
          )
        }
        if (engData.engagement) setEngagement(engData.engagement)
      }
      return true
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
      return false
    }
  }

  async function save() {
    if (await persist()) onClose()
  }

  // Save first so the issue flow prefills the just-edited name/email/phone.
  async function saveAndIssue() {
    if (await persist()) {
      onClose()
      onIssueAgreement?.()
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

          {onIssueAgreement && (
            <div className="mt-3 border-t border-tlw-warm-gray/15 pt-3">
              <button
                type="button"
                onClick={saveAndIssue}
                disabled={saving}
                className="rounded-tlw-lg border border-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-navy-rich transition-colors hover:bg-tlw-navy-rich hover:text-tlw-cream disabled:opacity-40"
              >
                {hasAgreement ? 'Issue a new agreement' : 'Issue coaching agreement'}
              </button>
              <p className="mt-1.5 text-[11px] leading-snug text-tlw-warm-gray">
                Saves your edits, then opens the issue flow — confirm the details and the engagement&apos;s
                payment terms, review the full document, and send it for e-signature.
              </p>
            </div>
          )}
        </div>

        {engagement && (
          <div className="block rounded-tlw-md border border-tlw-warm-gray/20 bg-tlw-canvas/60 p-3">
            <span className="text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">
              Engagement &amp; billing
            </span>

            <div className="mt-2">
              <span className="text-[11px] text-tlw-warm-gray">Type</span>
              <div className="mt-1 flex gap-2">
                {ENGAGEMENT_MODES.map(({ val, label }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setEng('mode', val)}
                    className={`flex-1 rounded-tlw-md border px-2 py-1.5 text-[12px] font-medium transition-colors ${
                      (engForm.mode || engagement.billing_mode) === val
                        ? 'border-tlw-navy-rich bg-tlw-navy-rich text-tlw-cream'
                        : 'border-tlw-warm-gray/25 text-tlw-espresso hover:bg-tlw-canvas'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {(engForm.mode || engagement.billing_mode) !== engagement.billing_mode && (
                <p className="mt-1.5 text-[11px] leading-snug text-amber-600">
                  Changing the type changes how this client is invoiced from the next billing run.
                </p>
              )}
            </div>

            {(engForm.mode || engagement.billing_mode) === 'arrears' && (
              <label className="mt-3 block">
                <span className="text-[11px] text-tlw-warm-gray">Hourly rate</span>
                <div className="mt-1 flex items-center rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 focus-within:border-tlw-signal-orange">
                  <span className="text-[13px] text-tlw-warm-gray">$</span>
                  <input
                    type="number" min="0" step="any" inputMode="decimal"
                    value={engForm.rate}
                    placeholder="e.g. 500"
                    onChange={(e) => setEng('rate', e.target.value)}
                    className="w-full bg-transparent py-2 pl-1 text-[13px] text-tlw-espresso outline-none"
                  />
                </div>
              </label>
            )}

            {(engForm.mode || engagement.billing_mode) === 'subscription' && (
              <div className="mt-3 flex gap-3">
                <label className="block flex-1">
                  <span className="text-[11px] text-tlw-warm-gray">Monthly amount</span>
                  <div className="mt-1 flex items-center rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 focus-within:border-tlw-signal-orange">
                    <span className="text-[13px] text-tlw-warm-gray">$</span>
                    <input
                      type="number" min="0" step="any" inputMode="decimal"
                      value={engForm.monthly}
                      placeholder="e.g. 1500"
                      onChange={(e) => setEng('monthly', e.target.value)}
                      className="w-full bg-transparent py-2 pl-1 text-[13px] text-tlw-espresso outline-none"
                    />
                  </div>
                </label>
                <label className="block w-24">
                  <span className="text-[11px] text-tlw-warm-gray">Billing day</span>
                  <input
                    type="number" min="1" max="28"
                    value={engForm.billingDay}
                    onChange={(e) => setEng('billingDay', e.target.value)}
                    className="mt-1 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                  />
                </label>
              </div>
            )}

            {(engForm.mode || engagement.billing_mode) === 'per_engagement' && (
              <label className="mt-3 block">
                <span className="text-[11px] text-tlw-warm-gray">Engagement total</span>
                <div className="mt-1 flex items-center rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 focus-within:border-tlw-signal-orange">
                  <span className="text-[13px] text-tlw-warm-gray">$</span>
                  <input
                    type="number" min="0" step="any" inputMode="decimal"
                    value={engForm.total}
                    placeholder="e.g. 6000"
                    onChange={(e) => setEng('total', e.target.value)}
                    className="w-full bg-transparent py-2 pl-1 text-[13px] text-tlw-espresso outline-none"
                  />
                </div>
              </label>
            )}

            <div className="mt-3 flex gap-3">
              <label className="block flex-1">
                <span className="text-[11px] text-tlw-warm-gray">
                  {(engForm.mode || engagement.billing_mode) === 'subscription'
                    ? 'Sessions per year'
                    : 'Sessions in engagement'}
                </span>
                <input
                  type="number" min="0" step="1"
                  value={engForm.sessions}
                  placeholder={(engForm.mode || engagement.billing_mode) === 'subscription' ? 'e.g. 40' : 'e.g. 12'}
                  onChange={(e) => setEng('sessions', e.target.value)}
                  className="mt-1 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                />
              </label>
              {(engForm.mode || engagement.billing_mode) !== 'subscription' && (
                <label className="block w-32">
                  <span className="text-[11px] text-tlw-warm-gray">Length (months)</span>
                  <input
                    type="number" min="0" step="1"
                    value={engForm.months}
                    placeholder="e.g. 6"
                    onChange={(e) => setEng('months', e.target.value)}
                    className="mt-1 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                  />
                </label>
              )}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-tlw-warm-gray">
              These drive the engagement bar on the client cards — a subscription tracks sessions
              received this year against sessions per year; other engagements track total sessions.
              The length shows as e.g. &ldquo;6-Month Engagement&rdquo;.
            </p>
          </div>
        )}

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
