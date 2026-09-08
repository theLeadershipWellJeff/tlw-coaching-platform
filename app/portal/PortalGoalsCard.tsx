'use client'
import { useState } from 'react'
import { InfoPopover } from './InfoPopover'
import { GoalEditorModal, type PortalGoal } from './GoalEditorModal'
import { Confetti } from './Confetti'

/** A small progress ring. 0–100. */
function Ring({ value, complete, size = 44 }: { value: number; complete: boolean; size?: number }) {
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const dash = c * (Math.max(0, Math.min(100, value)) / 100)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-label={`${value}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-tlw-warm-gray/20" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={`transition-[stroke-dasharray] duration-500 ${complete ? 'text-emerald-500' : 'text-tlw-signal-orange'}`}
      />
      {complete ? (
        <path d={`M${size * 0.32} ${size * 0.52} l${size * 0.12} ${size * 0.12} l${size * 0.26} -${size * 0.28}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600" />
      ) : (
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-tlw-navy-deep text-[11px] font-semibold tabular-nums">
          {value}
        </text>
      )}
    </svg>
  )
}

/**
 * The goals card with the client's own write path (Phase 3) and, since round
 * 4, self-reported progress on every goal: a ring, a slider, and a "Mark
 * complete" that fires the confetti the first time a goal reaches 100.
 * Coach-authored goals keep their wording read-only; progress is the
 * client's to report on any goal.
 */
export function PortalGoalsCard({ initialGoals, hasCoach }: { initialGoals: PortalGoal[]; hasCoach: boolean }) {
  const [goals, setGoals] = useState<PortalGoal[]>(initialGoals)
  const [editing, setEditing] = useState<Goal | null | 'new'>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [tracking, setTracking] = useState<number | null>(null)
  const [draft, setDraft] = useState(0)
  const [celebrate, setCelebrate] = useState<string | null>(null)
  const [error, setError] = useState('')
  type Goal = PortalGoal

  async function remove(g: Goal) {
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

  async function saveProgress(g: Goal, progress: number) {
    setBusy(g.index)
    setError('')
    try {
      const res = await fetch('/api/portal/goals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: g.index, progress }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not save your progress.')
      setGoals(d.goals || [])
      setTracking(null)
      if (d.justCompleted) setCelebrate(g.title)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your progress.')
    } finally {
      setBusy(null)
    }
  }

  const done = goals.filter((g) => (g.progress ?? 0) >= 100).length
  const avg = goals.length ? Math.round(goals.reduce((n, g) => n + (g.progress ?? 0), 0) / goals.length) : 0

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5">
      {celebrate && <Confetti onDone={() => setCelebrate(null)} />}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">Your goals</h2>
        <InfoPopover
          label="Your goals"
          text={
            hasCoach
              ? 'The goals you and your coach are working on, plus any you add yourself. Each one carries how you will know it is working. Drag the progress as you go — your coach sees it too.'
              : 'Goals you set for yourself, each with how you will know it is working. Add one from here, or from the chat when something lands. Drag the progress as you go.'
          }
        />
      </div>

      {goals.length > 0 && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-[12px] text-tlw-warm-gray">
            <span>{done} of {goals.length} complete</span>
            <span className="tabular-nums">{avg}% overall</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-tlw-warm-gray/15">
            <div className={`h-full rounded-full transition-[width] duration-500 ${avg >= 100 ? 'bg-emerald-500' : 'bg-tlw-signal-orange'}`} style={{ width: `${avg}%` }} />
          </div>
        </div>
      )}

      <div className="mt-3">
        {goals.length === 0 ? (
          <p className="text-[13px] text-tlw-warm-gray">No goals yet. Add one below, or ask the assistant to help you turn your report into one.</p>
        ) : (
          <ul className="space-y-4">
            {goals.map((g) => {
              const progress = g.progress ?? 0
              const complete = progress >= 100
              const isTracking = tracking === g.index
              return (
                <li key={g.index} className="group flex gap-3">
                  <button
                    onClick={() => {
                      setTracking(isTracking ? null : g.index)
                      setDraft(progress)
                    }}
                    title="Update progress"
                    className="mt-0.5 rounded-full transition-transform hover:scale-105"
                  >
                    <Ring value={progress} complete={complete} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-[14px] font-medium ${complete ? 'text-emerald-700' : 'text-tlw-navy-deep'}`}>
                        {g.title}
                        {g.author === 'client' && <span className="ml-2 text-[11px] font-normal text-tlw-warm-gray">yours</span>}
                        {complete && <span className="ml-2 text-[11px] font-normal text-emerald-700">done</span>}
                      </p>
                      <span className="shrink-0 space-x-2 text-[12px] opacity-0 transition-opacity group-hover:opacity-100">
                        <button onClick={() => { setTracking(isTracking ? null : g.index); setDraft(progress) }} className="font-medium text-tlw-signal-orange hover:underline">
                          Progress
                        </button>
                        {g.editable && (
                          <>
                            <button onClick={() => setEditing(g)} className="font-medium text-tlw-signal-orange hover:underline">Edit</button>
                            <button onClick={() => remove(g)} disabled={busy === g.index} className="text-tlw-warm-gray hover:text-tlw-espresso">Remove</button>
                          </>
                        )}
                      </span>
                    </div>
                    {g.description && <p className="mt-0.5 text-[13px] text-tlw-espresso">{g.description}</p>}
                    {g.metrics && g.metrics.filter(Boolean).length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {g.metrics.filter(Boolean).map((m, j) => (
                          <li key={j} className="text-[12px] text-tlw-warm-gray">— {m}</li>
                        ))}
                      </ul>
                    )}
                    {isTracking && (
                      <div className="mt-2 rounded-tlw-xl bg-tlw-canvas p-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={draft}
                            onChange={(e) => setDraft(Number(e.target.value))}
                            className="flex-1 accent-tlw-signal-orange"
                            aria-label="Progress"
                          />
                          <span className="w-10 text-right text-[13px] font-semibold tabular-nums text-tlw-navy-deep">{draft}%</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button onClick={() => saveProgress(g, draft)} disabled={busy === g.index} className="rounded-tlw-lg bg-tlw-navy-deep px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50">
                            {busy === g.index ? 'Saving…' : 'Save progress'}
                          </button>
                          {!complete && (
                            <button onClick={() => saveProgress(g, 100)} disabled={busy === g.index} className="rounded-tlw-lg border border-emerald-600/40 px-3 py-1.5 text-[12px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50">
                              ✓ Mark complete
                            </button>
                          )}
                          <button onClick={() => setTracking(null)} className="text-[12px] text-tlw-warm-gray hover:text-tlw-espresso">Cancel</button>
                        </div>
                      </div>
                    )}
                    {celebrate === g.title && (
                      <p className="mt-2 text-[13px] font-medium text-emerald-700">You did it. That one is complete.</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {error && <p className="mt-2 text-[12px] text-tlw-signal-orange">{error}</p>}
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
