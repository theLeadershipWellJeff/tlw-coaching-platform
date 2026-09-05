'use client'
import { useCallback, useEffect, useState } from 'react'
import { usePlanSessionWindows } from '@/app/components/plan/PlanSessionWindows'
import { PLANS_CHANGED_EVENT, notifyPlansChanged } from '@/app/components/plan/PlanSessionContent'

export interface SessionPlanRow {
  id: string
  title: string
  notes: string
  created_at: string
  updated_at: string
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** First non-empty line of the coach's notes — the row preview. */
function notesPreview(notes: string): string {
  return (notes || '').split('\n').map((l) => l.trim()).find(Boolean) || ''
}

/**
 * Saved session plans (migration 058) — every plan the coach saved from the
 * "Plan next session" window, newest first. Opening a row loads that exact
 * document (the generated brief + the coach's own notepad plan) back into the
 * movable floating window, so a plan written days ahead is right there on the
 * day of the session. Coach-private; nothing here is client-facing.
 */
export function SessionPlansCard({ clientId, clientName }: { clientId: string; clientName: string }) {
  const { openPlanWindow } = usePlanSessionWindows()
  const [plans, setPlans] = useState<SessionPlanRow[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/clients/${clientId}/plans`)
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((d) => {
        setPlans(d.plans || [])
        setUnavailable(!!d.unavailable)
      })
      .catch(() => setPlans([]))
  }, [clientId])

  useEffect(() => {
    load()
    // Refetch when a plan is saved/deleted from the floating window or pop-out.
    function onChanged(e: Event) {
      const detail = (e as CustomEvent).detail
      if (!detail?.clientId || detail.clientId === clientId) load()
    }
    window.addEventListener(PLANS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(PLANS_CHANGED_EVENT, onChanged)
  }, [clientId, load])

  async function remove(id: string) {
    if (!confirm('Delete this saved plan? Your notes on it will be gone too.')) return
    setPlans((cur) => (cur || []).filter((p) => p.id !== id))
    try {
      const res = await fetch(`/api/clients/${clientId}/plans/${id}`, { method: 'DELETE' })
      if (!res.ok) load()
      else notifyPlansChanged(clientId)
    } catch {
      load()
    }
  }

  const visible = showAll ? plans || [] : (plans || []).slice(0, 5)

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Session plans</p>
        <button
          onClick={() => openPlanWindow(clientId, clientName)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-tlw-lg px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity hover:opacity-90"
          style={{ background: '#E8650A' }}
        >
          <span aria-hidden>✦</span> New plan
        </button>
      </div>

      {plans === null ? (
        <div className="space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-tlw-warm-gray/15" />
          <div className="h-4 w-1/2 animate-pulse rounded-full bg-tlw-warm-gray/15" />
        </div>
      ) : unavailable ? (
        <p className="text-[13px] text-tlw-warm-gray">
          Saved plans aren&apos;t available yet — apply migration <span className="font-medium">058_session_plans</span> in
          Supabase to turn this on.
        </p>
      ) : plans.length === 0 ? (
        <p className="text-[13px] text-tlw-warm-gray">
          No saved plans yet. Open <span className="font-medium">Plan next session</span>, write your own plan in My
          notes, and hit <span className="font-medium">Save plan</span> — it&apos;ll be here waiting on the day of the
          session.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-tlw-warm-gray/10">
            {visible.map((p) => {
              const preview = notesPreview(p.notes)
              return (
                <li key={p.id} className="group flex items-center gap-3 py-2.5">
                  <button
                    onClick={() => openPlanWindow(clientId, clientName, p.id)}
                    className="min-w-0 flex-1 text-left"
                    title="Open this plan in the floating window"
                  >
                    <p className="truncate text-[13.5px] font-medium text-tlw-espresso group-hover:text-tlw-navy-deep">
                      {p.title || `Session plan · ${fmtDate(p.created_at)}`}
                    </p>
                    <p className="truncate text-[12px] text-tlw-warm-gray">
                      {preview || <span className="italic">No notes yet</span>}
                      <span className="text-tlw-warm-gray/70"> · updated {fmtDate(p.updated_at)}</span>
                    </p>
                  </button>
                  <button
                    onClick={() => openPlanWindow(clientId, clientName, p.id)}
                    className="shrink-0 rounded-tlw-lg border border-tlw-warm-gray/30 px-2.5 py-1 text-[12px] font-medium text-tlw-espresso transition-colors hover:border-tlw-warm-gray/50"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    title="Delete this saved plan"
                    aria-label="Delete this saved plan"
                    className="shrink-0 rounded-tlw-md px-1.5 py-0.5 text-[13px] leading-none text-tlw-warm-gray/50 opacity-0 transition-opacity hover:text-tlw-signal-orange group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
          {(plans.length > 5 || showAll) && (
            <button
              onClick={() => setShowAll((s) => !s)}
              className="mt-2 text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
            >
              {showAll ? 'Show fewer ↑' : `Show all (${plans.length}) ↓`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
