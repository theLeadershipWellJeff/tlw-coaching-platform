'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { ScorecardSummary, CompetencyAverage } from '@/lib/scoring/aggregate'
import { bandDefinition, nextBand } from '@/lib/scoring/rubric'
import { bandColor, BandChip } from './ui'
import { AddTranscript } from './AddTranscript'
import { PanelBoard, type Panel } from '@/app/components/layout/PanelBoard'

const STORAGE_KEY = 'tlw-practice-layout'

interface Revenue {
  calendarConnected: boolean
  past: { weekStart: string; sessions: number; hours: number; total: number }
  projected: { weekStart: string; sessions: number; hours: number; total: number }
}

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

interface ReportRow {
  id: string
  client_initials: string | null
  client_name: string | null
  session_date: string | null
  session_type: string | null
  session_number: number | null
  engagement_total: number | null
  overall_score: number | null
  band: string | null
  coach_overall: number | null
  status: string
}

interface TranscriptRow {
  id: string
  client_initials: string | null
  client_name: string | null
  filename: string | null
  session_date: string | null
  match_confidence: number | null
  preview: string | null
}

interface ClientRow {
  id: string
  name: string
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Overall score per competency, averaged across sessions (spec §5, §11).
 *  Each row expands to the current band, the next level to aim for, and an
 *  editable note for what the coach will try to improve it. */
function CompetencyBars({
  competencies,
  focus,
  onSaveFocus,
}: {
  competencies: CompetencyAverage[]
  focus: Record<string, string>
  onSaveFocus: (id: number, text: string) => Promise<void>
}) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="space-y-2">
      {competencies.map((c) => {
        const expanded = open === c.id
        return (
          <div key={c.id} className="rounded-tlw-lg" style={{ backgroundColor: expanded ? 'var(--color-surface)' : undefined }}>
            <button
              onClick={() => setOpen(expanded ? null : c.id)}
              className="flex w-full items-center gap-4 rounded-tlw-lg px-2 py-1.5 text-left transition-colors hover:bg-tlw-canvas/60"
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`shrink-0 text-tlw-warm-gray transition-transform ${expanded ? 'rotate-90' : ''}`}
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
              <div className="w-44 shrink-0 text-[13px] text-tlw-espresso">
                <span className="text-tlw-warm-gray">{c.id}.</span> {c.name}
              </div>
              <div className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: 'var(--color-divider)' }}>
                <div
                  className="h-1.5 rounded-full"
                  style={{ width: `${(c.average / 5) * 100}%`, backgroundColor: bandColor(c.band) }}
                />
              </div>
              <div className="w-12 shrink-0 text-right text-[14px] font-medium" style={{ color: bandColor(c.band) }}>
                {c.average.toFixed(1)}
              </div>
            </button>
            {expanded && <CompetencyDetail comp={c} focus={focus[String(c.id)] || ''} onSaveFocus={onSaveFocus} />}
          </div>
        )
      })}
    </div>
  )
}

