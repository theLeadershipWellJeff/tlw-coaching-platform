'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Client } from '@/lib/supabase/types'

type Component = { name: string; description: string }
type CoachingMap = { name: string; blurb?: string; components: Component[] }

const MAPS: CoachingMap[] = [
  {
    name: 'The 6 Components',
    components: [
      { name: 'Identity', description: 'Who you believe yourself to be — values, strengths, and the story you tell about yourself.' },
      { name: 'Mindset', description: 'The habitual patterns of thought that shape how you interpret challenge, failure, and opportunity.' },
      { name: 'Relationships', description: 'The quality and health of the connections that enable — or constrain — your leadership.' },
      { name: 'Practices', description: 'The consistent habits and rituals that sustain your energy and effectiveness over time.' },
      { name: 'Environment', description: 'The physical, cultural, and systemic context you operate in, and how it supports or limits you.' },
      { name: 'Impact', description: 'The difference you are making — outcomes, legacy, and how your work ripples outward.' },
    ],
  },
  {
    name: 'The Airplane Model',
    blurb: 'Wings / Engines / Fuel / Fuselage — the structural picture',
    components: [
      { name: 'Wings', description: 'Vision and direction — the lift that keeps you moving forward and sets the trajectory.' },
      { name: 'Engines', description: 'Drive and motivation — what powers you and keeps momentum even in resistance.' },
      { name: 'Fuel', description: 'Resources, energy, and support — what you need to sustain the journey without burning out.' },
      { name: 'Fuselage', description: 'Your core structure — the values, character, and integrity that hold everything together.' },
    ],
  },
  {
    name: 'First 90 Days',
    components: [
      { name: 'Listen & Learn', description: 'Resist the urge to act. Gather data, build relationships, and understand the real landscape.' },
      { name: 'Diagnose', description: 'Identify the critical challenges and opportunities based on what you\'ve heard and observed.' },
      { name: 'Build Allies', description: 'Cultivate key relationships across the organization — up, across, and down.' },
      { name: 'Early Wins', description: 'Choose a visible, achievable win that builds credibility and signals your leadership style.' },
      { name: 'Set Direction', description: 'Communicate a clear vision and priorities so the team knows where you\'re headed together.' },
    ],
  },
  {
    name: 'Who I Am Becoming',
    components: [
      { name: 'The Gap', description: 'The honest distance between who you are today and the leader you sense yourself becoming.' },
      { name: 'Core Convictions', description: 'The non-negotiable beliefs and values that anchor your identity through change.' },
      { name: 'Formative Experiences', description: 'The moments — good and hard — that have shaped you most deeply as a person and leader.' },
      { name: 'Emerging Self', description: 'The qualities, capacities, and ways of being you are actively growing into.' },
      { name: 'Legacy', description: 'What you want to be true of you — the lasting mark of how you led and lived.' },
    ],
  },
  {
    name: 'The Becoming Map',
    components: [
      { name: 'Origin', description: 'Where you come from — the background, story, and experiences that formed your foundation.' },
      { name: 'Anchors', description: 'The values, people, and commitments that keep you grounded when everything is shifting.' },
      { name: 'Tensions', description: 'The creative friction between who you\'ve been and who you\'re called to become.' },
      { name: 'Threshold', description: 'The liminal space of transformation — what it feels like to be in between.' },
      { name: 'Horizon', description: 'The vision of the person and leader you are moving toward — not yet arrived, but clearly sensed.' },
    ],
  },
]

type Size = 'small' | 'medium' | 'large'

