'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { ScorecardSummary, CompetencyAverage } from '@/lib/scoring/aggregate'
import { bandColor, BandChip } from './ui'
import { AddTranscript } from './AddTranscript'

interface ReportRow {
  id: string
  client_initials: string | null
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
  filename: string | null
  session_date: string | null
  match_confidence: number | null
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

/** Overall score per competency, averaged across sessions (spec §5, §11). */
function CompetencyBars({ competencies }: { competencies: CompetencyAverage[] }) {
  return (
    <div className="space-y-3">
      {competencies.map((c) => (
        <div key={c.id} className="flex items-center gap-4">
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
        </div>
      ))}
    </div>
  )
}

export function ScorecardSpace() {
  const [summary, setSummary] = useState<ScorecardSummary | null>(null)
  const [reports, setReports] = useState<ReportRow[]>([])
  const [needsReview, setNeedsReview] = useState<TranscriptRow[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [picked, setPicked] = useState<Record<string, string>>({})
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
    const [s, r, t, c] = await Promise.all([
      fetch('/api/reports/summary').then((x) => (x.ok ? x.json() : null)),
      fetch('/api/reports').then((x) => (x.ok ? x.json() : null)),
      fetch('/api/transcripts?status=needs_review,unmatched').then((x) => (x.ok ? x.json() : null)),
      fetch('/api/clients').then((x) => (x.ok ? x.json() : null)),
    ])
    setSummary(s?.summary || null)
    setReports(r?.reports || [])
    setNeedsReview(t?.transcripts || [])
    setClients(c?.clients || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function confirmClient(transcriptId: string) {
    const clientId = picked[transcriptId]
    if (!clientId) return
    setAssigning(transcriptId)
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      if (res.ok) await load()
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

  return (
    <div className="space-y-12">
      {/* Add a transcript (manual / backfill) */}
      <AddTranscript onAdded={load} />

      {/* Headline */}
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

      {/* Needs review */}
      {needsReview.length > 0 && (
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
                        {t.client_initials && <span className="text-tlw-warm-gray">· {t.client_initials}</span>}
                      </p>
                      <p className="text-[11px] text-tlw-warm-gray">
                        {fmtDate(t.session_date)}
                        {t.match_confidence != null && t.match_confidence > 0 && (
                          <> · best guess {(t.match_confidence * 100).toFixed(0)}%</>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => togglePreview(t.id)}
                      className="rounded-tlw-md border border-tlw-warm-gray/25 px-2.5 py-1.5 text-[12px] text-tlw-espresso transition-opacity duration-tlw-base hover:opacity-80"
                    >
                      {open ? 'hide' : 'view'}
                    </button>
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
                      {assigning === t.id ? 'scoring…' : 'confirm & score'}
                    </button>
                  </div>
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
      )}

      {/* Overall competency scores */}
      <section className="pt-8" style={{ borderTop: '0.5px solid var(--color-divider)' }}>
        <h2 className="mb-4 text-[15px] font-medium text-tlw-navy-deep">Competency scores</h2>
        {hasScores ? (
          <CompetencyBars competencies={summary!.competencies} />
        ) : (
          <p className="text-[13px] text-tlw-warm-gray">
            No sessions scored yet. Once a transcript is matched and scored, the eight ICF competencies
            appear here, averaged across your sessions.
          </p>
        )}
      </section>

      {/* Sessions */}
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
                href={`/scorecard/${r.id}`}
                className="flex items-center justify-between gap-4 rounded-tlw-lg p-4 transition-colors duration-tlw-base hover:opacity-90"
                style={{ backgroundColor: 'var(--color-surface)' }}
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-tlw-navy-deep">
                    {r.client_initials || '—'}
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
    </div>
  )
}