function CompetencyDetail({
  comp,
  focus,
  onSaveFocus,
}: {
  comp: CompetencyAverage
  focus: string
  onSaveFocus: (id: number, text: string) => Promise<void>
}) {
  const [text, setText] = useState(focus)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const next = nextBand(comp.band)

  async function save() {
    if (text.trim() === focus.trim()) return
    setState('saving')
    await onSaveFocus(comp.id, text.trim())
    setState('saved')
  }

  return (
    <div className="grid grid-cols-1 gap-3 px-2 pb-3 pt-1 md:grid-cols-3">
      {/* Current state */}
      <div className="rounded-tlw-md p-3" style={{ border: '0.5px solid var(--color-divider)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tlw-warm-gray">Current state</p>
        <p className="mt-1.5 text-[13px] font-medium" style={{ color: bandColor(comp.band) }}>
          {comp.band.toLowerCase()} · {comp.average.toFixed(1)}
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-tlw-espresso">{bandDefinition(comp.id, comp.band)}</p>
      </div>

      {/* Next level */}
      <div className="rounded-tlw-md p-3" style={{ border: '0.5px solid var(--color-divider)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tlw-warm-gray">Next level</p>
        {next ? (
          <>
            <p className="mt-1.5 text-[13px] font-medium" style={{ color: bandColor(next) }}>
              {next.toLowerCase()}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-tlw-espresso">{bandDefinition(comp.id, next)}</p>
          </>
        ) : (
          <p className="mt-1.5 text-[12px] leading-relaxed text-tlw-espresso">
            Already at the top band — the work here is sustaining mastery.
          </p>
        )}
      </div>

      {/* Improvement focus */}
      <div className="rounded-tlw-md p-3" style={{ border: '0.5px solid var(--color-divider)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tlw-warm-gray">What I&rsquo;ll try</p>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setState('idle')
          }}
          onBlur={save}
          rows={3}
          placeholder="One concrete thing to practice next session…"
          className="mt-1.5 w-full resize-none rounded-tlw-sm border border-tlw-warm-gray/25 bg-tlw-surface px-2 py-1.5 text-[12px] leading-relaxed text-tlw-espresso outline-none focus:border-tlw-signal-orange"
        />
        <p className="mt-1 h-3 text-[10px] text-tlw-warm-gray">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}
        </p>
      </div>
    </div>
  )
}

export function ScorecardSpace() {
  const [summary, setSummary] = useState<ScorecardSummary | null>(null)
  const [reports, setReports] = useState<ReportRow[]>([])
  const [needsReview, setNeedsReview] = useState<TranscriptRow[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [revenue, setRevenue] = useState<Revenue | null>(null)
  const [focus, setFocus] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [assignError, setAssignError] = useState<Record<string, string>>({})
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [deletePending, setDeletePending] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [openPreview, setOpenPreview] = useState<string | null>(null)
  const [previewCache, setPreviewCache] = useState<
    Record<string, { loading?: boolean; text?: string; truncated?: boolean; speakerSeparated?: boolean; error?: string }>
  >({})

  async function togglePreview(id: string) {
    if (openPreview === id) {
      setOpenPreview(null)
      return
    }
    setOpenPreview(id)
    if (previewCache[id] && !previewCache[id].error) return
    setPreviewCache((c) => ({ ...c, [id]: { loading: true } }))
    try {
      const res = await fetch(`/api/transcripts/${id}`)
      if (!res.ok) throw new Error()
      const d = await res.json()
      setPreviewCache((c) => ({
        ...c,
        [id]: { text: d.preview ?? '', truncated: !!d.truncated, speakerSeparated: !!d.speakerSeparated },
      }))
    } catch {
      setPreviewCache((c) => ({ ...c, [id]: { error: 'Could not load this transcript.' } }))
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [s, r, t, c, rev, f] = await Promise.all([
      fetch('/api/reports/summary').then((x) => (x.ok ? x.json() : null)),
      fetch('/api/reports').then((x) => (x.ok ? x.json() : null)),
      fetch('/api/transcripts?status=needs_review,unmatched').then((x) => (x.ok ? x.json() : null)),
      fetch('/api/clients').then((x) => (x.ok ? x.json() : null)),
      fetch('/api/practice/revenue').then((x) => (x.ok ? x.json() : null)),
      fetch('/api/practice/competency-focus').then((x) => (x.ok ? x.json() : null)),
    ])
    setSummary(s?.summary || null)
    setReports(r?.reports || [])
    setNeedsReview(t?.transcripts || [])
    setClients(c?.clients || [])
    setRevenue(rev || null)
    setFocus(f?.focus || {})
    setLoading(false)
  }, [])

  const saveFocus = useCallback(async (id: number, text: string) => {
    setFocus((prev) => ({ ...prev, [String(id)]: text }))
    try {
      const res = await fetch('/api/practice/competency-focus', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competencyId: id, text }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.focus) setFocus(data.focus)
    } catch {
      // Non-fatal — the optimistic value stays on screen.
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function deleteTranscript(transcriptId: string) {
    setDeleting(transcriptId)
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}`, { method: 'DELETE' })
      if (res.ok) {
        setDeletePending(null)
        await load()
      }
    } finally {
      setDeleting(null)
    }
  }

  async function confirmClient(transcriptId: string) {
    const clientId = picked[transcriptId]
    if (!clientId) return
    setAssigning(transcriptId)
    setAssignError((e) => ({ ...e, [transcriptId]: '' }))
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      if (res.ok) {
        await load()
      } else {
        const data = await res.json().catch(() => ({}))
        setAssignError((e) => ({ ...e, [transcriptId]: data.error || 'Scoring failed. Please try again.' }))
      }
    } catch {
      setAssignError((e) => ({ ...e, [transcriptId]: 'Network error while scoring. Please try again.' }))
    } finally {
      setAssigning(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-tlw-lg" style={{ backgroundColor: 'var(--color-surface)' }} />
        ))}
      </div>
    )
  }

  const hasScores = summary && summary.sessionCount > 0 && summary.competencies.length > 0

  const panels: Panel[] = [
    { id: 'add-transcript', label: 'Add a transcript', node: <AddTranscript onAdded={load} /> },
    {
      id: 'revenue',
      label: 'Revenue',
      node: (
        <section>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-tlw-lg p-4" style={{ backgroundColor: 'var(--color-surface)' }}>
            <p className="text-[11px] text-tlw-warm-gray">past week revenue</p>
            <p className="mt-2 text-[30px] font-medium leading-none text-tlw-navy-deep">
              {revenue ? money(revenue.past.total) : '—'}
            </p>
            <p className="mt-1.5 text-[11px] text-tlw-warm-gray">
              {revenue
                ? `${revenue.past.sessions} logged session${revenue.past.sessions === 1 ? '' : 's'} · ${revenue.past.hours} billed h`
                : 'from logged session notes'}
            </p>
          </div>
          <div className="rounded-tlw-lg p-4" style={{ backgroundColor: 'var(--color-surface)' }}>
            <p className="text-[11px] text-tlw-warm-gray">this week projected</p>
            <p className="mt-2 text-[30px] font-medium leading-none text-tlw-navy-deep">
              {revenue ? money(revenue.projected.total) : '—'}
            </p>
            <p className="mt-1.5 text-[11px] text-tlw-warm-gray">
              {revenue && !revenue.calendarConnected
                ? 'connect Google Calendar to project'
                : revenue
                ? `${revenue.projected.sessions} scheduled session${revenue.projected.sessions === 1 ? '' : 's'} · ${revenue.projected.hours} billed h`
                : 'from this week’s calendar'}
            </p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-tlw-warm-gray">
          Hourly fee × billed hours (half-hour units, 1-hour minimum, rounding up past 15 min). Past week from each
          note’s logged length; this week projected from scheduled calendar events. Set each client’s fee on their profile.
        </p>
        </section>
      ),
    },
    {
      id: 'headline',
      label: 'Headline scores',
      node: (
        <section>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-tlw-lg p-4" style={{ backgroundColor: 'var(--color-surface)' }}>
            <p className="text-[11px] text-tlw-warm-gray">average score</p>
            <p
              className="mt-2 text-[30px] font-medium leading-none"
              style={{ color: summary?.averageBand ? bandColor(summary.averageBand) : 'var(--color-muted)' }}
            >
              {summary?.averageOverall != null ? summary.averageOverall.toFixed(1) : '—'}
            </p>
            <p className="mt-1.5 text-[11px] text-tlw-warm-gray">
              {summary?.averageBand ? summary.averageBand.toLowerCase() : 'no data yet'} · across{' '}
              {summary?.sessionCount || 0} session{summary?.sessionCount === 1 ? '' : 's'}
            </p>
          </div>
          <div className="rounded-tlw-lg p-4" style={{ backgroundColor: 'var(--color-surface)' }}>
            <p className="text-[11px] text-tlw-warm-gray">strongest area</p>
            <p className="mt-2 text-[15px] font-medium leading-tight text-tlw-navy-deep">
              {summary?.strongest?.name || '—'}
            </p>
            {summary?.strongest && (
              <p className="mt-1.5 text-[11px]" style={{ color: bandColor(summary.strongest.band) }}>
                {summary.strongest.average.toFixed(1)} · {summary.strongest.band.toLowerCase()}
              </p>
            )}
          </div>
          <div className="rounded-tlw-lg p-4" style={{ backgroundColor: 'var(--color-surface)' }}>
            <p className="text-[11px] text-tlw-warm-gray">lowest area</p>
            <p className="mt-2 text-[15px] font-medium leading-tight text-tlw-navy-deep">
              {summary?.lowest?.name || '—'}
            </p>
            {summary?.lowest && (
              <p className="mt-1.5 text-[11px]" style={{ color: bandColor(summary.lowest.band) }}>
                {summary.lowest.average.toFixed(1)} · {summary.lowest.band.toLowerCase()}
              </p>
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-tlw-warm-gray">1 = emerging, 3 = proficient (PCC), 5 = masterful (MCC)</p>
        </section>
      ),
    },
    ...(needsReview.length > 0
      ? [
          {
            id: 'needs-review',
            label: 'Needs review',
            node: (
              <section className="pt-8" style={{ borderTop: '0.5px solid var(--color-divider)' }}>
          <h2 className="mb-1 text-[15px] font-medium text-tlw-navy-deep">Needs a client confirmed</h2>
          <p className="mb-4 text-[12px] text-tlw-warm-gray">
            These transcripts couldn&apos;t be matched to a client — either the guess was uncertain or
            the file carried no name to match on (common for timestamp-named recordings). Confirm the
            client to score them; matches are never auto-assigned without confidence.
          </p>
          <div className="space-y-2">
            {needsReview.map((t) => {
              const pv = previewCache[t.id]
              const open = openPreview === t.id
              return (
                <div
                  key={t.id}
                  className="rounded-tlw-lg p-3"
                  style={{ backgroundColor: 'var(--color-surface)' }}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-tlw-espresso">
                        {t.filename || 'Untitled recording'}{' '}
                        {(t.client_name || t.client_initials) && (
                          <span className="text-tlw-warm-gray">· {t.client_name || t.client_initials}</span>
                        )}
                      </p>
                      <p className="text-[11px] text-tlw-warm-gray">
                        {fmtDate(t.session_date)}
                        {t.match_confidence != null && t.match_confidence > 0 && (
                          <> · best guess {(t.match_confidence * 100).toFixed(0)}%</>
                        )}
                      </p>
                      {t.preview && (
                        <p className="mt-1 line-clamp-2 text-[11px] italic text-tlw-warm-gray/80">
                          “{t.preview}”
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => togglePreview(t.id)}
                      className="rounded-tlw-md border border-tlw-warm-gray/25 px-2.5 py-1.5 text-[12px] text-tlw-espresso transition-opacity duration-tlw-base hover:opacity-80"
                    >
                      {open ? 'hide' : 'view'}
                    </button>
                    {deletePending === t.id ? (
                      <>
                        <button
                          onClick={() => deleteTranscript(t.id)}
                          disabled={deleting === t.id}
                          className="rounded-tlw-md border border-red-300 px-2.5 py-1.5 text-[12px] font-medium text-red-600 transition-opacity duration-tlw-base hover:opacity-80 disabled:opacity-40"
                        >
                          {deleting === t.id ? 'deleting…' : 'confirm delete'}
                        </button>
                        <button
                          onClick={() => setDeletePending(null)}
                          disabled={deleting === t.id}
                          className="rounded-tlw-md px-2 py-1.5 text-[12px] text-tlw-warm-gray transition-opacity duration-tlw-base hover:opacity-80"
                        >
                          cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setDeletePending(t.id)}
                        className="rounded-tlw-md border border-tlw-warm-gray/25 px-2.5 py-1.5 text-[12px] text-red-600 transition-opacity duration-tlw-base hover:opacity-80"
                      >
                        delete
                      </button>
                    )}
                    <select
                      value={picked[t.id] || ''}
                      onChange={(e) => setPicked((p) => ({ ...p, [t.id]: e.target.value }))}
                      className="rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-2 py-1.5 text-[12px] text-tlw-espresso"
                    >
                      <option value="">choose client…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => confirmClient(t.id)}
                      disabled={!picked[t.id] || assigning === t.id}
                      className="rounded-tlw-md bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity duration-tlw-base hover:opacity-90 disabled:opacity-40"
                    >
                      {assigning === t.id ? (
                        <span className="flex items-center gap-1.5">
                          <span className="inline-flex gap-0.5">
                            <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                          scoring
                        </span>
                      ) : 'confirm & score'}
                    </button>
                  </div>
                  {assignError[t.id] && (
                    <p className="mt-2 text-[12px]" style={{ color: 'var(--color-danger)' }}>
                      {assignError[t.id]}
                    </p>
                  )}
                  {open && (
                    <div
                      className="mt-3 rounded-tlw-md p-3"
                      style={{ border: '0.5px solid var(--color-divider)' }}
                    >
                      {pv?.loading && <p className="text-[12px] text-tlw-warm-gray">loading…</p>}
                      {pv?.error && <p className="text-[12px] text-tlw-warm-gray">{pv.error}</p>}
                      {!pv?.loading && !pv?.error && (
                        pv?.text ? (
                          <>
                            <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-tlw-espresso">
                              {pv.text}
                            </pre>
                            {pv.truncated && (
                              <p className="mt-2 text-[11px] text-tlw-warm-gray">…preview truncated · open the transcript to read the rest</p>
                            )}
                          </>
                        ) : (
                          <p className="text-[12px] text-tlw-warm-gray">This transcript appears to be empty.</p>
                        )
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
              </section>
            ),
          },
        ]
      : []),
    {
      id: 'competencies',
      label: 'Competency scores',
      node: (
        <section className="pt-8" style={{ borderTop: '0.5px solid var(--color-divider)' }}>
        <h2 className="mb-4 text-[15px] font-medium text-tlw-navy-deep">Competency scores</h2>
        {hasScores ? (
          <CompetencyBars competencies={summary!.competencies} focus={focus} onSaveFocus={saveFocus} />
        ) : (
          <p className="text-[13px] text-tlw-warm-gray">
            No sessions scored yet. Once a transcript is matched and scored, the eight ICF competencies
            appear here, averaged across your sessions.
          </p>
        )}
        </section>
      ),
    },
    {
      id: 'sessions',
      label: 'Sessions',
      node: (
        <section className="pt-8" style={{ borderTop: '0.5px solid var(--color-divider)' }}>
        <h2 className="mb-1 text-[15px] font-medium text-tlw-navy-deep">Sessions</h2>
        {reports.length === 1 && (
          <p className="mb-4 text-[12px] text-tlw-warm-gray">
            This is your baseline session — the trend line builds as more sessions are scored.
          </p>
        )}
        {reports.length === 0 ? (
          <p className="text-[13px] text-tlw-warm-gray">No scored sessions yet.</p>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <Link
                key={r.id}
                href={`/practice/${r.id}`}
                className="flex items-center justify-between gap-4 rounded-tlw-lg p-4 transition-colors duration-tlw-base hover:opacity-90"
                style={{ backgroundColor: 'var(--color-surface)' }}
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-tlw-navy-deep">
                    {r.client_name || r.client_initials || '—'}
                    {r.session_number != null && (
                      <span className="ml-2 text-[12px] font-normal text-tlw-warm-gray">
                        session {r.session_number}
                        {r.engagement_total != null ? ` of ${r.engagement_total}` : ''}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
                    {fmtDate(r.session_date)}
                    {r.session_type ? ` · ${r.session_type}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {r.coach_overall != null && (
                    <span className="text-[11px] text-tlw-warm-gray">self {r.coach_overall.toFixed(1)}</span>
                  )}
                  {r.band && <BandChip band={r.band as any} score={r.overall_score ?? undefined} />}
                </div>
              </Link>
            ))}
          </div>
        )}
        </section>
      ),
    },
  ]

  return (
    <PanelBoard
      storageKey={STORAGE_KEY}
      panels={panels}
      columns={1}
      defaultLayout={[['add-transcript', 'revenue', 'headline', 'needs-review', 'competencies', 'sessions']]}
    />
  )
}
