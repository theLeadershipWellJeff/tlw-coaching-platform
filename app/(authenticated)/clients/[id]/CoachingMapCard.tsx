'use client'
import { useState } from 'react'
import type { Client } from '@/lib/supabase/types'

// The maps core to theLeadershipWell's practice. `blurb` is a short reminder of
// the framework; FUTURE: build out fuller descriptions here so the coach can
// click a map to see the framework while coaching.
type CoachingMap = { name: string; blurb?: string }
const MAPS: CoachingMap[] = [
  { name: 'The 6 Components' },
  { name: 'The Airplane Model', blurb: 'Wings / Engines / Fuel / Fuselage — the structural picture' },
  { name: 'First 90 Days' },
  { name: 'Who I Am Becoming' },
]

/**
 * The coaching map assigned to this client (persistent, per-client). Chosen from
 * the practice's maps; stored as the map name so older free-text values survive.
 */
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

  // Keep an unknown stored value (e.g. an older free-text entry) selectable.
  const options = MAPS.some((m) => m.name === value) || !value ? MAPS : [...MAPS, { name: value }]
  const selectedBlurb = MAPS.find((m) => m.name === value)?.blurb

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
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-deep">Coaching map</p>
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
        <>
          <p className="text-[13px] font-medium text-tlw-espresso">{value}</p>
          {selectedBlurb && <p className="mt-0.5 text-[11px] leading-snug text-tlw-warm-gray">{selectedBlurb}</p>}
        </>
      ) : (
        <p className="text-[12px] text-tlw-warm-gray/70">No map assigned yet.</p>
      )}
    </div>
  )
}
