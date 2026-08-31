'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

// The "Plan next session" prep brief — data hook + presentational body, shared
// by the floating plan window (PlanSessionWindows) and the desktop pop-out page
// (app/popout/plan/[id]). On load it calls POST /api/clients/[id]/plan-session,
// which pulls the client's goals, open actions, recent insights, and any
// "NEXT TIME / NEXT SESSION" flags from prior notes and asks Claude for a quick
// summary + three opening questions. The generated brief is ephemeral; only the
// coach's own notepad at the top persists (localStorage, per client).

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

export function usePlanSession(clientId: string) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<PlanResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${clientId}/plan-session`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not build the session plan.')
      setData(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  return { loading, error, data, reload: load }
}

export function PlanSessionContent({
  clientId,
  loading,
  error,
  data,
  onReload,
}: {
  clientId: string
  loading: boolean
  error: string
  data: PlanResult | null
  onReload: () => void
}) {
  return (
    <div className="space-y-5">
      <PlanNotepad clientId={clientId} />
      <PlanBody loading={loading} error={error} data={data} onReload={onReload} />
    </div>
  )
}

// The coach's private scratchpad for this client's next session — saved per
// client in localStorage (never sent anywhere), so it survives closing the
// window, navigating, and the pop-out; the storage listener keeps the floating
// window and the pop-out in step when both are open.
function PlanNotepad({ clientId }: { clientId: string }) {
  const storageKey = `tlw-plan-notes-${clientId}`
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    try {
      setText(localStorage.getItem(storageKey) || '')
    } catch {}
  }, [storageKey])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== storageKey || document.activeElement === textareaRef.current) return
      setText(e.newValue || '')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storageKey])

  function update(value: string) {
    setText(value)
    try {
      if (value) localStorage.setItem(storageKey, value)
      else localStorage.removeItem(storageKey)
    } catch {}
  }

  return (
    <section className="rounded-tlw-lg border border-tlw-warm-gray/20 bg-tlw-canvas px-4 py-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-deep">
          My notes
        </p>
        {text && (
          <button
            onClick={() => update('')}
            className="text-[11px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
          >
            Clear
          </button>
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => update(e.target.value)}
        rows={3}
        placeholder="Jot reminders or talking points for this session — saved automatically, just for you."
        className="w-full resize-y rounded-tlw-md border border-tlw-warm-gray/20 bg-white px-2.5 py-2 text-[13px] leading-relaxed text-tlw-espresso placeholder:text-tlw-warm-gray/60 focus:border-tlw-navy-rich focus:outline-none"
      />
    </section>
  )
}

function PlanBody({
  loading,
  error,
  data,
  onReload,
}: {
  loading: boolean
  error: string
  data: PlanResult | null
  onReload: () => void
}) {
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
          onClick={onReload}
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
        <button onClick={onReload} className="text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
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