export function CoachingMapCard({
  client,
  onUpdated,
}: {
  client: Client
  onUpdated: (c: Client) => void
}) {
  const value = client.coaching_map || ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [size, setSize] = useState<Size>('medium')
  const [viewOpen, setViewOpen] = useState(false)

  const options = MAPS.some((m) => m.name === value) || !value ? MAPS : [...MAPS, { name: value, components: [] }]
  const selectedMap = MAPS.find((m) => m.name === value)

  async function save() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coaching_map: draft.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      onUpdated(data.client)
      setEditing(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-surface p-3">
      {/* Header row */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-deep">Coaching map</p>
        <div className="flex items-center gap-2">
          {!editing && value && (
            <div className="flex items-center gap-0.5 rounded border border-tlw-warm-gray/20 bg-tlw-cream/60 px-1 py-0.5">
              {(['small', 'medium', 'large'] as Size[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  title={s.charAt(0).toUpperCase() + s.slice(1)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                    size === s
                      ? 'bg-tlw-navy-rich text-tlw-cream'
                      : 'text-tlw-warm-gray hover:text-tlw-espresso'
                  }`}
                >
                  {s === 'small' ? 'S' : s === 'medium' ? 'M' : 'L'}
                </button>
              ))}
            </div>
          )}
          {!editing && (
            <button
              onClick={() => {
                setDraft(value)
                setEditing(true)
              }}
              className="text-[11px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
            >
              edit
            </button>
          )}
        </div>
      </div>

      {error && <p className="mb-2 text-[11px] text-tlw-signal-orange">{error}</p>}

      {editing ? (
        <div className="space-y-2">
          <select
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            className="w-full rounded-tlw-md border border-tlw-warm-gray/20 bg-tlw-surface px-2 py-1.5 text-[12px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
          >
            <option value="">— select a map —</option>
            {options.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setEditing(false)}
              className="text-[11px] text-tlw-warm-gray hover:text-tlw-espresso"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="rounded-tlw-md bg-tlw-navy-rich px-3 py-1.5 text-[11px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : value ? (
        <MapView map={selectedMap} fallbackName={value} size={size} onOpen={() => setViewOpen(true)} />
      ) : (
        <p className="text-[12px] text-tlw-warm-gray/70">No map assigned yet.</p>
      )}

      {viewOpen && <MapStructureModal map={selectedMap} fallbackName={value} onClose={() => setViewOpen(false)} />}
    </div>
  )
}

/**
 * Pop-up view of the assigned map's full structure. Portaled to <body> like the
 * Client goals modal — this card lives in the notes panel's sticky rail, whose
 * stacking context would otherwise trap the overlay beneath the note editor.
 */
function MapStructureModal({
  map,
  fallbackName,
  onClose,
}: {
  map: CoachingMap | undefined
  fallbackName: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const name = map?.name ?? fallbackName

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-tlw-navy-deep/40 p-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Coaching map</p>
            <p className="mt-0.5 text-[17px] font-medium text-tlw-navy-deep">{name}</p>
            {map?.blurb && <p className="mt-1 text-[12px] leading-snug text-tlw-warm-gray">{map.blurb}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-tlw-warm-gray transition-colors hover:text-tlw-espresso"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {map?.components.length ? (
          <ul className="space-y-3">
            {map.components.map((c, i) => (
              <li key={c.name} className="flex gap-3">
                <span className="mt-0.5 shrink-0 text-[11px] font-semibold text-tlw-signal-orange/70">{i + 1}</span>
                <div>
                  <p className="text-[13px] font-semibold text-tlw-espresso">{c.name}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-tlw-warm-gray">{c.description}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-tlw-warm-gray/70">No structure is defined for this map.</p>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function MapView({
  map,
  fallbackName,
  size,
  onOpen,
}: {
  map: CoachingMap | undefined
  fallbackName: string
  size: Size
  onOpen: () => void
}) {
  const name = map?.name ?? fallbackName

  // The map name opens the structure pop-up in every size mode.
  const nameButton = (className: string) => (
    <button
      onClick={onOpen}
      title="View the map's structure"
      className={`${className} text-left text-tlw-espresso underline-offset-2 hover:text-tlw-navy-deep hover:underline`}
    >
      {name}
    </button>
  )

  // Small: just the map name
  if (size === 'small') {
    return nameButton('text-[13px] font-medium')
  }

  // Medium: name + component list (no descriptions)
  if (size === 'medium') {
    return (
      <div>
        <div className="mb-2">{nameButton('text-[13px] font-medium')}</div>
        {map?.components.length ? (
          <ul className="space-y-1">
            {map.components.map((c, i) => (
              <li key={c.name} className="flex items-baseline gap-2">
                <span className="shrink-0 text-[10px] font-semibold text-tlw-signal-orange/70">
                  {i + 1}
                </span>
                <span className="text-[12px] font-medium text-tlw-espresso">{c.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          map?.blurb && <p className="text-[11px] leading-snug text-tlw-warm-gray">{map.blurb}</p>
        )}
      </div>
    )
  }

  // Large: name + components with descriptions
  return (
    <div>
      <div className="mb-3">{nameButton('text-[13px] font-medium')}</div>
      {map?.components.length ? (
        <ul className="space-y-2.5">
          {map.components.map((c, i) => (
            <li key={c.name} className="flex gap-2.5">
              <span className="mt-0.5 shrink-0 text-[10px] font-semibold text-tlw-signal-orange/70">
                {i + 1}
              </span>
              <div>
                <p className="text-[12px] font-semibold text-tlw-espresso">{c.name}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-tlw-warm-gray">{c.description}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        map?.blurb && <p className="text-[11px] leading-snug text-tlw-warm-gray">{map.blurb}</p>
      )}
    </div>
  )
}
