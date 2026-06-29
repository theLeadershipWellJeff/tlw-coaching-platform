'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Client, Note } from '@/lib/supabase/types'
import { RichNoteEditor } from './RichNoteEditor'
import { KeyInfoCard } from './KeyInfoCard'
import { CoachingMapCard } from './CoachingMapCard'
import { EngagementGoalsCard } from './EngagementGoalsCard'
import { SendToClientModal } from './SendToClientModal'
import { ScheduleSessionModal } from './ScheduleSessionModal'
import { PrepSheetCard } from './PrepSheetCard'
import { extractCaptures } from '@/lib/notes/extract'
import { billedHours } from '@/lib/billing'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// A note's persisted action item — captured from an ACTION: line and stored so
// it flows to the workspace, the {{unfinished_actions}} field, and so the
// capture-panel checkbox can mark it done.
type NoteAction = {
  id: string
  note_id: string | null
  description: string
  status: string
  completed_at: string | null
  created_at: string
}

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
        <div className="space-y-5 p-5">
          {active ? (
            <NoteEditor
              key={active.id}
              clientId={clientId}
              note={active}
              notes={notes}
              client={client}
              onClientUpdated={setClient}
              onSaved={onSaved}
              onDeleted={onDeleted}
            />
          ) : (
            <p className="text-[13px] text-tlw-warm-gray">Select a note below to edit.</p>
          )}

          {/* Most recent session notes (5), with the rest a click away. */}
          <RecentNotes notes={notes} activeId={activeId} onSelect={setActiveId} />

          {/* The prep sheet we send out, alongside the notes. */}
          <PrepSheetCard clientId={clientId} />
        </div>
      )}
    </div>
  )
}

