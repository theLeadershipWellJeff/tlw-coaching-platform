'use client'
import { useEffect, useState } from 'react'
import { api, btnLink, btnPrimary, Chip, ErrorLine, fmtDate, input, Section } from './ui'

type Brief = { id: string; slug: string; version: number; title: string; body: string; is_active: boolean; created_at: string }

/** The briefs the portal reads. Each is versioned independently. */
const BRIEFS: Array<{ slug: string; label: string; sub: string }> = [
  {
    slug: 'assessment_360',
    label: '360 interpretation brief',
    sub: 'The instrument-specific guidance the assistant reads for every 360 conversation. The grounding rules (perception not ability, no rater attribution, no prescribing goals) are enforced in code beneath every version.',
  },
  {
    slug: 'weekly_plan',
    label: 'Plan your week brief',
    sub: 'The coaching persona and behaviour for the Plan-your-week conversation (the goal-setting master prompt). The portal adds the client\'s goals, 360 development picture, documents, and recent plans beneath it.',
  },
]

export function BriefPanel() {
  const [slugIndex, setSlugIndex] = useState(0)
  const SLUG = BRIEFS[slugIndex].slug
  const [briefs, setBriefs] = useState<Brief[] | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  async function load() {
    try {
      const d = await api<{ briefs: Brief[] }>(`/api/admin/briefs?slug=${SLUG}`)
      setBriefs(d.briefs)
      const active = d.briefs.find((b) => b.is_active)
      setTitle(active?.title || '')
      setBody(active?.body || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load.')
      setBriefs([])
    }
  }
  useEffect(() => {
    setBriefs(null)
    setSaved('')
    setError('')
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SLUG])

  const active = (briefs || []).find((b) => b.is_active)
  const dirty = active ? active.body !== body || active.title !== title : body.length > 0

  async function saveVersion() {
    setBusy(true)
    setError('')
    setSaved('')
    try {
      const d = await api<{ brief: Brief }>('/api/admin/briefs', { method: 'POST', body: JSON.stringify({ slug: SLUG, title, body, activate: true }) })
      setSaved(`Saved and activated version ${d.brief.version}. It applies to the next chat message — no deploy.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }
  async function activate(b: Brief) {
    if (!window.confirm(`Make version ${b.version} the active brief?`)) return
    setBusy(true)
    setError('')
    try {
      await api(`/api/admin/briefs/${b.id}`, { method: 'POST' })
      setTitle(b.title)
      setBody(b.body)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not activate.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-tlw-lg bg-tlw-canvas p-0.5 self-start">
        {BRIEFS.map((b, i) => (
          <button
            key={b.slug}
            onClick={() => setSlugIndex(i)}
            className={`rounded-tlw-md px-3 py-1 text-[12px] font-medium transition-colors ${i === slugIndex ? 'bg-tlw-surface text-tlw-navy-deep shadow-sm' : 'text-tlw-warm-gray hover:text-tlw-espresso'}`}
          >
            {b.label}
          </button>
        ))}
      </div>
      <Section
        title={BRIEFS[slugIndex].label}
        sub={`${BRIEFS[slugIndex].sub} Saving creates a new version and activates it — effective on the next message, no deploy.`}
        actions={active ? <Chip tone="green">active: v{active.version}</Chip> : <Chip>no active brief</Chip>}
      >
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Extraordinary Leader debrief brief v2)" />
        <textarea className={`${input} mt-2 font-mono text-[12px]`} rows={22} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the brief here…" />
        <div className="mt-2 flex items-center gap-3">
          <button className={btnPrimary} disabled={busy || !dirty || !title.trim() || body.trim().length < 40} onClick={saveVersion}>{busy ? 'Saving…' : 'Save as new version & activate'}</button>
          {saved && <p className="text-[12px] text-emerald-700">{saved}</p>}
        </div>
        <ErrorLine error={error} />
      </Section>

      <Section title="Versions" sub="Older versions stay so engagement can be compared across revisions (each reply is stamped with the version that produced it). Activate one to roll back.">
        {briefs === null ? (
          <p className="text-[13px] text-tlw-warm-gray">Loading…</p>
        ) : (
          <ul className="divide-y divide-tlw-warm-gray/10">
            {briefs.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                <p className="text-tlw-espresso">
                  v{b.version} · {b.title} <span className="text-tlw-warm-gray">· {fmtDate(b.created_at)}</span> {b.is_active && <Chip tone="green">active</Chip>}
                </p>
                {!b.is_active && <button className={btnLink} disabled={busy} onClick={() => activate(b)}>Activate</button>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
