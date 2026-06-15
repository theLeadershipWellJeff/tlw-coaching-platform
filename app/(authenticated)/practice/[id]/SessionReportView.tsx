'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { COMPETENCIES, DOMAINS } from '@/lib/scoring/rubric'
import type { SessionReport } from '@/lib/supabase/types'
import type { Band, Metrics } from '@/lib/scoring/types'
import { BandChip, BandPill, MetricCard, Section, flagColor } from '../ui'

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/** §5.3 conversation metrics — the seven behavioral cards. */
function ConversationMetrics({ m }: { m: Metrics }) {
  if (m.source === 'unavailable') {
    return (
      <p className="text-[13px]" style={{ color: 'var(--color-muted)' }}>
        No speaker-separated transcript was available, so conversation metrics can&apos;t be computed
        (spec §12). Competency scores below rely on the session content only.
      </p>
    )
  }

  const cm = m.consultant_moves
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <MetricCard
          label="coach talk-time"
          value={m.coach_talk_time_pct ?? '—'}
          unit={m.coach_talk_time_pct != null ? '%' : undefined}
          flag={m.coach_talk_time_flag}
          status={m.coach_talk_time_flag === 'red' ? 'over 40% — telling too much' : 'within range'}
        />
        <MetricCard
          label="flagged emotion"
          value={m.flagged_emotion_count ?? '—'}
          flag={m.flagged_emotion_flag}
          status={
            m.flagged_emotion_flag === 'green'
              ? 'tuning into emotion'
              : m.flagged_emotion_flag === 'amber'
              ? 'at the minimum'
              : 'below the minimum of 2'
          }
        />
        <MetricCard
          label="feeling explorations"
          value={m.feeling_explorations ?? '—'}
          flag={m.feeling_explorations_flag}
          status={m.feeling_explorations === 0 ? 'caps competency 6 at 3' : 'staying with feeling'}
        />
        <MetricCard
          label="question : statement"
          value={m.question_to_statement ?? '—'}
          flag={m.question_to_statement_flag}
          status={m.question_to_statement_flag === 'green' ? 'questions lead' : 'statements lead — drift to telling'}
        />
        <MetricCard label="reflective pauses" value={m.reflective_pauses ?? '—'} status="count only" />
        <MetricCard label="role shifts flagged" value={m.role_shifts_flagged ?? '—'} status="count only" />
        <MetricCard
          label="consultant moves"
          value={cm?.count ?? '—'}
          flag={cm?.count_flag}
          status={cm && cm.count > 3 ? 'over 3 — mode drift' : 'within coaching mode'}
        />
      </div>

      {cm && cm.moves.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[12px] text-tlw-warm-gray">
            consultant move execution{' '}
            <span style={{ color: flagColor(cm.execution_flag) }}>· {cm.execution_flag}</span>
          </p>
          {cm.moves.map((mv, i) => (
            <div key={i} className="rounded-tlw-lg p-3" style={{ backgroundColor: 'var(--color-surface)' }}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-tlw-espresso">{mv.description}</p>
                <span className="shrink-0 text-[13px] font-medium" style={{ color: flagColor(mv.status) }}>
                  {mv.score}/4
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-tlw-warm-gray">
                {(
                  [
                    ['signaled', mv.signaled],
                    ['permissioned', mv.permissioned],
                    ['brief', mv.brief],
                    ['floor returned', mv.floor_returned],
                  ] as const
                ).map(([label, ok]) => (
                  <span key={label} style={{ color: ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {ok ? '✓' : '✕'} {label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px]" style={{ color: 'var(--color-muted)' }}>
        figures {m.source} from the transcript
      </p>
    </>
  )
}

export function SessionReportView({ id }: { id: string }) {
  const [row, setRow] = useState<SessionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // coach self-scoring panel state
  const [open, setOpen] = useState(false)
  const [selfScores, setSelfScores] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // suggested-move panel state (per competency)
  const [openComp, setOpenComp] = useState<number | null>(null)
  const [moves, setMoves] = useState<Record<number, { loading?: boolean; text?: string; error?: string }>>({})

  async function toggleMove(competencyId: number) {
    if (openComp === competencyId) {
      setOpenComp(null)
      return
    }
    setOpenComp(competencyId)
    if (moves[competencyId] && !moves[competencyId].error) return
    setMoves((m) => ({ ...m, [competencyId]: { loading: true } }))
    try {
      const res = await fetch(`/api/reports/${id}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competencyId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not generate a suggestion.')
      setMoves((m) => ({ ...m, [competencyId]: { text: data.suggestion } }))
    } catch (e: any) {
      setMoves((m) => ({ ...m, [competencyId]: { error: e?.message || 'Could not generate a suggestion.' } }))
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/reports/${id}`)
    if (res.status === 404) {
      setNotFound(true)
      setLoading(false)
      return
    }
    const data = await res.json()
    setRow(data.report)
    setSelfScores(data.report?.coach_self_scores || {})
    setNotes(data.report?.coach_notes || '')
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const report = row?.report
  const ranked = useMemo(() => {
    if (!report) return { strong: null as null | { name: string }, low: null as null | { name: string } }
    const sorted = [...report.competencies].sort((a, b) => b.score - a.score)
    return { strong: sorted[0] || null, low: sorted[sorted.length - 1] || null }
  }, [report])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachSelfScores: selfScores, coachNotes: notes }),
      })
      if (res.ok) await load()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="h-40 animate-pulse rounded-tlw-lg" style={{ backgroundColor: 'var(--color-surface)' }} />
  }
  if (notFound || !report) {
    return (
      <div className="rounded-tlw-lg p-8 text-center" style={{ backgroundColor: 'var(--color-surface)' }}>
        <p className="text-[13px] text-tlw-espresso">This report couldn&apos;t be found.</p>
        <Link href="/practice" className="mt-3 inline-block text-[13px] font-medium text-tlw-signal-orange hover:underline">
          Back to practice
        </Link>
      </div>
    )
  }

  const s = report.session

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/practice" className="text-[12px] text-tlw-warm-gray hover:text-tlw-espresso">
        ← practice
      </Link>

      {/* 1 · Header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-tlw-navy-deep">Session report · {s.client_initials}</h1>
          <p className="mt-1 text-[13px] text-tlw-warm-gray">
            {s.coach}
            {s.type ? ` · ${s.type}` : ''} · {fmtDate(s.date)}
            {s.session_number != null && (
              <> · session {s.session_number}{s.engagement_total != null ? ` of ${s.engagement_total}` : ''}</>
            )}
          </p>
        </div>
        <BandPill band={report.band} />
      </div>

      {/* 2 · Score summary */}
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label="this session score" value={report.overall_score.toFixed(1)} status={report.band.toLowerCase()} />
        <MetricCard label="strongest competency" value={ranked.strong?.name || '—'} />
        <MetricCard label="lowest competency" value={ranked.low?.name || '—'} />
      </div>
      <p className="mt-2 text-[11px]" style={{ color: 'var(--color-muted)' }}>
        scored out of 5 · 1 = emerging, 3 = proficient (PCC), 5 = masterful (MCC)
      </p>

      <div className="mt-10 space-y-10">
        {/* 3 · Conversation metrics */}
        <Section title="Conversation metrics">
          <ConversationMetrics m={report.metrics} />
        </Section>

        {/* 4 · ICF competency read */}
        <Section title="ICF competency read">
          <p className="mb-4 text-[12px] text-tlw-warm-gray">
            Tap a competency for a suggested move to raise that score next session.
          </p>
          <div className="space-y-6">
            {DOMAINS.map((domain) => {
              const inDomain = report.competencies.filter((c) => c.domain === domain.label)
              if (inDomain.length === 0) return null
              return (
                <div key={domain.key}>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
                    {domain.key} · {domain.label.toLowerCase()}
                  </p>
                  <div className="space-y-2">
                    {inDomain.map((c) => {
                      const mv = moves[c.id]
                      const expanded = openComp === c.id
                      return (
                        <div key={c.id} className="rounded-tlw-lg p-3" style={{ backgroundColor: 'var(--color-surface)' }}>
                          <button
                            onClick={() => toggleMove(c.id)}
                            className="flex w-full items-center justify-between gap-3 text-left"
                            aria-expanded={expanded}
                          >
                            <p className="text-[13px] font-medium text-tlw-espresso">
                              <span className="text-tlw-warm-gray">{c.id}.</span> {c.name}
                            </p>
                            <span className="flex shrink-0 items-center gap-2">
                              <BandChip band={c.band} score={c.score} />
                              <svg
                                viewBox="0 0 24 24"
                                width="14"
                                height="14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.8}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`text-tlw-warm-gray transition-transform duration-tlw-base ${expanded ? 'rotate-180' : ''}`}
                              >
                                <path d="M6 9l6 6 6-6" />
                              </svg>
                            </span>
                          </button>
                          {c.evidence && <p className="mt-1.5 text-[12px] text-tlw-warm-gray">{c.evidence}</p>}
                          {c.subcompetency_refs.length > 0 && (
                            <p className="mt-1 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                              {c.subcompetency_refs.join(' · ')}
                            </p>
                          )}
                          {expanded && (
                            <div className="mt-3 rounded-tlw-md p-3" style={{ border: '0.5px solid var(--color-divider)' }}>
                              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
                                suggested move
                              </p>
                              {mv?.loading && <p className="text-[12px] text-tlw-warm-gray">thinking of a move to raise this…</p>}
                              {mv?.error && <p className="text-[12px]" style={{ color: 'var(--color-danger)' }}>{mv.error}</p>}
                              {mv?.text && (
                                <p className="text-[13px] leading-relaxed text-tlw-espresso">{mv.text}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

        {/* 5 · WIN debrief */}
        <Section title="WIN debrief">
          <div className="space-y-4">
            {(
              [
                ['what went well', report.win.went_well],
                ['improve (one)', report.win.improve],
                ['next step', report.win.next_step],
              ] as const
            ).map(([label, text]) => (
              <div key={label}>
                <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">{label}</p>
                <p className="mt-1 text-[13px] text-tlw-espresso">{text || '—'}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* 6 · Score trend */}
        <Section title="Score trend">
          <p className="text-[13px] text-tlw-warm-gray">
            {row?.coach_overall != null ? (
              <>
                Your self-score for this session was{' '}
                <span className="font-medium text-tlw-espresso">{row.coach_overall.toFixed(1)}</span> against the
                engine&apos;s <span className="font-medium text-tlw-espresso">{report.overall_score.toFixed(1)}</span>.
                The overall and per-client trend lines build as more sessions are scored.
              </>
            ) : (
              'The overall and per-client trend lines build as more sessions are scored. Add your own scores below to start the calibration record.'
            )}
          </p>
        </Section>

        {/* 7 · Actions — coach's parallel self-assessment (spec §13) */}
        <Section title="Your own scores">
          <p className="mb-3 text-[12px] text-tlw-warm-gray">
            Score the session yourself. Your scores sit alongside the engine&apos;s — they never change it —
            so the two can be reconciled.
          </p>
          {!open ? (
            <button
              onClick={() => setOpen(true)}
              className="rounded-tlw-md bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity duration-tlw-base hover:opacity-90"
            >
              {Object.keys(selfScores).length > 0 ? 'edit my scores' : 'add my own scores'}
            </button>
          ) : (
            <div className="space-y-3">
              {COMPETENCIES.map((c) => {
                const machine = report.competencies.find((x) => x.id === c.id)?.score
                const mine = selfScores[String(c.id)]
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-3">
                    <div className="w-44 shrink-0 text-[13px] text-tlw-espresso">
                      <span className="text-tlw-warm-gray">{c.id}.</span> {c.name}
                    </div>
                    <span className="text-[11px] text-tlw-warm-gray">engine {machine ?? '—'}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setSelfScores((p) => ({ ...p, [c.id]: n }))}
                          className="h-7 w-7 rounded-tlw-sm text-[12px] font-medium transition-colors duration-tlw-base"
                          style={
                            mine === n
                              ? { backgroundColor: 'var(--tlw-navy-rich)', color: 'var(--tlw-cream)' }
                              : { backgroundColor: 'var(--color-surface)', color: 'var(--tlw-espresso)' }
                          }
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="your reflections on the scores (optional)"
                className="mt-2 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface p-3 text-[13px] text-tlw-espresso"
                rows={3}
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-tlw-md bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity duration-tlw-base hover:opacity-90 disabled:opacity-40"
                >
                  {saving ? 'saving…' : 'save my scores'}
                </button>
                <button onClick={() => setOpen(false)} className="text-[12px] text-tlw-warm-gray hover:text-tlw-espresso">
                  done
                </button>
              </div>
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
