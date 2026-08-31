'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Client } from '@/lib/supabase/types'

type Component = { name: string; description: string; question?: string }
type CoachingMap = { name: string; blurb?: string; components: Component[] }

// OFFLINE FALLBACK ONLY — the vault repo's Maps/ folder is the source of truth.
// The pulldown names come live from GET /api/vault/maps (useCoachingMapNames)
// and the DISPLAYED structure from GET /api/vault/map (a Maps-folder note
// matched by title/alias, parsed by lib/vault/maps.ts); these built-in copies
// render only when the vault is unconfigured/unreachable. They mirror the vault
// notes (condensed) — when a map changes in Obsidian, the app follows on its
// own; only update this copy if the fallback has drifted badly.
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
    blurb:
      'A simplified view of a complex business — six structural components, each with a distinct role, that must work together for the organization to fly further, faster, and higher.',
    components: [
      {
        name: 'The Cockpit',
        description:
          'Leadership and direction. The leader sits in the Cockpit — determining the destination, how high and how fast the company will fly, and monitoring its overall health. A leader without clarity, vision, and metrics is flying blind.',
        question:
          'Are you spending most of your time in the Cockpit — setting direction and monitoring health — or are you down in the cabin fixing seats? What would change if you stayed in the Cockpit more?',
      },
      {
        name: 'The Wings',
        description:
          'Products and offerings. The wings generate lift — what allows the business to get off the ground and stay airborne. The more efficiently shaped the wings, the further, faster, and higher the company can fly; bloated or unfocused product lines create drag.',
        question:
          'Are your products and offerings generating real lift — or are some creating drag? Which offering, if refined or eliminated, would most improve your altitude?',
      },
      {
        name: 'Engine 1 — Marketing',
        description:
          'Thrust: creating attention and demand. The first engine provides the thrust that gets the plane airborne and keeps it there — visibility, demand, a legible pathway to purchase. Not too little (the plane won’t fly) and not too much (resources diverted from other components).',
        question:
          'Is your marketing engine powerful enough to get you off the ground and keep you there — or is it either underpowered or consuming resources that should go elsewhere?',
      },
      {
        name: 'Engine 2 — Sales',
        description:
          'Thrust: converting demand into revenue. The second engine converts marketing’s attention into actual clients. A proven sales process removes uncertainty — for the leader and the client; an improvised, inconsistent process makes the engine sputter.',
        question:
          'Do you have a proven, repeatable sales process — or does each deal feel like you’re figuring it out again? Where in the process do deals most often stall?',
      },
      {
        name: 'The Fuselage',
        description:
          'Operations and client delivery. The airframe that holds everything together and carries the payload — how clients are served, how the work gets done, how the team is structured. The lighter and stronger the fuselage, the better the plane performs.',
        question:
          'Where is your fuselage carrying unnecessary weight — overhead, complexity, or operations that don’t serve your clients or your team? What could you remove without losing structural integrity?',
      },
      {
        name: 'The Fuel Tank',
        description:
          'Cash and financial health. Nothing flies without fuel — cash is the resource that makes all other components possible. Three indicators matter most: how much fuel is in the tank right now, how fast is it burning, and how long until it runs dry?',
        question:
          'Do you know your current fuel state — runway, burn rate, and replenishment rate? What would give you more confidence in your financial instruments?',
      },
    ],
  },
  {
    name: 'First 90 Days',
    blurb:
      'A structured four-part framework for leaders entering a new role — learn the business, map your stakeholders, define early wins, and align with the person who hired you.',
    components: [
      {
        name: 'Business Knowledge Plan',
        description:
          'Learn the business at every level, from the inside out: your team (how we do business here), the organization (strategy, culture, how decisions actually get made), and the market and industry (the bigger picture).',
        question:
          'What is your structured learning plan for your first 30 days — and are you moving from the inside out, or jumping straight to strategy before you understand your own team?',
      },
      {
        name: 'Key Stakeholders',
        description:
          'Map the people who determine your impact on a 2×2 grid — power to help vs. knowledge of the work — and build an engagement plan for the priority few: their role, what they need from you, what you need from them, and your first move.',
        question:
          'Who are the two or three people whose support will most determine your success — and what is your specific plan to earn it in the first 30 days?',
      },
      {
        name: 'Wins & Key Value Deliverables',
        description:
          'Define what success looks like across 30, 60, and 90 days — value wins (tangible deliverables that demonstrate competence) and relational wins (trust, credibility, connection), matched to the STARS scenario you inherited.',
        question:
          'What is the single most important win you can deliver in the first 30 days — the one that builds momentum for everything else?',
      },
      {
        name: 'Key Conversations',
        description:
          'Align early — your biggest advocate is the person who hired you. Three structured conversations (days 1–5, 30, and 60) mine expectations, check performance, and keep the definition of success shared.',
        question:
          'Have you explicitly asked your boss what "outrageously successful" looks like in 90 days — and have you confirmed you both mean the same thing?',
      },
    ],
  },
  {
    name: 'Building PsyCap in Your Organization',
    blurb:
      'Four moves a leader makes to build Psychological Capital — Hope, Efficacy, Resilience, and Optimism — in the people they lead.',
    components: [
      {
        name: 'Hope — Generate it through vision casting and agency',
        description:
          'Hope is agency (the willpower to pursue a goal) plus pathways (the ability to find multiple routes there). Vision casting builds pathways; delegation builds agency; ambiguity is hope’s silent assassin.',
        question:
          'If you asked each person on your team to state the top three organizational goals right now, would they give the same answer? Where is ambiguity leaking hope from your team?',
      },
      {
        name: 'Efficacy — Build it through small wins',
        description:
          'Efficacy is task-specific confidence, built through experience. Engineer opportunities for earned wins, give specific feedback that names the repeatable move, and make peer success visible and credited.',
        question:
          'Where on your team is someone being held back by doubt that doesn’t match their actual track record? What is the next small win you could architect for them?',
      },
      {
        name: 'Resilience — Shape it by crafting the stories we tell',
        description:
          'Resilience is the capacity to bounce forward — to carry a capability out of a setback. The leader is the primary narrator: name the hard thing honestly, locate the capability that emerged, and point forward.',
        question:
          'What is the last significant setback your team faced — and what story are they currently telling about it? Does that story leave them with a capability, or with a wound?',
      },
      {
        name: 'Optimism — Cultivate it by examining our explanations',
        description:
          'Optimism is a trained explanatory style — whether setbacks read as permanent or passing, pervasive or specific, personal or situational. The leader models the explanation first, and helps people read their wins accurately.',
        question:
          'Think about how your team explained your last significant failure — did the explanation lock in something permanent, or open up something passable? Where do you land on that axis?',
      },
    ],
  },
  {
    name: 'Who You Are Becoming',
    blurb:
      'Identity development for leaders at an inflection point — six components that move a leader from the story they’ve been living to the self they’re growing into.',
    components: [
      {
        name: 'Story — Who have I been?',
        description:
          'Every leader is a story walking around. The throughline across chapters — the domains that have shaped who this person is — is the raw material the rest of the map works with.',
        question: 'Looking across all the chapters — what has been true of you in all of them?',
      },
      {
        name: 'Possible Selves — Who am I becoming?',
        description:
          'A leader is pulled forward by images of who they might become: the hoped-for self, the feared self, and the expected self — then mental contrasting (WOOP) converts imagination into commitment.',
        question: 'On your current path, who will you probably become — and is that who you want to be?',
      },
      {
        name: 'Reckoning — The honest present',
        description:
          'See clearly, then surface the grip: the hidden competing commitment your goal-defeating behavior is faithfully serving, and the big assumption behind it — named as a hypothesis, not a fact.',
        question:
          'What’s a change you genuinely want and haven’t been able to make — and if you imagine doing the opposite of what you’re doing, what’s the scariest feeling that comes up?',
      },
      {
        name: 'Experiments — Provisional selves',
        description:
          'Knowing follows doing. The big assumption and the hoped-for self become small, safe, real-world probes — craft, connect, narrate — each followed by the debrief that turns experience into learning.',
        question: 'What’s the smallest real thing you could do this week to learn about this — not decide, just learn?',
      },
      {
        name: 'The Crossing — The messy middle',
        description:
          'The liminal space after the old identity is named as over and before the new one is real. The coach builds a container strong enough that the client can stay in the not-yet until the new self emerges.',
        question:
          'If you’re not who you were and not yet who you’re becoming — how would you describe where you are right now?',
      },
      {
        name: 'Legacy — Beyond self',
        description:
          'The final turn is outward: from who am I becoming? to what am I giving? Generativity, then integrity — giving the self away is the documented path to a good ending.',
        question: 'When you’re gone, what continues because you were here?',
      },
    ],
  },
]

