'use client'
import { useState } from 'react'

const MAX = 7

/**
 * Review-and-confirm step for "Save this week's plan". The proposal came from
 * the model; the person edits, reorders by deleting/adding, and only their
 * confirmed list is saved. Nothing writes without the Save button.
 */
export function SavePlanModal({
  initialTitle,
  initialTasks,
  weekStart,
  conversationId,
  onClose,
  onSaved,
}: {
  initialTitle: string | null
  initialTasks: string[]
  weekStart: string
  conversationId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(initialTitle || '')
  const [tasks, setTasks] = useState<string[]>(initialTasks.length ? initialTasks : [''])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(i: number, v: string) {
    setTasks((t) => t.map((x, j) => (j === i ? v : x)))
  }
  function remove(i: number) {
    setTasks((t) => t.filter((_, j) => j !== i))
  }
  async function save() {
    const clean = tasks.map((t) => t.trim()).filter(Boolean)
    if (!clean.length) {
      setError('Add at least one task.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/portal/weekly-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart, title: title.trim() || null, tasks: clean, conversationId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not save the plan.')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the plan.')
    } finally {
      setSaving(false)
    }
  }

  const label = new Date(weekStart + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tlw-navy-deep/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-tlw-2xl bg-tlw-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[17px] font-medium text-tlw-navy-deep">Your plan for the week of {label}</h2>
        <p className="mt-1 text-[13px] text-tlw-warm-gray">Edit anything before it goes on your home page. This is your list, not the assistant&apos;s.</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Theme for the week (optional)"
          className="mt-4 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
        />
        <ol className="mt-3 space-y-2">
          {tasks.map((t, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-5 text-right text-[12px] tabular-nums text-tlw-warm-gray">{i + 1}.</span>
              <input
                value={t}
                onChange={(e) => set(i, e.target.value)}
                className="flex-1 rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
              />
              <button type="button" onClick={() => remove(i)} aria-label="Remove" className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">✕</button>
            </li>
          ))}
        </ol>
        {tasks.length < MAX && (
          <button type="button" onClick={() => setTasks((t) => [...t, ''])} className="mt-2 text-[12px] font-medium text-tlw-signal-orange hover:underline">
            + Add a task
          </button>
        )}
        {error && <p className="mt-2 text-[12px] text-tlw-signal-orange">{error}</p>}
        <div className="mt-5 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="text-[13px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50">
            {saving ? 'Saving…' : 'Save to my home page'}
          </button>
        </div>
      </div>
    </div>
  )
}
