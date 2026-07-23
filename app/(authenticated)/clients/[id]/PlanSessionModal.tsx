'use client'
import { useCallback, useEffect, useState } from 'react'
import { Modal } from '@/app/components/shared/Modal'

interface PlanGoal {
  title: string
  description: string
}

interface PlanResult {
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

/**
 * Plan Next Session — a prep card that pops over the workspace. On open it calls
 * POST /api/clients/[id]/plan-session, which pulls the client's goals, open
 * actions, recent insights, and any "NEXT TIME / NEXT SESSION" flags from prior
 * notes and asks Claude for a quick summary + three opening questions. Ephemeral:
 * nothing is saved — the coach reads it, then closes it.
 */
export function PlanSessionModal({
  clientId,
  clientName,
  onClose,
}: {
  clientId: string
  clientName: string
  onClose: () => void
}) {
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

  return (
    <Modal title={`Plan next session · ${clientName}`} onClose={onClose} width="max-w-2xl">
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-tlw-warm-gray/30 border-t-tlw-navy-rich" />
          <p className="text-[13px] text-tlw-warm-gray">Pulling goals, actions, insights…</p>
        </div>
      ) : error ? (
        <div className="space-y-4 py-4">
          <p className="text-[13px] text-tlw-signal-orange">{error}</p>
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
              Close
            </button>
            <button
              onClick={load}
              className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90"
            >
              Try again
            </button>
          </div>
        </div>
      ) : data?.empty ? (
        <div className="space-y-4 py-6 text-center">
          <p className="text-[14px] font-medium text-tlw-espresso">Not much to pull from yet</p>
          <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-tlw-warm-gray">
            Add a session note (with goals, <span className="font-medium">ACTION:</span>,{' '}
            <span className="font-medium">INSIGHT:</span>, or{' '}
            <span className="font-medium">NEXT TIME:</span> lines) and this will assemble a prep brief for the
            next session.
          </p>
          <div className="flex justify-center">
            <button onClick={onClose} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
              Close
            </button>
          </div>
        </div>
      ) : data ? (
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
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[1.5px] text-tlw-warm-gray">Quick summary</p>
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

          <div className="flex items-center justify-between gap-3 border-t border-tlw-warm-gray/15 pt-4">
            <button onClick={load} className="text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
              ↻ Regenerate
            </button>
            <button
              onClick={onClose}
              className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90"
            >
              Start session
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
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
