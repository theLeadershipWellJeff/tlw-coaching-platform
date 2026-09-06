'use client'
import { useEffect, useState } from 'react'

export type PortalGoal = {
  index: number
  title: string
  description: string
  metrics?: string[]
  author?: 'coach' | 'client' | 'ai'
  editable: boolean
}

type Props = {
  /** Prefill (from an existing client goal, or a "save as goal" from the chat). */
  initial?: { index?: number; title?: string; description?: string; metrics?: string[] }
  /** Where the save came from — recorded on the goal_created event. */
  from?: 'editor' | 'chat'
  onSaved: (goals: PortalGoal[]) => void
  onClose: () => void
}

/**
 * The one place a client writes a goal. Metrics are required — at least one
 * way they will know it is working — because that is the "measure of success"
 * the debrief product promises. Explicit, human-driven; the AI never writes
 * here on its own.
 */
export function GoalEditorModal({ initial, from = 'editor', onSaved, onClose }: Props) {
  const [title, setTitle] = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [metrics, setMetrics] = useState<string[]>([
    initial?.metrics?.[0] || '',
    initial?.metrics?.[1] || '',
    initial?.metrics?.[2] || '',
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const editing = typeof initial?.index === 'number'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim()) return setError('Give the goal a short title.')
    if (!metrics.some((m) => m.trim())) return setError('Add at least one way you will know this goal is working.')
    setSaving(true)
    try {
      const res = await fetch('/api/portal/goals', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: initial?.index, title, description, metrics: metrics.filter((m) => m.trim()), from }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error || 'Could not save the goal.')
        return
      }
      onSaved(d.goals || [])
      onClose()
    } catch {
      setError('Could not save the goal.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tlw-navy-deep/40 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5 shadow-xl"
      >
        <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">
          {editing ? 'Edit goal' : 'New goal'}
        </h2>
        <p className="mt-1 text-[12px] text-tlw-warm-gray">
          Your goal, in your words — and how you will know it is working.
        </p>

        <label className="mt-4 block text-[12px] font-medium text-tlw-espresso">Goal</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          autoFocus
          placeholder="e.g. Bring the strategy into every team conversation"
          className="mt-1 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
        />

        <label className="mt-3 block text-[12px] font-medium text-tlw-espresso">Why it matters (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={1000}
          className="mt-1 w-full resize-none rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
        />

        <label className="mt-3 block text-[12px] font-medium text-tlw-espresso">How you will know it is working (at least one)</label>
        <div className="mt-1 space-y-2">
          {metrics.map((m, i) => (
            <input
              key={i}
              value={m}
              onChange={(e) => setMetrics((ms) => ms.map((x, j) => (j === i ? e.target.value : x)))}
              maxLength={200}
              placeholder={i === 0 ? 'e.g. My team can name our top three priorities without me' : 'Another measure (optional)'}
              className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
            />
          ))}
        </div>

        {error && <p className="mt-3 text-[12px] text-tlw-signal-orange">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-tlw-lg px-4 py-2 text-[13px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50"
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Save goal'}
          </button>
        </div>
      </form>
    </div>
  )
}
