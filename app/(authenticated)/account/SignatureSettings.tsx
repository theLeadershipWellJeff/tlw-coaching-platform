'use client'
import { useEffect, useMemo, useState } from 'react'
import { buildSignatureHtmlFromFields, type SignatureFields } from '@/lib/signature'

/**
 * Account → Email signature. The coach builds their own signature from
 * structured fields; the rendered, email-safe block is what every send appends
 * server-side. Saved via PUT /api/email/signature; "Reset" (DELETE) falls back
 * to a generic signature built from the coach's name and email.
 */
export function SignatureSettings() {
  const [name, setName] = useState('')
  const [title, setTitle] = useState('Executive Coach · theLeadershipWell')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [bookingUrl, setBookingUrl] = useState('')
  const [custom, setCustom] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [sigRes, coachRes] = await Promise.all([fetch('/api/email/signature'), fetch('/api/coach')])
        const sig = sigRes.ok ? await sigRes.json() : null
        const coachData = coachRes.ok ? await coachRes.json() : null
        if (cancelled) return
        const f: SignatureFields | null = sig?.fields ?? null
        const coach = coachData?.coach
        setCustom(!!sig?.custom)
        setName(f?.name ?? coach?.name ?? '')
        if (f?.title) setTitle(f.title)
        setEmail(f?.email ?? coach?.email ?? '')
        setPhone(f?.phone ?? '')
        setWebsite(f?.website ?? '')
        setBookingUrl(f?.bookingUrl ?? '')
      } catch {
        /* leave defaults */
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Live preview — the same pure renderer the server uses at save time.
  const previewHtml = useMemo(() => {
    if (!name.trim() || !email.trim()) return ''
    return buildSignatureHtmlFromFields({
      name: name.trim(),
      title: title.trim() || 'Executive Coach · theLeadershipWell',
      email: email.trim(),
      phone: phone.trim() || undefined,
      website: website.trim() || undefined,
      bookingUrl: bookingUrl.trim() || undefined,
    })
  }, [name, title, email, phone, website, bookingUrl])

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/email/signature', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, title, email, phone, website, bookingUrl }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setCustom(true)
        setMsg({ ok: true, text: 'Saved — every future email will carry this signature.' })
      } else {
        setMsg({ ok: false, text: data.error || 'Could not save.' })
      }
    } catch {
      setMsg({ ok: false, text: 'Network error while saving.' })
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/email/signature', { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setCustom(false)
        setMsg({ ok: true, text: 'Reset — sends now use the standard signature with your name and email.' })
        if (data.fields === null) {
          setPhone('')
          setWebsite('')
          setBookingUrl('')
        }
      } else {
        setMsg({ ok: false, text: data.error || 'Could not reset.' })
      }
    } catch {
      setMsg({ ok: false, text: 'Network error while resetting.' })
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-white px-3 py-2 text-[13px] text-tlw-espresso disabled:opacity-50'
  const label = 'mb-1 block text-[12px] font-medium text-tlw-espresso'

  return (
    <div className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Email signature</p>
      <p className="mb-4 text-[13px] text-tlw-warm-gray">
        Appended to every email the app sends on your behalf — composed emails, session recaps, nudges.
        {custom ? ' You have a custom signature saved.' : ' You haven’t saved one yet, so a standard signature with your name and email is used.'}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={!loaded} className={field} placeholder="Your name" />
        </div>
        <div>
          <label className={label}>Title line</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!loaded} className={field} placeholder="Executive Coach · theLeadershipWell" />
        </div>
        <div>
          <label className={label}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!loaded} className={field} placeholder="you@example.com" />
        </div>
        <div>
          <label className={label}>Phone (optional)</label>
          <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!loaded} className={field} placeholder="(555) 555-1234" />
        </div>
        <div>
          <label className={label}>Website (optional)</label>
          <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} disabled={!loaded} className={field} placeholder="theleadershipwell.com" />
        </div>
        <div>
          <label className={label}>Booking link (optional)</label>
          <input type="url" value={bookingUrl} onChange={(e) => setBookingUrl(e.target.value)} disabled={!loaded} className={field} placeholder="https://…" />
        </div>
      </div>

      {previewHtml && (
        <div className="mt-4">
          <p className="mb-1 text-[12px] font-medium text-tlw-espresso">Preview</p>
          <div
            className="rounded-tlw-md border border-tlw-warm-gray/20 bg-white px-4 pb-4"
            // Safe: previewHtml is generated by our own pure renderer from the
            // escaped field values above — no foreign HTML.
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !loaded || !name.trim() || !email.trim()}
          className="rounded-tlw-md bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity duration-tlw-base hover:opacity-90 disabled:opacity-40"
        >
          {saving ? 'saving…' : 'save signature'}
        </button>
        {custom && (
          <button
            onClick={reset}
            disabled={saving || !loaded}
            className="rounded-tlw-md border border-tlw-warm-gray/25 px-4 py-2 text-[13px] font-medium text-tlw-espresso transition-opacity duration-tlw-base hover:opacity-80 disabled:opacity-40"
          >
            reset to standard
          </button>
        )}
      </div>
      {msg && (
        <p className="mt-2 text-[12px]" style={{ color: msg.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
