'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Client, Note } from '@/lib/supabase/types'
import { RichNoteEditor } from './RichNoteEditor'
import { KeyInfoCard } from './KeyInfoCard'
import { CoachingMapCard } from './CoachingMapCard'
import { EngagementGoalsCard } from './EngagementGoalsCard'
import { SendToClientModal } from './SendToClientModal'
import { extractCaptures } from '@/lib/notes/extract'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Turn stored note HTML into plain text for ACTION:/INSIGHT: capture on first
// render (before the editor has emitted any text). Block elements become
// separate lines, matching how TipTap's getText() splits content so the
// captured items are identical before and after the first edit.
function htmlToText(html: string): string {
  if (!html) return ''
  if (typeof document === 'undefined') return html
  const el = document.createElement('div')
  // Put a newline boundary between block-level elements.
  el.innerHTML = html.replace(/<\/(p|div|li|h[1-6]|ul|ol)>/gi, '</$1>\n')
  return (el.textContent || '').replace(/\n{2,}/g, '\n')
}

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

export function NotesPanel({ clientId, autoNew = false }: { clientId: string; autoNew?: boolean }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [client, setClient] = useState<Client | null>(null)
  const [clientLoaded, setClientLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const autoNewDone = useRef(false)

  // The session-notes panel surfaces persistent, per-client context (key info,
  // coaching map, engagement goals) alongside the live capture, so load the
  // client record in parallel with its notes.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/clients/${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d?.client && setClient(d.client))
      .catch(() => {})
      .finally(() => !cancelled && setClientLoaded(true))
    return () => {
      cancelled = true
    }
  }, [clientId])

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

  // When arrived here via "+ New note", start a fresh note once after load.
  // Wait for the client too so the default title can include their name.
  useEffect(() => {
    if (autoNew && !loading && clientLoaded && !autoNewDone.current) {
      autoNewDone.current = true
      newNote()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoNew, loading, clientLoaded])

  async function newNote() {
    try {
      // Default the title to the client name + date so it's pre-filled on open.
      const title = client?.name ? `${client.name} · ${formatDate(today())}` : formatDate(today())
      const res = await fetch(`/api/clients/${clientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_date: today(), title, content: '' }),
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
                client={client}
                onClientUpdated={setClient}
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
  client,
  onClientUpdated,
  onSaved,
  onDeleted,
}: {
  clientId: string
  note: Note
  client: Client | null
  onClientUpdated: (c: Client) => void
  onSaved: (n: Note) => void
  onDeleted: (id: string) => void
}) {
  const [title, setTitle] = useState(note.title || '')
  const [date, setDate] = useState(note.session_date)
  const [content, setContent] = useState(note.content)
  const [text, setText] = useState(() => htmlToText(note.content))
  const [state, setState] = useState<SaveState>('idle')
  const [sendOpen, setSendOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  // Live ACTION:/INSIGHT: capture, derived straight from the note text.
  const captures = useMemo(() => extractCaptures(text), [text])

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
        <RichNoteEditor
          html={content}
          enableTemplates
          clientId={clientId}
          onChange={(html, plain) =>
            touch(() => {
              setContent(html)
              setText(plain)
            })
          }
        />
        <CapturePanel captures={captures} client={client} onClientUpdated={onClientUpdated} />
      </div>

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

      <p className="text-[11px] text-tlw-warm-gray">
        Tip: start a line with <span className="font-semibold">ACTION:</span> or{' '}
        <span className="font-semibold">INSIGHT:</span> to capture it on the right.
      </p>

      {/* Send to client — Claude cleans the note into a client-facing email,
          shown for review before it sends. */}
      <div className="flex items-center justify-between border-t border-tlw-warm-gray/15 pt-4">
        <p className="text-[11px] text-tlw-warm-gray">
          {client?.email
            ? `Sends a cleaned-up version of this note to ${client.name}.`
            : 'Add an email on the client to enable sending.'}
        </p>
        <button
          onClick={() => setSendOpen(true)}
          disabled={!client?.email}
          className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Send to client →
        </button>
      </div>

      {sendOpen && client && (
        <SendToClientModal
          client={client}
          noteTitle={title}
          noteHtml={content}
          noteId={note.id}
          actions={captures.actions.map((a) => a.text)}
          insights={captures.insights.map((i) => i.text)}
          onClose={() => setSendOpen(false)}
        />
      )}
    </div>
  )
}

function CapturePanel({
  captures,
  client,
  onClientUpdated,
}: {
  captures: ReturnType<typeof extractCaptures>
  client: Client | null
  onClientUpdated: (c: Client) => void
}) {
  const { actions, insights } = captures

  return (
    <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
      {/* Persistent client context sits above the live capture… */}
      {client && <KeyInfoCard client={client} onUpdated={onClientUpdated} />}
      <CaptureGroup
        label="Actions"
        emptyHint="Lines starting with ACTION:"
        items={actions.map((a) => a.text)}
        accent="text-tlw-navy-rich"
        icon={<span className="mt-[2px] inline-block h-3 w-3 shrink-0 rounded-[2px] border-2 border-tlw-navy-rich" />}
      />
      <CaptureGroup
        label="Insights"
        emptyHint="Lines starting with INSIGHT:"
        items={insights.map((i) => i.text)}
        accent="text-tlw-signal-orange"
        icon={<span className="shrink-0 text-tlw-signal-orange">✦</span>}
      />
      {/* …and the assigned map + engagement goals below it. */}
      {client && <CoachingMapCard client={client} onUpdated={onClientUpdated} />}
      {client && <EngagementGoalsCard client={client} onUpdated={onClientUpdated} />}
    </div>
  )
}

function CaptureGroup({
  label,
  emptyHint,
  items,
  accent,
  icon,
}: {
  label: string
  emptyHint: string
  items: string[]
  accent: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className={`text-[11px] font-semibold uppercase tracking-[1.5px] ${accent}`}>
          {label}
        </p>
        {items.length > 0 && (
          <span className="rounded-full bg-tlw-canvas px-1.5 text-[11px] text-tlw-warm-gray">
            {items.length}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-[12px] text-tlw-warm-gray/70">{emptyHint}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((t, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-snug text-tlw-espresso">
              {icon}
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