/** The built-in fallback names (offline copy of the vault's Maps folder). */
export const COACHING_MAP_NAMES = MAPS.map((m) => m.name)

/**
 * The map pulldown's options, mirrored live from the vault repo's Maps/ folder
 * (GET /api/vault/maps) so adding/renaming/removing a map note in Obsidian
 * updates the app. Falls back to the built-in names while loading or when the
 * vault is unconfigured/unreachable. Shared by this card's edit select and the
 * edit-client modal's map pulldown.
 */
export function useCoachingMapNames(): string[] {
  const [names, setNames] = useState<string[] | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/vault/maps')
      .then((res) => (res.ok ? res.json() : { names: null }))
      .then((data) => {
        if (!cancelled && Array.isArray(data.names) && data.names.length) {
          setNames(data.names.filter((n: unknown) => typeof n === 'string'))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return names ?? COACHING_MAP_NAMES
}

type Size = 'small' | 'medium' | 'large'

export function CoachingMapCard({
  client,
  onUpdated,
  chrome = 'rail',
}: {
  client: Client
  onUpdated: (c: Client) => void
  /** 'rail' = the tight session-notes-panel styling (default); 'card' = the
   *  workspace card-grid styling (used by the ws-coaching-map block). */
  chrome?: 'rail' | 'card'
}) {
  const value = client.coaching_map || ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [size, setSize] = useState<Size>('medium')
  const [viewOpen, setViewOpen] = useState(false)
  const [vaultMap, setVaultMap] = useState<CoachingMap | null>(null)

  const mapNames = useCoachingMapNames()
  const options = mapNames.includes(value) || !value ? mapNames : [...mapNames, value]
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
    <div
      className={
        chrome === 'card'
          ? 'rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6'
          : 'rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-surface p-3'
      }
    >
      {/* Header row */}
      <div className={`flex items-center justify-between ${chrome === 'card' ? 'mb-4' : 'mb-2'}`}>
        <p
          className={
            chrome === 'card'
              ? 'text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray'
              : 'text-[11px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-deep'
          }
        >
          Coaching map
        </p>
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
            {options.map((name) => (
              <option key={name} value={name}>
                {name}
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
