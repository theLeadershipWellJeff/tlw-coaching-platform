'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Client } from '@/lib/supabase/types'

type Component = { name: string; description: string; question?: string }
type CoachingMap = { name: string; blurb?: string; components: Component[] }

// The pulldown's map registry + offline fallback. The DISPLAYED structure is
// drawn live from the vault repo (GET /api/vault/map — a note titled like the
// map, parsed by lib/vault/maps.ts); these built-in copies render only when the
// vault is unconfigured/unreachable or has no matching note.
const MAPS: CoachingMap[] = [
  {
    name: 'The 6 Components',
    components: [
      {
        name: 'Vision',
        description:
          'The clear, compelling summit your organization is climbing toward — a future state vivid enough to motivate, defined enough to measure, and aligned with your purpose and values. It answers: Where are we going and why does it matter?',
        question:
          'How clear, repeatable, and compelling is your vision for the organization or for this project — and what stands between you and it?',
      },
      {
        name: 'People',
        description:
          'The right people, in the right seats. Every team member either adds value above the waterline or creates drag below it. The leader’s job is to see clearly and choose: develop the person’s capacity, or dismiss with dignity before the cost compounds.',
        question:
          'Which people are adding the most value to your organisation — and which are creating the most friction?',
      },
      {
        name: 'Metrics',
        description:
          'Measure what matters — the handful of numbers that tell you whether the business is healthy right now. The best metrics are leading, not lagging — they signal what is coming before it arrives, giving leaders time to act rather than react.',
        question:
          'Which metrics need the most immediate attention — and are they telling you where you’re headed or only where you’ve been?',
      },
      {
        name: 'Processes',
        description:
          'Organizing the organization — the how of your business, the repeatable ways work gets done. Strong processes remove friction, create consistency, and free leaders to lead. Weak ones create rework, confusion, and dependency on heroics.',
        question:
          'Which processes need to be developed or refined to remove friction or accelerate output?',
      },
      {
        name: 'Issues',
        description:
          'The obstacles, barriers, and problems standing in the way of the vision. Every organisation has them. Great teams surface them, prioritise ruthlessly, and solve them at the root — not the symptom. (Wickman, Traction)',
        question:
          'What are two or three key issues that, if solved, would make the greatest difference to you right now?',
      },
      {
        name: 'Traction',
        description:
          'The cadence and structure for accountability and alignment — the discipline that converts vision into weekly, quarterly, and annual results. Without traction, great plans simply age on whiteboards.',
        question:
          'What things are currently slipping, getting lost, or stuck — and what structure would restore momentum?',
      },
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
  const [vaultMap, setVaultMap] = useState<CoachingMap | null>(null)

  const options = MAPS.some((m) => m.name === value) || !value ? MAPS : [...MAPS, { name: value, components: [] }]
  // Live vault content wins; the built-in copy is the offline fallback.
  const selectedMap = vaultMap ?? MAPS.find((m) => m.name === value)
  const fromVault = vaultMap !== null

  // Pull the assigned map's live structure from the vault repo. Errors and
  // missing notes resolve to { map: null } → the built-in copy renders instead.
  useEffect(() => {
    setVaultMap(null)
    if (!value) return
    let cancelled = false
    fetch(`/api/vault/map?name=${encodeURIComponent(value)}`)
      .then((res) => (res.ok ? res.json() : { map: null }))
      .then((data) => {
        if (!cancelled && data.map?.components?.length) setVaultMap(data.map)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [value])

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

      {viewOpen && (
        <MapStructureModal
          map={selectedMap}
          fallbackName={value}
          fromVault={fromVault}
          client={client}
          onClose={() => setViewOpen(false)}
        />
      )}
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * The client-facing reminder email: a short intro + the map's component list.
 * Inline styles only (email-safe); /api/email/send wraps it in the base font
 * and appends the coach signature server-side.
 */
function buildMapEmailHtml(map: CoachingMap, clientName: string): string {
  const first = clientName.trim().split(/\s+/)[0] || clientName
  const items = map.components
    .map(
      (c) =>
        `<li style="margin-bottom:10px;"><strong>${escapeHtml(c.name)}</strong>${
          c.description ? ` — ${escapeHtml(c.description)}` : ''
        }</li>`
    )
    .join('')
  return (
    `<p>Hi ${escapeHtml(first)},</p>` +
    `<p>Here&rsquo;s a quick reference of <strong>${escapeHtml(map.name)}</strong> — the map we&rsquo;re working from together:</p>` +
    `<ol style="margin:12px 0;padding-left:22px;">${items}</ol>` +
    `<p>Keep this handy between our sessions.</p>`
  )
}

/**
 * Pop-up view of the assigned map's full structure. Portaled to <body> like the
 * Client goals modal — this card lives in the notes panel's sticky rail, whose
 * stacking context would otherwise trap the overlay beneath the note editor.
 * "Send to client" emails the component list as a quick mid-session reminder
 * via the standard branded send path (POST /api/email/send).
 */
function MapStructureModal({
  map,
  fallbackName,
  fromVault,
  client,
  onClose,
}: {
  map: CoachingMap | undefined
  fallbackName: string
  fromVault: boolean
  client: Client
  onClose: () => void
}) {
  const [sendState, setSendState] = useState<'idle' | 'confirm' | 'sending' | 'sent'>('idle')
  const [sendError, setSendError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const name = map?.name ?? fallbackName
  const canSend = Boolean(client.email && map?.components.length)

  async function send() {
    if (!map || !client.email) return
    setSendState('sending')
    setSendError('')
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          to: client.email,
          subject: `Our coaching map: ${map.name}`,
          bodyHtml: buildMapEmailHtml(map, client.name),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')
      setSendState('sent')
    } catch (e: any) {
      setSendError(e.message || 'Send failed')
      setSendState('confirm')
    }
  }

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
            <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
              Coaching map{fromVault && <span className="ml-2 normal-case tracking-normal text-tlw-warm-gray/60">· live from vault</span>}
            </p>
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
          <ul className="space-y-4">
            {map.components.map((c, i) => (
              <li key={c.name} className="flex gap-3">
                <span className="mt-0.5 shrink-0 text-[11px] font-semibold text-tlw-signal-orange/70">{i + 1}</span>
                <div>
                  <p className="text-[13px] font-semibold text-tlw-espresso">{c.name}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-tlw-warm-gray">{c.description}</p>
                  {c.question && (
                    <p className="mt-1.5 border-l-2 border-tlw-signal-orange/40 pl-2 text-[12px] italic leading-snug text-tlw-espresso/80">
                      {c.question}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-tlw-warm-gray/70">No structure is defined for this map.</p>
        )}

        {sendError && <p className="mt-4 text-[11px] text-tlw-signal-orange">{sendError}</p>}

        <div className="mt-6 flex items-center justify-between gap-3">
          {/* Send-to-client: a quick emailed reminder of the map's components. */}
          <div className="flex items-center gap-3">
            {sendState === 'sent' ? (
              <p className="text-[12px] font-medium text-tlw-espresso">
                ✓ Sent to {client.email}
              </p>
            ) : sendState === 'confirm' || sendState === 'sending' ? (
              <>
                <p className="text-[12px] text-tlw-warm-gray">
                  Email this list to <span className="font-medium text-tlw-espresso">{client.email}</span>?
                </p>
                <button
                  onClick={send}
                  disabled={sendState === 'sending'}
                  className="rounded-tlw-md bg-tlw-navy-rich px-3 py-1.5 text-[11px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {sendState === 'sending' ? 'Sending…' : 'Send'}
                </button>
                <button
                  onClick={() => {
                    setSendState('idle')
                    setSendError('')
                  }}
                  disabled={sendState === 'sending'}
                  className="text-[11px] text-tlw-warm-gray hover:text-tlw-espresso disabled:opacity-40"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setSendState('confirm')}
                disabled={!canSend}
                title={
                  !client.email
                    ? 'No email on file for this client'
                    : !map?.components.length
                      ? 'This map has no components to send'
                      : 'Email the client this map as a quick reminder'
                }
                className="rounded-tlw-lg border border-tlw-warm-gray/25 px-4 py-2 text-[13px] font-medium text-tlw-espresso transition-colors hover:border-tlw-navy-rich hover:text-tlw-navy-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send to client
              </button>
            )}
          </div>
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
