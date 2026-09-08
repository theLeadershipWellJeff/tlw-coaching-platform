'use client'
import { useEffect, useState } from 'react'
import { InfoPopover } from './InfoPopover'

type Note = { id: string; title: string | null; body: string; created_at: string; updated_at: string }

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const field = 'w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange'

/**
 * "My notes" — the client's private journal. Nothing here is visible to any
 * coach; the newest notes feed the assistant so it can reason with the
 * client's own current thinking (projects, intentions, things they noticed).
 */
export function MyNotesCard() {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [editing, setEditing] = useState<Note | 'new' | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/portal/notes')
      const d = res.ok ? await res.json() : { notes: [] }
      setNotes(d.notes || [])
      setUnavailable(!!d.unavailable)
    } catch {
      setNotes([])
    }
  }
  useEffect(() => {
    load()
  }, [])

  function open(n: Note | 'new') {
    setEditing(n)
    setTitle(n === 'new' ? '' : n.title || '')
    setBody(n === 'new' ? '' : n.body)
    setError('')
  }
  async function save() {
    if (!editing) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(editing === 'new' ? '/api/portal/notes' : `/api/portal/notes/${editing.id}`, {
        method: editing === 'new' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not save the note.')
      setEditing(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the note.')
    } finally {
      setBusy(false)
    }
  }
  async function remove(n: Note) {
    if (!window.confirm(`Delete "${n.title || 'this note'}"?`)) return
    setBusy(true)
    try {
      await fetch(`/api/portal/notes/${n.id}`, { method: 'DELETE' })
      if (editing !== 'new' && editing?.id === n.id) setEditing(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">My notes</h2>
        <InfoPopover
          label="My notes"
          text="Your own space to think — projects, intentions, things you noticed. Private to you; no coach can read it. The assistant reads your newest notes so it can work with your current thinking."
        />
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className={field} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} placeholder="Write freely…" className={`${field} resize-y`} />
          {error && <p className="text-[12px] text-tlw-signal-orange">{error}</p>}
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={busy || (!title.trim() && !body.trim())} className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50">
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(null)} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">Cancel</button>
            {editing !== 'new' && (
              <button onClick={() => remove(editing)} disabled={busy} className="ml-auto text-[12px] text-tlw-warm-gray hover:text-tlw-espresso">Delete</button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3">
          {notes === null ? (
            <p className="text-[13px] text-tlw-warm-gray">Loading…</p>
          ) : unavailable ? (
            <p className="text-[13px] text-tlw-warm-gray">Notes are not available yet.</p>
          ) : notes.length === 0 ? (
            <p className="text-[13px] text-tlw-warm-gray">Nothing here yet. A place for your own thinking between sessions.</p>
          ) : (
            <ul className="space-y-2">
              {notes.slice(0, 8).map((n) => {
                const isOpen = expanded === n.id
                return (
                  <li key={n.id} className="group">
                    <button onClick={() => setExpanded(isOpen ? null : n.id)} className="block w-full text-left">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 truncate text-[14px] font-medium text-tlw-navy-deep">{n.title || n.body.split('\n')[0].slice(0, 60) || 'Untitled'}</p>
                        <span className="shrink-0 text-[12px] text-tlw-warm-gray">{fmt(n.updated_at)}</span>
                      </div>
                      <p className={`text-[13px] text-tlw-espresso ${isOpen ? 'mt-1 whitespace-pre-wrap' : 'truncate'}`}>{isOpen ? n.body : n.body.replace(/\s+/g, ' ')}</p>
                    </button>
                    {isOpen && (
                      <div className="mt-1 flex gap-3 text-[12px]">
                        <button onClick={() => open(n)} className="font-medium text-tlw-signal-orange hover:underline">Edit</button>
                        <button onClick={() => remove(n)} className="text-tlw-warm-gray hover:text-tlw-espresso">Delete</button>
                      </div>
                    )}
                  </li>
                )
              })}
              {notes.length > 8 && <li className="text-[12px] text-tlw-warm-gray">{notes.length - 8} older note{notes.length - 8 === 1 ? '' : 's'} not shown.</li>}
            </ul>
          )}
          {!unavailable && (
            <button onClick={() => open('new')} className="mt-4 rounded-tlw-lg border border-tlw-warm-gray/25 px-3 py-1.5 text-[13px] font-medium text-tlw-signal-orange transition-colors hover:bg-tlw-canvas">
              + New note
            </button>
          )}
        </div>
      )}
    </div>
  )
}
