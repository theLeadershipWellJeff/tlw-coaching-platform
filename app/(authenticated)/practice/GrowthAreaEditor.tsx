'use client'
import { useState } from 'react'
import type { CoachGrowthArea, GrowthAreaBand } from '@/lib/supabase/types'

// ── Types ────────────────────────────────────────────────────────────────────

interface AreaDraft {
  title: string
  description: string
  least_proficient_when: string
  most_proficient_when: string
  band_scale: GrowthAreaBand[]
}

function emptyDraft(): AreaDraft {
  return {
    title: '',
    description: '',
    least_proficient_when: '',
    most_proficient_when: '',
    band_scale: [],
  }
}

function areaToD(area: CoachGrowthArea): AreaDraft {
  return {
    title: area.title,
    description: area.description,
    least_proficient_when: area.least_proficient_when,
    most_proficient_when: area.most_proficient_when,
    band_scale: area.band_scale,
  }
}

// ── Band scale editor ─────────────────────────────────────────────────────────

function BandScaleEditor({
  bands,
  onChange,
}: {
  bands: GrowthAreaBand[]
  onChange: (bands: GrowthAreaBand[]) => void
}) {
  function update(index: number, description: string) {
    const next = bands.map((b, i) =>
      i === index ? { ...b, description, coach_edited: true } : b
    )
    onChange(next)
  }

  const BAND_LABELS: Record<number, string> = {
    1: 'Band 1 — floor',
    2: 'Band 2',
    3: 'Band 3',
    4: 'Band 4',
    5: 'Band 5 — ceiling',
  }

  return (
    <div className="space-y-2">
      {bands.map((b, i) => (
        <div key={b.band} className="rounded-tlw-lg border border-tlw-warm-gray/15 p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[1px] text-tlw-warm-gray">
              {BAND_LABELS[b.band] ?? `Band ${b.band}`}
            </p>
            {b.coach_edited && (
              <span className="rounded-full bg-tlw-signal-orange/10 px-2 py-0.5 text-[9px] font-medium text-tlw-signal-orange">
                hand-edited
              </span>
            )}
          </div>
          <textarea
            value={b.description}
            rows={2}
            onChange={(e) => update(i, e.target.value)}
            className="w-full rounded-tlw-md border border-tlw-warm-gray/20 bg-tlw-surface px-2 py-1.5 text-[12px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
          />
        </div>
      ))}
    </div>
  )
}

// ── Main editor ───────────────────────────────────────────────────────────────

export function GrowthAreaEditor({
  area,
  onSaved,
  onCancel,
}: {
  area?: CoachGrowthArea
  onSaved: (area: CoachGrowthArea) => void
  onCancel: () => void
}) {
  const isNew = !area
  const [draft, setDraft] = useState<AreaDraft>(area ? areaToD(area) : emptyDraft())
  const [busy, setBusy] = useState<'save' | 'generate' | null>(null)
  const [error, setError] = useState('')

  function set<K extends keyof AreaDraft>(key: K, value: AreaDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function generateBands() {
    if (!draft.least_proficient_when.trim() || !draft.most_proficient_when.trim()) {
      setError('Fill in both anchor phrases before generating the band scale.')
      return
    }
    setBusy('generate')
    setError('')
    try {
      const id = area?.id ?? 'new'
      const res = await fetch(`/api/growth-areas/${id}/generate-bands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title,
          description: draft.description,
          least_proficient_when: draft.least_proficient_when,
          most_proficient_when: draft.most_proficient_when,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      // Only overwrite bands that haven't been hand-edited.
      setDraft((d) => {
        const existing = d.band_scale
        const merged = (data.bands as GrowthAreaBand[]).map((newBand) => {
          const old = existing.find((b) => b.band === newBand.band)
          return old?.coach_edited ? old : newBand
        })
        return { ...d, band_scale: merged }
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed.')
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!draft.title.trim()) {
      setError('A title is required.')
      return
    }
    setBusy('save')
    setError('')
    try {
      const url = isNew ? '/api/growth-areas' : `/api/growth-areas/${area!.id}`
      const method = isNew ? 'POST' : 'PATCH'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      onSaved(data.area)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(null)
    }
  }

  const hasBands = draft.band_scale.length === 5
  const canGenerate = draft.least_proficient_when.trim() && draft.most_proficient_when.trim()

  return (
    <div className="space-y-5">
      {/* Title */}
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[1px] text-tlw-warm-gray">
          Growth area title
        </label>
        <input
          value={draft.title}
          placeholder="e.g. Staying curious in the face of resistance"
          onChange={(e) => set('title', e.target.value)}
          className="w-full rounded-tlw-md border border-tlw-warm-gray/20 bg-tlw-surface px-3 py-2 text-[13px] font-medium text-tlw-navy-deep outline-none focus:border-tlw-signal-orange placeholder:text-tlw-warm-gray/60"
        />
      </div>

      {/* Description */}
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[1px] text-tlw-warm-gray">
          Description (optional)
        </label>
        <textarea
          value={draft.description}
          placeholder="Further context — what this area means to you, why it matters…"
          rows={2}
          onChange={(e) => set('description', e.target.value)}
          className="w-full rounded-tlw-md border border-tlw-warm-gray/20 bg-tlw-surface px-3 py-2 text-[12px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
        />
      </div>

      {/* Anchor phrases */}
      <div className="rounded-tlw-xl border border-tlw-warm-gray/15 p-4 space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-[1px] text-tlw-warm-gray">
          Proficiency anchors
        </p>
        <p className="text-[12px] text-tlw-warm-gray leading-relaxed">
          Write these in your own words. They anchor the floor and ceiling of the 1–5 scale — bands 2–4 will be
          interpolated from them.
        </p>
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-tlw-espresso">
            I am least proficient when…
          </label>
          <textarea
            value={draft.least_proficient_when}
            placeholder="Describe what you notice when this isn't going well in a session…"
            rows={3}
            onChange={(e) => set('least_proficient_when', e.target.value)}
            className="w-full rounded-tlw-md border border-tlw-warm-gray/20 bg-tlw-surface px-3 py-2 text-[12px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-tlw-espresso">
            I am most proficient when…
          </label>
          <textarea
            value={draft.most_proficient_when}
            placeholder="Describe what it looks and feels like when this is going really well…"
            rows={3}
            onChange={(e) => set('most_proficient_when', e.target.value)}
            className="w-full rounded-tlw-md border border-tlw-warm-gray/20 bg-tlw-surface px-3 py-2 text-[12px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
          />
        </div>
      </div>

      {/* Band scale */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[1px] text-tlw-warm-gray">
            1–5 proficiency scale
          </p>
          <button
            onClick={generateBands}
            disabled={!canGenerate || busy !== null}
            className="text-[12px] font-medium text-tlw-signal-orange hover:underline disabled:opacity-40"
          >
            {busy === 'generate' ? 'generating…' : hasBands ? 'regenerate' : 'generate from anchors'}
          </button>
        </div>

        {hasBands ? (
          <BandScaleEditor bands={draft.band_scale} onChange={(b) => set('band_scale', b)} />
        ) : (
          <p className="text-[12px] text-tlw-warm-gray">
            {canGenerate
              ? 'Click "generate from anchors" to build the scale, or write the bands by hand.'
              : 'Fill in both anchor phrases above, then generate the scale.'}
          </p>
        )}
      </div>

      {error && <p className="text-[12px] text-tlw-signal-orange">{error}</p>}

      <div className="flex items-center justify-end gap-3 pt-1">
        <button onClick={onCancel} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy !== null}
          className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy === 'save' ? 'Saving…' : isNew ? 'Create growth area' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
