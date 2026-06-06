'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Note } from '@/lib/supabase/types'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(d: string): string {
  // d is YYYY-MM-DD; parse as local to avoid timezone drift.
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function NotesPanel({ clientId }: { clientId: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${clientId}/notes`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load notes')
      setNotes(data.notes || [])
      setActiveId((prev) => prev || data.notes?.[0]?.id || null)
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  async function newNote() {
    try {
      const res = await fetch(`/api/clients/${clientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_date: today(), title: '', content: '' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create note')
      setNotes((prev) => [data.note, ...prev])
      setActiveId(data.note.id)
    } catch (e: any) {
      setError(e.message)
    }
  }

  function onSaved(updated: Note) {
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
  }

  async function onDeleted(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    setActiveId((prev) => (prev === id ? null : prev))
  }

  const active = notes.find((n) => n.id === activeId) || null

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
      <div className="flex items-center justify-between border-b border-tlw-warm-gray/15 px-5 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          Session notes
        </p>
        <button
          onClick={newNote}
          className="rounded-tlw-lg bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-colors hover:bg-tlw-navy-rich/85"
        >
          + New note
        </button>
      </div>

      {loading ? (
        <div className="p-5">
          <div className="h-24 animate-pulse rounded-tlw-lg bg-tlw-canvas" />
        </div>
      ) : error ? (
        <div className="p-8 text-center">
          <p className="text-[13px] text-tlw-espresso">{error}</p>
          <button onClick={load} className="mt-3 text-[13px] font-medium text-tlw-signal-orange hover:underline">
            Try again
          </button>
        </div>
      ) : notes.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-[13px] text-tlw-warm-gray">No notes yet. Start your first session note.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr]">
          {/* Note list */}
          <div className="border-b border-tlw-warm-gray/15 md:border-b-0 md:border-r">
            {notes.map((n) => (
              <button
                key={n.id}
                onClick={() => setActiveId(n.id)}
                className={`block w-full border-b border-tlw-warm-gray/10 px-4 py-3 text-left transition-colors last:border-b-0 ${
                  n.id === activeId ? 'bg-tlw-canvas' : 'hover:bg-tlw-canvas/50'
                }`}
              >
                <p className="truncate text-[13px] font-medium text-tlw-navy-deep">
                  {n.title?.trim() || 'Untitled note'}
                </p>
                <p className="mt-0.5 text-[11px] text-tlw-warm-gray">{formatDate(n.session_date)}</p>
              </button>
            ))}
          </div>

          {/* Editor */}
          <div className="p-5">
            {active ? (
              <NoteEditor
                key={active.id}
                clientId={clientId}
                note={active}
                onSaved={onSaved}
                onDeleted={onDeleted}
              />
            ) : (
              <p className="text-[13px] text-tlw-warm-gray">Select a note to edit.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NoteEditor({
  clientId,
  note,
  onSaved,
  onDeleted,
}: {
  clientId: string
  note: Note
  onSaved: (n: Note) => void
  onDeleted: (id: string) => void
}) {
  const [title, setTitle] = useState(note.title || '')
  const [date, setDate] = useState(note.session_date)
  const [content, setContent] = useState(note.content)
  const [state, setState] = useState<SaveState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  const save = useCallback(async () => {
    setState('saving')
    try {
      const res = await fetch(`/api/clients/${clientId}/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, session_date: date }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      dirty.current = false
      setState('saved')
      onSaved(data.note)
    } catch {
      setState('error')
    }
  }, [clientId, note.id, title, content, date, onSaved])

  // Debounced autosave whenever an edited field changes.
  useEffect(() => {
    if (!dirty.current) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(save, 900)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [title, content, date, save])

  function touch(fn: () => void) {
    dirty.current = true
    setState('idle')
    fn()
  }

  async function remove() {
    if (!confirm('Delete this note? This cannot be undone.')) return
    const res = await fetch(`/api/clients/${clientId}/notes/${note.id}`, { method: 'DELETE' })
    if (res.ok) onDeleted(note.id)
  }

  const statusLabel =
    state === 'saving'
      ? 'Saving…'
      : state === 'saved'
      ? 'Saved'
      : state === 'error'
      ? 'Save failed'
      : ''

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          value={title}
          onChange={(e) => touch(() => setTitle(e.target.value))}
          placeholder="Note title"
          className="flex-1 border-none bg-transparent text-base font-medium text-tlw-navy-deep outline-none placeholder:text-tlw-warm-gray/60"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => touch(() => setDate(e.target.value))}
          className="rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-2 py-1 text-[12px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
        />
      </div>

      <textarea
        value={content}
        onChange={(e) => touch(() => setContent(e.target.value))}
        placeholder="Write your session notes…"
        rows={14}
        className="w-full resize-y rounded-tlw-lg border border-tlw-warm-gray/20 bg-tlw-canvas/40 p-4 text-[14px] leading-relaxed text-tlw-espresso outline-none transition-colors focus:border-tlw-signal-orange"
      />

      <div className="flex items-center justify-between">
        <span
          className={`text-[12px] ${
            state === 'error' ? 'text-tlw-signal-orange' : 'text-tlw-warm-gray'
          }`}
        >
          {statusLabel}
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={remove}
            className="text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-signal-orange"
          >
            Delete
          </button>
          <button
            onClick={save}
            className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[12px] font-medium text-tlw-espresso transition-colors hover:border-tlw-warm-gray/50"
          >
            Save now
          </button>
        </div>
      </div>
    </div>
  )
}
