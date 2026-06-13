'use client'
import { useState } from 'react'
import type { Client, CoachingGoal } from '@/lib/supabase/types'

export function GoalsCard({
  client,
  onUpdated,
}: {
  client: Client
  onUpdated: (c: Client) => void
}) {
  const goals = client.coaching_goals || []
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<CoachingGoal[]>(goals)
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
      setEditing(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  function edit() {
    setDraft(goals.length ? goals : [{ title: '', description: '' }])
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
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