function RecentNotes({
  notes,
  activeId,
  onSelect,
}: {
  notes: Note[]
  activeId: string | null
  onSelect: (id: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? notes : notes.slice(0, 5)

  return (
    <div className="rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-tlw-warm-gray">
          Last session notes
        </p>
        {notes.length > 5 && (
          <button
            onClick={() => setShowAll((s) => !s)}
            className="text-[11px] font-medium text-tlw-signal-orange hover:underline"
          >
            {showAll ? 'Show fewer' : `Show all ${notes.length}`}
          </button>
        )}
      </div>
      <div className="divide-y divide-tlw-warm-gray/10">
        {visible.map((n) => (
          <button
            key={n.id}
            onClick={() => onSelect(n.id)}
            className={`flex w-full items-center justify-between gap-3 px-1 py-2 text-left transition-colors hover:bg-tlw-canvas/50 ${
              n.id === activeId ? 'bg-tlw-canvas/60' : ''
            }`}
          >
            <span className="truncate text-[13px] text-tlw-navy-deep">{n.title?.trim() || 'Untitled note'}</span>
            <span className="shrink-0 text-[11px] text-tlw-warm-gray">{formatDate(n.session_date)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function NoteEditor({
  clientId,
  note,
  notes,
  client,
  onClientUpdated,
  onSaved,
  onDeleted,
}: {
  clientId: string
  note: Note
  notes: Note[]
  client: Client | null
  onClientUpdated: (c: Client) => void
  onSaved: (n: Note) => void
  onDeleted: (id: string) => void
}) {
  const [title, setTitle] = useState(note.title || '')
  const [date, setDate] = useState(note.session_date)
  const [duration, setDuration] = useState<number>(note.duration_minutes ?? 60)
  const [content, setContent] = useState(note.content)
  const [text, setText] = useState(() => htmlToText(note.content))
  const [state, setState] = useState<SaveState>('idle')
  const [sendOpen, setSendOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [noteActions, setNoteActions] = useState<NoteAction[]>([])
  const [priorActions, setPriorActions] = useState<NoteAction[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  // Live ACTION:/INSIGHT: capture, derived straight from the note text.
  const captures = useMemo(() => extractCaptures(text), [text])

  // Insights from prior notes (not the current note) — 5 most recent INSIGHT:
  // lines across all other loaded notes, newest note first.
  const priorInsights = useMemo(() => {
    return notes
      .filter((n) => n.id !== note.id)
      .flatMap((n) => extractCaptures(htmlToText(n.content || '')).insights.map((i) => i.text))
      .slice(0, 5)
  }, [notes, note.id])

  // Persist this note's actions on open — so an older note's ACTION: lines flow
  // to the workspace and their checkboxes are immediately checkable.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/clients/${clientId}/notes/${note.id}/actions`, { method: 'POST' })
      .then((r) => (r.ok ? r.json() : { actions: [] }))
      .then((d) => !cancelled && setNoteActions(d.actions || []))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [clientId, note.id])

  // Fetch all open actions for this client (from prior notes) so the coach can
  // see and check them off without leaving the note editor.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/clients/${clientId}/actions`)
      .then((r) => (r.ok ? r.json() : { actions: [] }))
      .then((d) => {
        if (cancelled) return
        // Exclude the current note's own actions (those come from noteActions)
        // and exclude already-completed/dropped actions — only open prior ones.
        const prior = (d.actions || []).filter(
          (a: NoteAction) => a.note_id !== note.id && a.status === 'open'
        )
        setPriorActions(prior.slice(0, 5))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [clientId, note.id])

  const save = useCallback(async () => {
    setState('saving')
    try {
      const res = await fetch(`/api/clients/${clientId}/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, session_date: date, duration_minutes: duration }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      dirty.current = false
      setState('saved')
      onSaved(data.note)
      if (data.actions) setNoteActions(data.actions)
    } catch {
      setState('error')
    }
  }, [clientId, note.id, title, content, date, duration, onSaved])

  // Coach-side check/uncheck of a captured action — optimistic, then persisted.
  // Works for both current-note actions and prior-note actions.
  const toggleAction = useCallback(
    async (row: NoteAction) => {
      const next = row.status === 'done' ? 'open' : 'done'
      const optimistic = (a: NoteAction) =>
        a.id === row.id
          ? { ...a, status: next, completed_at: next === 'done' ? new Date().toISOString() : null }
          : a
      // Optimistically update whichever list this row belongs to.
      setNoteActions((prev) => prev.map(optimistic))
      setPriorActions((prev) => {
        const updated = prev.map(optimistic)
        // When a prior action is marked done, remove it from the prior panel
        // (it's no longer open). When un-done, keep it.
        return next === 'done' ? updated.filter((a) => a.id !== row.id) : updated
      })
      try {
        const res = await fetch(`/api/clients/${clientId}/actions/${row.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next }),
        })
        const data = await res.json()
        if (res.ok && data.action) {
          setNoteActions((prev) => prev.map((a) => (a.id === data.action.id ? data.action : a)))
        }
      } catch {
        // Leave the optimistic state; the next open/save reconciles it.
      }
    },
    [clientId]
  )

  // Debounced autosave whenever an edited field changes.
  useEffect(() => {
    if (!dirty.current) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(save, 900)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [title, content, date, duration, save])

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
        <label className="flex items-center gap-1.5 text-[12px] text-tlw-warm-gray" title="Logged session length — bills in half hours, 1-hour minimum">
          <input
            type="number"
            min={0}
            step={5}
            value={duration}
            onChange={(e) => touch(() => setDuration(Math.max(0, Math.round(Number(e.target.value) || 0))))}
            className="w-16 rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-2 py-1 text-[12px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
          />
          <span>min · bills {billedHours(duration)} h</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <CapturePanel
          captures={captures}
          noteActions={noteActions}
          priorActions={priorActions}
          priorInsights={priorInsights}
          onToggleAction={toggleAction}
          client={client}
          onClientUpdated={onClientUpdated}
        />
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
        <span className="font-semibold">INSIGHT:</span> to capture it on the left.
      </p>

      {/* Send to client — Claude cleans the note into a client-facing email,
          shown for review before it sends. */}
      <div className="flex items-center justify-between border-t border-tlw-warm-gray/15 pt-4">
        <p className="text-[11px] text-tlw-warm-gray">
          {client?.email
            ? `Sends a cleaned-up version of this note to ${client.name}.`
            : 'Add an email on the client to enable sending.'}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScheduleOpen(true)}
            className="rounded-tlw-lg border border-tlw-warm-gray/30 px-4 py-2 text-[13px] font-medium text-tlw-espresso transition-colors hover:border-tlw-warm-gray/50"
          >
            Schedule next session
          </button>
          <button
            onClick={() => setSendOpen(true)}
            disabled={!client?.email}
            className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Send to client →
          </button>
        </div>
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

      {scheduleOpen && (
        <ScheduleSessionModal
          clientId={clientId}
          clientName={client?.name || ''}
          onClose={() => setScheduleOpen(false)}
        />
      )}
    </div>
  )
}

// One row in a capture group. Actions carry their persisted done state + a
// toggle (rendered as a clickable checkbox); insights are display-only.
type CaptureItem = { text: string; done?: boolean; onToggle?: () => void }

function CapturePanel({
  captures,
  noteActions,
  priorActions,
  priorInsights,
  onToggleAction,
  client,
  onClientUpdated,
}: {
  captures: ReturnType<typeof extractCaptures>
  noteActions: NoteAction[]
  priorActions: NoteAction[]
  priorInsights: string[]
  onToggleAction: (row: NoteAction) => void
  client: Client | null
  onClientUpdated: (c: Client) => void
}) {
  const { actions, insights } = captures

  // Match each captured ACTION: line to its persisted row (by text) so the
  // checkbox reflects/saves its done state. A freshly typed line has no row yet
  // (it persists on autosave) — it shows as a plain, not-yet-checkable box.
  const rowByDesc = new Map(noteActions.map((a) => [a.description, a]))
  const actionItems: CaptureItem[] = actions.map((a) => {
    const row = rowByDesc.get(a.text)
    return {
      text: a.text,
      done: row?.status === 'done',
      onToggle: row ? () => onToggleAction(row) : undefined,
    }
  })
  const insightItems: CaptureItem[] = insights.map((i) => ({ text: i.text }))

  // Prior open actions from other sessions — checkable.
  const priorActionItems: CaptureItem[] = priorActions.map((a) => ({
    text: a.description,
    done: a.status === 'done',
    onToggle: () => onToggleAction(a),
  }))

  // Prior insights from other sessions — read-only reference.
  const priorInsightItems: CaptureItem[] = priorInsights.map((text) => ({ text }))

  return (
    <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
      {/* Persistent client context sits above the live capture… */}
      {client && <KeyInfoCard client={client} onUpdated={onClientUpdated} />}
      <CaptureGroup
        kind="action"
        label="Actions"
        emptyHint="Lines starting with ACTION:"
        items={actionItems}
        priorItems={priorActionItems}
        accent="text-tlw-navy-rich"
      />
      <CaptureGroup
        kind="insight"
        label="Insights"
        emptyHint="Lines starting with INSIGHT:"
        items={insightItems}
        priorItems={priorInsightItems}
        accent="text-tlw-signal-orange"
      />
      {/* …and the assigned map + engagement goals below it. */}
      {client && <CoachingMapCard client={client} onUpdated={onClientUpdated} />}
      {client && <EngagementGoalsCard client={client} onUpdated={onClientUpdated} />}
    </div>
  )
}

// How many captures to show before the "more" expander kicks in.
const CAPTURE_LIMIT = 5

function CaptureGroup({
  kind,
  label,
  emptyHint,
  items,
  priorItems = [],
  accent,
}: {
  kind: 'action' | 'insight'
  label: string
  emptyHint: string
  items: CaptureItem[]
  priorItems?: CaptureItem[]
  accent: string
}) {
  const [showAll, setShowAll] = useState(false)
  // Newest first — the latest captured line sits at the top of the list.
  const ordered = [...items].reverse()
  const visible = showAll ? ordered : ordered.slice(0, CAPTURE_LIMIT)
  const total = items.length + priorItems.length

  function renderItem(item: CaptureItem, i: number) {
    return (
      <li
        key={i}
        className={`flex gap-2 text-[13px] leading-snug ${
          item.done ? 'text-tlw-warm-gray' : 'text-tlw-espresso'
        }`}
      >
        {kind === 'action' ? (
          <ActionCheckbox done={!!item.done} onToggle={item.onToggle} />
        ) : (
          <span className="shrink-0 text-tlw-signal-orange">✦</span>
        )}
        <span className={item.done ? 'line-through' : ''}>{item.text}</span>
      </li>
    )
  }

  return (
    <div className="rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className={`text-[11px] font-semibold uppercase tracking-[1.5px] ${accent}`}>
          {label}
        </p>
        {total > 0 && (
          <span className="rounded-full bg-tlw-canvas px-1.5 text-[11px] text-tlw-warm-gray">
            {total}
          </span>
        )}
      </div>
      {total === 0 ? (
        <p className="text-[12px] text-tlw-warm-gray/70">{emptyHint}</p>
      ) : (
        <>
          {/* Current note's captures — newest at the top */}
          {items.length > 0 && (
            <ul className="space-y-1.5">
              {visible.map((item, i) => renderItem(item, i))}
            </ul>
          )}
          {items.length === 0 && priorItems.length > 0 && (
            <p className="text-[12px] text-tlw-warm-gray/70">{emptyHint}</p>
          )}
          {items.length > CAPTURE_LIMIT && (
            <button
              onClick={() => setShowAll((s) => !s)}
              className="mt-2 text-[11px] font-medium text-tlw-signal-orange hover:underline"
            >
              {showAll ? 'Show fewer' : `Show all ${items.length}`}
            </button>
          )}
          {/* Prior sessions — shown below a divider */}
          {priorItems.length > 0 && (
            <div className={items.length > 0 ? 'mt-3 border-t border-tlw-warm-gray/15 pt-2' : ''}>
              <p className="mb-1.5 text-[10px] uppercase tracking-[1.5px] text-tlw-warm-gray/60">
                Prior sessions
              </p>
              <ul className="space-y-1.5">
                {priorItems.map((item, i) => renderItem(item, i))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// The captured-action checkbox. Clickable once the line is persisted (onToggle
// set); a just-typed line shows as a plain box until autosave persists it.
function ActionCheckbox({ done, onToggle }: { done: boolean; onToggle?: () => void }) {
  const base = 'mt-[2px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border-2 border-tlw-navy-rich'
  if (!onToggle) {
    return <span className={base} aria-hidden />
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={done}
      aria-label={done ? 'Mark action not done' : 'Mark action done'}
      className={`${base} transition-colors ${done ? 'bg-tlw-navy-rich text-tlw-cream' : 'hover:bg-tlw-navy-rich/10'}`}
    >
      {done && <span className="text-[9px] font-bold leading-none">✓</span>}
    </button>
  )
}
