'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

// The "Plan next session" prep brief — data hook + presentational body, shared
// by the floating plan window (PlanSessionWindows) and the desktop pop-out page
// (app/popout/plan/[id]). A fresh window POSTs /api/clients/[id]/plan-session
// (goals, open actions, insights, NEXT TIME flags → Claude summary + three
// opening questions) with the notepad drafting to localStorage; "Save plan"
// persists brief + notes as a session_plans row (migration 058), after which
// the notepad autosaves to the row and the plan reopens from the workspace
// "Session plans" card — same document, any device, on the day of the session.

export interface PlanGoal {
  title: string
  description: string
}

export interface PlanResult {
  clientName: string
  nextTime: string[]
  goals: PlanGoal[]
  openActions: string[]
  recentInsights: string[]
  summary: string
  questions: string[]
  generatedAt: string
  empty?: boolean
  aiError?: string
}

export interface SavedPlanMeta {
  id: string
  title: string
  createdAt: string
}

// Unsaved-draft notepad key (kept from the first notepad release, so a draft
// typed before saving existed as a feature is still there).
const draftKey = (clientId: string) => `tlw-plan-notes-${clientId}`

// Tells the workspace "Session plans" card to refetch after a save/delete.
export const PLANS_CHANGED_EVENT = 'tlw-session-plans-changed'
export function notifyPlansChanged(clientId: string) {
  try {
    window.dispatchEvent(new CustomEvent(PLANS_CHANGED_EVENT, { detail: { clientId } }))
  } catch {}
}

export function usePlanSession(clientId: string, planId?: string | null) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<PlanResult | null>(null)
  const [saved, setSaved] = useState<SavedPlanMeta | null>(null)
  const [notes, setNotesState] = useState('')
  const [notesSync, setNotesSync] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [savingPlan, setSavingPlan] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const savedRef = useRef<SavedPlanMeta | null>(null)
  savedRef.current = saved
  const notesRef = useRef('')
  notesRef.current = notes
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesPending = useRef(false)

  const generate = useCallback(async (): Promise<PlanResult> => {
    const res = await fetch(`/api/clients/${clientId}/plan-session`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Could not build the session plan.')
    return json as PlanResult
  }, [clientId])

  // Initial load (and error-retry): a saved plan loads its stored document;
  // a fresh window generates a new brief with the notepad draft from localStorage.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        if (planId) {
          const res = await fetch(`/api/clients/${clientId}/plans/${planId}`)
          const json = await res.json()
          if (!res.ok) throw new Error(json.error || 'Could not load the saved plan.')
          if (cancelled) return
          setData(json.plan.plan as PlanResult)
          setNotesState(json.plan.notes || '')
          setSaved({ id: json.plan.id, title: json.plan.title, createdAt: json.plan.created_at })
        } else {
          try {
            const draft = localStorage.getItem(draftKey(clientId)) || ''
            if (!cancelled && draft) setNotesState(draft)
          } catch {}
          const fresh = await generate()
          if (!cancelled) setData(fresh)
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clientId, planId, generate, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  // Regenerate the brief; on a saved plan the refreshed brief is written back
  // to the row (best-effort — the notes are untouched either way).
  const regenerate = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const fresh = await generate()
      setData(fresh)
      const cur = savedRef.current
      if (cur) {
        fetch(`/api/clients/${clientId}/plans/${cur.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: fresh }),
        }).catch(() => {})
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [clientId, generate])

  const setNotes = useCallback(
    (value: string) => {
      setNotesState(value)
      const cur = savedRef.current
      if (cur) {
        setNotesSync('saving')
        notesPending.current = true
        if (notesTimer.current) clearTimeout(notesTimer.current)
        notesTimer.current = setTimeout(() => {
          notesPending.current = false
          fetch(`/api/clients/${clientId}/plans/${cur.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: value }),
          })
            .then((r) => setNotesSync(r.ok ? 'saved' : 'error'))
            .catch(() => setNotesSync('error'))
        }, 700)
      } else {
        try {
          if (value) localStorage.setItem(draftKey(clientId), value)
          else localStorage.removeItem(draftKey(clientId))
        } catch {}
      }
    },
    [clientId]
  )

  // Flush a debounced notes write if the window closes mid-typing.
  useEffect(() => {
    return () => {
      if (notesTimer.current) clearTimeout(notesTimer.current)
      const cur = savedRef.current
      if (notesPending.current && cur) {
        fetch(`/api/clients/${clientId}/plans/${cur.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: notesRef.current }),
          keepalive: true,
        }).catch(() => {})
      }
    }
  }, [clientId])

  const save = useCallback(async () => {
    if (!data || savedRef.current) return
    setSavingPlan(true)
    setSaveError('')
    try {
      const res = await fetch(`/api/clients/${clientId}/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: data, notes: notesRef.current }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not save the plan.')
      setSaved({ id: json.plan.id, title: json.plan.title, createdAt: json.plan.created_at })
      setNotesSync('saved')
      try {
        localStorage.removeItem(draftKey(clientId))
      } catch {}
      notifyPlansChanged(clientId)
    } catch (e: any) {
      setSaveError(e.message)
    } finally {
      setSavingPlan(false)
    }
  }, [clientId, data])

  return {
    loading,
    error,
    data,
    saved,
    notes,
    setNotes,
    notesSync,
    savingPlan,
    saveError,
    save,
    reload,
    regenerate,
  }
}

