'use client'
import type { Dispatch, SetStateAction } from 'react'
import type { CoachingGoal } from '@/lib/supabase/types'

// Editable goal: title, a description below it, and three measures of
// fulfillment. The editor always shows three metric slots; empty ones are
// dropped on save (see cleanGoals).
export type GoalDraft = { title: string; description: string; metrics: string[] }

export function emptyGoal(): GoalDraft {
  return { title: '', description: '', metrics: ['', '', ''] }
}

/** Stored goals → editable drafts (pad metrics to three slots). */
export function toDrafts(goals: CoachingGoal[]): GoalDraft[] {
  return goals.map((g) => ({
    title: g.title || '',
    description: g.description || '',
    metrics: [g.metrics?.[0] || '', g.metrics?.[1] || '', g.metrics?.[2] || ''],
  }))
}

/** Editable drafts → stored goals (trim, drop empty metrics, require a title). */
export function cleanGoals(draft: GoalDraft[]): CoachingGoal[] {
  return draft
    .map((g) => ({
      title: g.title.trim(),
      description: g.description.trim(),
      metrics: g.metrics.map((m) => m.trim()).filter(Boolean),
    }))
    .filter((g) => g.title)
}

/** Does this row carry any work the coach would not want silently dropped? */
export function goalHasContent(g: GoalDraft): boolean {
  return !!(g.title.trim() || g.description.trim() || g.metrics.some((m) => m.trim()))
}

/**
 * Rows that have a description/metrics but no title. cleanGoals discards these
 * (a stored goal needs a title to render), so saving them silently would lose
 * the coach's work — callers must block the save and prompt for a title instead.
 */
export function untitledGoals(draft: GoalDraft[]): boolean {
  return draft.some((g) => !g.title.trim() && (g.description.trim() || g.metrics.some((m) => m.trim())))
}

/** The shared goal-rows form: goal + description (left), three metrics (right). */
export function GoalRows({
  draft,
  setDraft,
}: {
  draft: GoalDraft[]
  setDraft: Dispatch<SetStateAction<GoalDraft[]>>
}) {
  return (
    <div className="space-y-3">
      {draft.map((g, i) => (
        <div key={i} className="rounded-tlw-lg border border-tlw-warm-gray/15 p-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            {/* Goal + description */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  value={g.title}
                  placeholder="Goal title (required)"
                  onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  className="flex-1 rounded-tlw-md border border-tlw-warm-gray/20 bg-tlw-surface px-2 py-1.5 text-[13px] font-medium text-tlw-navy-deep outline-none focus:border-tlw-signal-orange placeholder:text-tlw-warm-gray/60"
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
                placeholder="Description of the goal…"
                rows={3}
                onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                className="w-full rounded-tlw-md border border-tlw-warm-gray/20 bg-tlw-surface px-2 py-1.5 text-[12px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
              />
            </div>

            {/* Three metrics of fulfillment */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[1px] text-tlw-warm-gray">
                Metrics of fulfillment
              </p>
              {[0, 1, 2].map((m) => (
                <input
                  key={m}
                  value={g.metrics[m] || ''}
                  placeholder={`Metric ${m + 1}`}
                  onChange={(e) =>
                    setDraft((d) =>
                      d.map((x, j) =>
                        j === i ? { ...x, metrics: x.metrics.map((mv, k) => (k === m ? e.target.value : mv)) } : x
                      )
                    )
                  }
                  className="w-full rounded-tlw-md border border-tlw-warm-gray/20 bg-tlw-surface px-2 py-1.5 text-[12px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                />
              ))}
            </div>
          </div>
        </div>
      ))}
      <button
        onClick={() => setDraft((d) => [...d, emptyGoal()])}
        className="text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
      >
        + add goal
      </button>
    </div>
  )
}
