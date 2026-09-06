'use client'
import { useState } from 'react'
import { InfoPopover } from './InfoPopover'
import { GoalEditorModal, type PortalGoal } from './GoalEditorModal'

/**
 * The goals card with the client's own write path (Phase 3). Coach-authored
 * goals are read-only; the client can add, edit, and remove the ones they
 * wrote. Mounted only when the client's portal has goal editing switched on
 * (the assessment flag, or no coach) — otherwise the home page keeps the
 * read-only card, byte-identical to before.
 */
export function PortalGoalsCard({ initialGoals, hasCoach }: { initialGoals: PortalGoal[]; hasCoach: boolean }) {
  const [goals, setGoals] = useState<PortalGoal[]>(initialGoals)
  const [editing, setEditing] = useState<PortalGoal | null | 'new'>(null)
  const [busy, setBusy] = useState<number | null>(null)

  async function remove(g: PortalGoal) {
    if (!window.confirm(`Remove "${g.title}"?`)) return
    setBusy(g.index)
    try {
      const res = await fetch('/api/portal/goals', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: g.index }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setGoals(d.goals || [])
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">Your goals</h2>
        <InfoPopover
          label="Your goals"
          text={
            hasCoach
              ? 'The goals you and your coach are working on, plus any you add yourself. Each one carries how you will know it is working.'
              : 'Goals you set for yourself, each with how you will know it is working. Add one from here, or from the chat when something lands.'
          }
        />
      </div>
      <div className="mt-3">
        {goals.length === 0 ? (
          <p className="text-[13px] text-tlw-warm-gray">No goals yet. Add one below, or ask the assistant to help you turn your report into one.</p>
        ) : (
          <ul className="space-y-3">
            {goals.map((g) => (
              <li key={g.index} className="group">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-medium text-tlw-navy-deep">
                    {g.title}
                    {g.author === 'client' && <span className="ml-2 text-[11px] font-normal text-tlw-warm-gray">yours</span>}
                  </p>
                  {g.editable && (
                    <span className="shrink-0 space-x-2 text-[12px] opacity-0 transition-opacity group-hover:opacity-100">
                      <button onClick={() => setEditing(g)} className="font-medium text-tlw-signal-orange hover:underline">
                        Edit
                      </button>
                      <button onClick={() => remove(g)} disabled={busy === g.index} className="text-tlw-warm-gray hover:text-tlw-espresso">
                        Remove
                      </button>
                    </span>
                  )}
                </div>
                {g.description && <p className="mt-0.5 text-[13px] text-tlw-espresso">{g.description}</p>}
                {g.metrics && g.metrics.filter(Boolean).length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {g.metrics.filter(Boolean).map((m, j) => (
                      <li key={j} className="text-[12px] text-tlw-warm-gray">— {m}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={() => setEditing('new')}
          className="mt-4 rounded-tlw-lg border border-tlw-warm-gray/25 px-3 py-1.5 text-[13px] font-medium text-tlw-signal-orange transition-colors hover:bg-tlw-canvas"
        >
          + Add a goal
        </button>
      </div>
      {editing && (
        <GoalEditorModal
          initial={editing === 'new' ? undefined : { index: editing.index, title: editing.title, description: editing.description, metrics: editing.metrics }}
          onSaved={setGoals}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
