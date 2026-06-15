'use client'
import { useState } from 'react'
import type { Client, CoachingGoal } from '@/lib/supabase/types'

/**
 * Compact engagement-goals card for the session-notes panel. It shows the same
 * persistent goals as the workspace GoalsCard (single source of truth on
 * client.coaching_goals) and opens a "Client goals" panel to edit them.
 */
export function EngagementGoalsCard({
  client,
  onUpdated,
}: {
  client: Client
  onUpdated: (c: Client) => void
}) {
  const goals = client.coaching_goals || []
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-deep">Engagement goals</p>
        <button onClick={() => setOpen(true)} className="text-[11px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
          edit
        </button>
      </div>

      {goals.length === 0 ? (
        <p className="text-[12px] text-tlw-warm-gray/70">No goals yet — open to add or generate them.</p>
      ) : (
        <ul className="space-y-2">
          {goals.map((g, i) => (
            <li key={i} className="text-[12px] leading-snug text-tlw-espresso">
              <span className="font-medium text-tlw-navy-deep">{g.title}</span>
            </li>
          ))}
        </ul>
      )}

      {open && <ClientGoalsModal client={client} onUpdated={onUpdated} onClose={() => setOpen(false)} />}
    </div>
  )
}

/** The "Client goals" panel — generate from notes, edit by hand, persist. */
function ClientGoalsModal({
  client,
  onUpdated,
  onClose,
}: {
  client: Client
  onUpdated: (c: Client) => void
  onClose: () => void
}) {
  const goals = client.coaching_goals || []
  const [draft, setDraft] = useState<CoachingGoal[]>(goals.length ? goals : [{ title: '', description: '' }])
  const [busy, setBusy] = useState<'generate' | 'save' | null>(null)
  const [error, setError] = useState('')

  async function generate() {
    setBusy('generate')
    setError('')
    try {
      const res = await fetch(`/api/clients/${client.id}/goals/generate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not generate goals')
      onUpdated({ ...client, coaching_goals: data.goals })
      setDraft(data.goals)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    setBusy('save')
    setError('')
    try {
      const cleaned = draft
        .map((g) => ({ title: g.title.trim(), description: g.description.trim() }))
        .filter((g) => g.title)
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coaching_goals: cleaned }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      onUpdated(data.client)
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-tlw-navy-deep/40 p-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Client goals</p>
            <p className="mt-0.5 text-[15px] font-medium text-tlw-navy-deep">{client.name}</p>
          </div>
          <button
            onClick={generate}
            disabled={busy !== null}
            className="text-[12px] font-medium text-tlw-signal-orange hover:underline disabled:opacity-40"
          >
            {busy === 'generate' ? 'generating…' : 'generate from notes'}
          </button>
        </div>

        {error && <p className="mb-3 text-[12px] text-tlw-signal-orange">{error}</p>}

        <div className="space-y-3">
          {draft.map((g, i) => (
            <div key={i} className="space-y-1.5 rounded-tlw-lg border border-tlw-warm-gray/15 p-3">
              <div className="flex items-center gap-2">
                <input
                  value={g.title}
                  placeholder="Goal title"
                  onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  className="flex-1 border-none bg-transparent text-[13px] font-medium text-tlw-navy-deep outline-none placeholder:text-tlw-warm-gray/60"
                />
                <button
                  onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
                  className="text-[12px] text-tlw-warm-gray hover:text-tlw-signal-orange"
                >
                  remove
                </button>
              </div>
              <textarea
                value={g.description}
                placeholder="What we're working on, grounded in the real coaching…"
                rows={2}
                onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                className="w-full rounded-tlw-md border border-tlw-warm-gray/20 bg-tlw-surface px-2 py-1.5 text-[12px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
              />
            </div>
          ))}
          <button
            onClick={() => setDraft((d) => [...d, { title: '', description: '' }])}
            className="text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
          >
            + add goal
          </button>
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button onClick={onClose} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy !== null}
            className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy === 'save' ? 'Saving…' : 'Save goals'}
          </button>
        </div>
      </div>
    </div>
  )
}
