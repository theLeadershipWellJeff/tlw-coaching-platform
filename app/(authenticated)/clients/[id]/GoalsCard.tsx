'use client'
import { useState } from 'react'
import type { Client } from '@/lib/supabase/types'
import { GoalRows, type GoalDraft, toDrafts, cleanGoals, emptyGoal } from './GoalRows'

export function GoalsCard({
  client,
  onUpdated,
}: {
  client: Client
  onUpdated: (c: Client) => void
}) {
  const goals = client.coaching_goals || []
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<GoalDraft[]>(toDrafts(goals))
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
      setDraft(toDrafts(data.goals))
      setEditing(false)
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
      const cleaned = cleanGoals(draft)
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coaching_goals: cleaned }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      onUpdated(data.client)
      setEditing(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  function edit() {
    setDraft(goals.length ? toDrafts(goals) : [emptyGoal()])
    setEditing(true)
  }

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Coaching goals</p>
        <div className="flex items-center gap-3">
          <button
            onClick={generate}
            disabled={busy !== null}
            className="text-[12px] font-medium text-tlw-signal-orange hover:underline disabled:opacity-40"
          >
            {busy === 'generate' ? 'generating…' : 'generate from notes'}
          </button>
          {!editing && (
            <button onClick={edit} className="text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
              edit
            </button>
          )}
        </div>
      </div>

      {error && <p className="mb-3 text-[12px] text-tlw-signal-orange">{error}</p>}

      {editing ? (
        <div className="space-y-3">
          <GoalRows draft={draft} setDraft={setDraft} />
          <div className="flex items-center justify-end gap-3 pt-1">
            <button onClick={() => setEditing(false)} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
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
      ) : goals.length === 0 ? (
        <p className="text-[13px] text-tlw-warm-gray">
          No goals yet. Generate them from this client&apos;s notes, or add them by hand.
        </p>
      ) : (
        <ul className="space-y-4">
          {goals.map((g, i) => (
            <li key={i}>
              <p className="text-[14px] font-medium text-tlw-navy-deep">{g.title}</p>
              {g.description && <p className="mt-0.5 text-[13px] leading-relaxed text-tlw-warm-gray">{g.description}</p>}
              {g.metrics && g.metrics.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {g.metrics.map((m, j) => (
                    <li key={j} className="flex gap-2 text-[12px] text-tlw-espresso">
                      <span className="mt-[2px] shrink-0 text-tlw-signal-orange">›</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
