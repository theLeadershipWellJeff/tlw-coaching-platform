'use client'
import { useState } from 'react'
import type { Client } from '@/lib/supabase/types'
import { GoalRows, type GoalDraft, toDrafts, cleanGoals, emptyGoal, untitledGoals } from './GoalRows'

/**
 * Compact engagement-goals card for the session-notes panel. It shows the same
 * persistent goals as the workspace GoalsCard (single source of truth on
 * client.coaching_goals — these are also what session prep pulls from) and opens
 * a "Client goals" panel to edit them.
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
              {g.metrics && g.metrics.length > 0 && (
                <span className="ml-1 text-tlw-warm-gray">· {g.metrics.length} metric{g.metrics.length === 1 ? '' : 's'}</span>
              )}
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
  const [draft, setDraft] = useState<GoalDraft[]>(goals.length ? toDrafts(goals) : [emptyGoal()])
  const [busy, setBusy] = useState<'generate' | 'save' | null>(null)
  const [error, setError] = useState('')

  async function generate() {
    // Hand-written/edited goals are protected server-side; warn so the coach
    // knows the suggestions are added below them, not a replacement.
    const hasProtected = (client.coaching_goals || []).some((g) => g.source !== 'generated')
    if (
      hasProtected &&
      !window.confirm(
        'Draft goals from this client’s notes? Your hand-written goals are kept — the AI suggestions are added below them.'
      )
    ) {
      return
    }
    setBusy('generate')
    setError('')
    try {
      const res = await fetch(`/api/clients/${client.id}/goals/generate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not generate goals')
      onUpdated({ ...client, coaching_goals: data.goals })
      setDraft(toDrafts(data.goals))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    // Never silently drop a goal the coach typed: a row with a description or
    // metrics but no title would be discarded by cleanGoals, so stop and ask.
    if (untitledGoals(draft)) {
      setError('Give every goal a title before saving — a goal without one can’t be saved.')
      return
    }
    setBusy('save')
    setError('')
    try {
      const cleaned = cleanGoals(draft)
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
        className="w-full max-w-2xl rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6 shadow-xl"
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

        <GoalRows draft={draft} setDraft={setDraft} />

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