export type PlanSessionState = ReturnType<typeof usePlanSession>

export function PlanSessionContent({
  clientId,
  state,
}: {
  clientId: string
  state: PlanSessionState
}) {
  return (
    <div className="space-y-5">
      <PlanNotepad clientId={clientId} state={state} />
      <PlanBody state={state} />
    </div>
  )
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// The coach's own plan for the session — a notepad above the generated brief.
// Unsaved: drafts to localStorage (per client, this device). Saved: autosaves
// to the session_plans row, so it reopens anywhere from the Session plans card.
function PlanNotepad({ clientId, state }: { clientId: string; state: PlanSessionState }) {
  const { notes, setNotes, saved, notesSync, data, loading, savingPlan, saveError, save } = state
  const storageKey = draftKey(clientId)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // An unsaved draft edited in another window (e.g. the pop-out) follows here.
  useEffect(() => {
    if (saved) return
    function onStorage(e: StorageEvent) {
      if (e.key !== storageKey || document.activeElement === textareaRef.current) return
      setNotes(e.newValue || '')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storageKey, saved, setNotes])

  const syncLabel =
    notesSync === 'saving'
      ? 'saving…'
      : notesSync === 'error'
        ? "couldn't save — keep this window open and try typing again"
        : 'notes autosave'

  return (
    <section className="rounded-tlw-lg border border-tlw-warm-gray/20 bg-tlw-canvas px-4 py-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-deep">
          My notes
        </p>
        {!saved && notes && (
          <button
            onClick={() => setNotes('')}
            className="text-[11px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
          >
            Clear
          </button>
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="Write your own plan for this session — talking points, structure, reminders."
        className="w-full resize-y rounded-tlw-md border border-tlw-warm-gray/20 bg-white px-2.5 py-2 text-[13px] leading-relaxed text-tlw-espresso placeholder:text-tlw-warm-gray/60 focus:border-tlw-navy-rich focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {saved ? (
          <p className="text-[11px] text-tlw-warm-gray">
            Saved to Session plans · {fmtDate(saved.createdAt)} ·{' '}
            <span className={notesSync === 'error' ? 'text-tlw-signal-orange' : ''}>{syncLabel}</span>
          </p>
        ) : (
          <>
            <button
              onClick={save}
              disabled={loading || savingPlan || !data}
              className="rounded-tlw-lg bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {savingPlan ? 'Saving…' : 'Save plan'}
            </button>
            <p className="text-[11px] leading-snug text-tlw-warm-gray">
              Keeps this brief + your notes on the client&apos;s Session plans card.
            </p>
          </>
        )}
      </div>
      {saveError && <p className="mt-1.5 text-[12px] text-tlw-signal-orange">{saveError}</p>}
    </section>
  )
}

function PlanBody({ state }: { state: PlanSessionState }) {
  const { loading, error, data, reload, regenerate } = state

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-tlw-warm-gray/30 border-t-tlw-navy-rich" />
        <p className="text-[13px] text-tlw-warm-gray">Pulling goals, actions, insights…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4 py-4">
        <p className="text-[13px] text-tlw-signal-orange">{error}</p>
        <button
          onClick={reload}
          className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      </div>
    )
  }

  if (data?.empty) {
    return (
      <div className="space-y-4 py-6 text-center">
        <p className="text-[14px] font-medium text-tlw-espresso">Not much to pull from yet</p>
        <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-tlw-warm-gray">
          Add a session note (with goals, <span className="font-medium">ACTION:</span>,{' '}
          <span className="font-medium">INSIGHT:</span>, or{' '}
          <span className="font-medium">NEXT TIME:</span> lines) and this will assemble a prep brief for
          the next session.
        </p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-5">
      {/* NEXT TIME — front and center. */}
      {data.nextTime.length > 0 && (
        <section
          className="rounded-tlw-lg px-4 py-3"
          style={{ background: 'rgba(232,101,10,.08)', border: '1px solid rgba(232,101,10,.25)' }}
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px]" style={{ color: '#E8650A' }}>
            ⚑ Flagged for this session
          </p>
          <ul className="space-y-1.5">
            {data.nextTime.map((item, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-tlw-espresso">
                <span style={{ color: '#E8650A' }}>›</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Quick summary. */}
      {data.summary ? (
        <section>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[1.5px] text-tlw-warm-gray">
            Quick summary
          </p>
          <p className="text-[13.5px] leading-relaxed text-tlw-espresso">{data.summary}</p>
        </section>
      ) : (
        data.aiError && <p className="text-[12px] text-tlw-signal-orange">{data.aiError}</p>
      )}

      {/* Three opening questions. */}
      {data.questions.length > 0 && (
        <section className="rounded-tlw-lg border border-tlw-warm-gray/20 bg-tlw-canvas px-4 py-3.5">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-deep">
            Three questions to open with
          </p>
          <ol className="space-y-2.5">
            {data.questions.map((q, i) => (
              <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-tlw-espresso">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tlw-navy-rich text-[11px] font-semibold text-tlw-cream">
                  {i + 1}
                </span>
                <span>{q}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Supporting context. */}
      {(data.goals.length > 0 || data.openActions.length > 0 || data.recentInsights.length > 0) && (
        <details className="group">
          <summary className="cursor-pointer list-none text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
            <span className="group-open:hidden">Show supporting context ↓</span>
            <span className="hidden group-open:inline">Hide supporting context ↑</span>
          </summary>
          <div className="mt-3 space-y-4">
            {data.goals.length > 0 && (
              <ContextList label="Coaching goals">
                {data.goals.map((g, i) => (
                  <li key={i} className="text-[13px] leading-relaxed text-tlw-espresso">
                    <span className="font-medium">{g.title}</span>
                    {g.description && <span className="text-tlw-warm-gray"> — {g.description}</span>}
                  </li>
                ))}
              </ContextList>
            )}
            {data.openActions.length > 0 && (
              <ContextList label="Open actions">
                {data.openActions.map((a, i) => (
                  <li key={i} className="text-[13px] leading-relaxed text-tlw-espresso">
                    ▢ {a}
                  </li>
                ))}
              </ContextList>
            )}
            {data.recentInsights.length > 0 && (
              <ContextList label="Recent insights">
                {data.recentInsights.map((ins, i) => (
                  <li key={i} className="text-[13px] leading-relaxed text-tlw-espresso">
                    ✦ {ins}
                  </li>
                ))}
              </ContextList>
            )}
          </div>
        </details>
      )}

      <div className="border-t border-tlw-warm-gray/15 pt-3">
        <button onClick={regenerate} className="text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
          ↻ Regenerate
        </button>
      </div>
    </div>
  )
}

function ContextList({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[1.5px] text-tlw-warm-gray">{label}</p>
      <ul className="space-y-1">{children}</ul>
    </div>
  )
}
