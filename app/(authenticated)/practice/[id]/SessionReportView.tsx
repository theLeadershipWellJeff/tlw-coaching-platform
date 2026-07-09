'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { COMPETENCIES, DOMAINS } from '@/lib/scoring/rubric'
import type { GrowthAreaAssessment, GrowthAreaBand, SessionReport } from '@/lib/supabase/types'
import type { Band, Metrics, SessionReportJson } from '@/lib/scoring/types'
import { BandChip, BandPill, MetricCard, Section, flagColor } from '../ui'

// ── Growth area assessment cards ─────────────────────────────────────────────

type AssessmentWithArea = GrowthAreaAssessment & {
  coach_growth_areas: { title: string; band_scale: GrowthAreaBand[]; status: string } | null
}

function GrowthBandBar({ bands, activeBand }: { bands: GrowthAreaBand[]; activeBand: number }) {
  return (
    <div className="mt-2 flex items-center gap-1">
      {bands.map((b) => (
        <div
          key={b.band}
          className="flex-1 rounded-full"
          style={{
            height: 6,
            backgroundColor:
              b.band === activeBand ? 'var(--color-info)' : `var(--color-info)20`,
          }}
          title={`Band ${b.band}: ${b.description}`}
        />
      ))}
      <span className="ml-2 text-[11px] font-semibold" style={{ color: 'var(--color-info)' }}>
        {activeBand}/5
      </span>
    </div>
  )
}

function DevelopmentFocusCards({ reportId }: { reportId: string }) {
  const [assessments, setAssessments] = useState<AssessmentWithArea[] | null>(null)

  useEffect(() => {
    fetch(`/api/reports/${reportId}/growth-assessments`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAssessments(d?.assessments ?? []))
      .catch(() => setAssessments([]))
  }, [reportId])

  // Only render when there are observed or not-observed assessments.
  if (!assessments || assessments.length === 0) return null

  return (
    <div className="mt-6">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[2px] text-tlw-warm-gray">
        Your development focus
      </p>
      <div className="space-y-3">
        {assessments.map((a) => {
          const title = a.coach_growth_areas?.title ?? 'Growth area'
          const bands = a.coach_growth_areas?.band_scale ?? []
          return (
            <div
              key={a.id}
              className="rounded-tlw-xl border border-tlw-warm-gray/15 p-5"
              style={{ backgroundColor: 'var(--color-surface)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[14px] font-medium text-tlw-navy-deep">{title}</p>
                {a.observed ? (
                  <span
                    className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: 'var(--color-info)14', color: 'var(--color-info)' }}
                  >
                    observed
                  </span>
                ) : (
                  <span
                    className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: 'var(--color-muted)20', color: 'var(--color-muted)' }}
                  >
                    not observed
                  </span>
                )}
              </div>

              {a.observed && a.band != null && bands.length === 5 && (
                <GrowthBandBar bands={bands} activeBand={a.band} />
              )}
              {a.observed && a.band != null && bands.length === 5 && (
                <p className="mt-1.5 text-[12px] text-tlw-warm-gray">
                  {bands.find((b) => b.band === a.band)?.description}
                </p>
              )}

              {a.observed && a.evidence.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {a.evidence.map((ev, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-[2px] shrink-0 text-[10px] text-tlw-signal-orange">›</span>
                      <p className="text-[12px] leading-relaxed text-tlw-espresso">
                        {ev.timestamp && (
                          <span className="mr-1.5 font-medium text-tlw-warm-gray">{ev.timestamp}</span>
                        )}
                        {ev.quote_or_paraphrase}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {a.observed && a.developmental_note && (
                <p className="mt-3 text-[12px] leading-relaxed" style={{ color: 'var(--color-info)' }}>
                  {a.developmental_note}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Human labels for the spec §10 gate ceilings, shown on a capped competency. */
const GATE_LABELS: Record<string, string> = {
  gate_1: 'gate 1 · no agreement on file & no recording consent — capped at developing',
  gate_2: 'gate 2 · no named insight at close — capped at developing',
  gate_3: 'gate 3 · zero feeling explorations — capped at proficient',
  // v0.5.2 C1 ceiling: verbal consent passes the gate, but the on-file consent
  // infrastructure (signed agreement + recorded authorization) isn't confirmed.
  c1_ceiling: 'consent infrastructure not confirmed on file — capped below strong (v0.5.2)',
  // v0.5.3 session-1 contracting cap: a confirmed first session with no
  // substantial engagement contracting (and no client waiver observed).
  c3_contracting_cap: 'session 1 · no substantial engagement contracting — capped below strong (v0.5.3)',
}

/** Titles + fix-it guidance for the v0.5.2 Layer-0 manual-review flags. */
const REVIEW_FLAG_GUIDE: Record<string, { title: string; fix: string }> = {
  speaker_reassignment_unconfirmed: {
    title: 'Speaker attribution needs confirmation',
    fix: 'The engine folded a phantom/minority speaker label into the main speakers (listed below). Check the transcript at the marked turns — if the merge reads correctly, mark it reviewed (this confirms the reassignment). If it looks wrong, fix the transcript and use the rescore button above.',
  },
  evidence_verbatim_failed: {
    title: 'A quoted evidence line isn’t an exact transcript match',
    fix: 'One or more quotes in the evidence below may be paraphrased rather than verbatim. Skim the competency evidence against the transcript — if the substance holds, mark it reviewed. If the evidence looks invented, rescore.',
  },
  low_attribution_confidence: {
    title: 'Speaker roles mapped with low confidence',
    fix: 'The engine wasn’t sure who is coach and who is client, which affects talk-time and the question:statement ratio. Check the transcript opening — if the roles are right, mark it reviewed. If they’re swapped, fix the transcript and rescore.',
  },
  likely_speaker_swap: {
    title: 'Coach/client roles may be swapped',
    fix: 'One speaker holds the coaching frame but also most of the talk-time — a sign the labels may be reversed. Check the transcript; if the roles are actually correct, mark it reviewed. If they’re swapped, fix the transcript and rescore.',
  },
  recording_consent_needs_confirmation: {
    title: 'Recording consent needs confirmation',
    fix: 'The client record shows an agreement on file but recording marked declined. Open the client record (edit → Agreement & recording) and confirm their actual choice — then rescore so the score picks it up. If “declined” is correct, mark it reviewed.',
  },
  session_number_uncertain: {
    title: 'Session number uncertain — session-1 contracting cap withheld',
    fix: 'This may be the client’s first session, and no substantial engagement contracting was observed — but the position in the engagement is a derivation, not a confirmed fact, so the v0.5.3 session-1 cap on Competency 3 was NOT applied (a guess never moves a score). If this really was session 1, note it and rescore with the session number in the transcript front matter; otherwise mark it reviewed.',
  },
  contracting_classification_unclear: {
    title: 'Contracting vs. session housekeeping unclear',
    fix: 'The engine couldn’t cleanly split engagement-level contracting (what coaching is, confidentiality, roles, fees) from ordinary within-session logistics somewhere in this transcript. Skim the opening — if the contracting read below looks right, mark it reviewed; if not, rescore.',
  },
}

/** Interactive manual-review panel — each Layer-0 flag can be reviewed and
    resolved in place. Resolutions persist in report.integrity.resolutions and
    reset on a rescore (new machine output needs a fresh review). */
function ManualReviewPanel({
  report,
  reportId,
  clientId,
  onUpdated,
}: {
  report: SessionReportJson
  reportId: string
  clientId: string | null
  onUpdated: (row: SessionReport) => void
}) {
  const integrity = report.integrity
  const flags = integrity?.flags_for_manual_review ?? []
  const resolutions = integrity?.resolutions ?? {}
  const unresolved = flags.filter((f) => !resolutions[f])
  const allResolved = flags.length > 0 && unresolved.length === 0
  const [collapsed, setCollapsed] = useState(allResolved)
  const [busy, setBusy] = useState<string | null>(null)
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [err, setErr] = useState('')

  if (!integrity || flags.length === 0) return null

  async function apply(flag: string, note: string, undo = false) {
    setBusy(flag)
    setErr('')
    try {
      const res = await fetch(`/api/reports/${reportId}/resolve-flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag, note: note || undefined, undo }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        onUpdated(data.report)
        setNoteFor(null)
        setNoteText('')
      } else {
        setErr(data.error || 'Could not update the flag.')
      }
    } catch {
      setErr('Network error while updating the flag.')
    } finally {
      setBusy(null)
    }
  }

  const tone = allResolved ? 'var(--color-success)' : 'var(--color-warning)'
  const attrib = report.metrics?.attribution

  return (
    <div className="mt-4 rounded-tlw-lg border p-4" style={{ borderColor: tone, backgroundColor: `${tone}10` }}>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between text-left"
      >
        <p className="text-[12px] font-semibold uppercase tracking-[1.5px]" style={{ color: tone }}>
          {allResolved
            ? `✓ Manual review complete · ${flags.length} flag${flags.length > 1 ? 's' : ''} reviewed`
            : `⚑ Flagged for manual review · ${unresolved.length} of ${flags.length} open`}
        </p>
        <span className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
          {collapsed ? '▼ show' : '▲ hide'}
        </span>
      </button>

      {!collapsed && (
        <div className="mt-3 space-y-3">
          {flags.map((f) => {
            const guide = REVIEW_FLAG_GUIDE[f] ?? { title: f, fix: 'Review this flag against the transcript, then mark it reviewed.' }
            const res = resolutions[f]
            const isAttributionFlag = f === 'low_attribution_confidence' || f === 'likely_speaker_swap'
            return (
              <div key={f} className="rounded-tlw-md p-3" style={{ backgroundColor: 'var(--color-surface)' }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[13px] font-medium text-tlw-espresso">
                    {res ? <span style={{ color: 'var(--color-success)' }}>✓ </span> : '· '}
                    {guide.title}
                  </p>
                  {res ? (
                    <button
                      onClick={() => apply(f, '', true)}
                      disabled={busy === f}
                      className="text-[11px] text-tlw-warm-gray underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      {busy === f ? 'reopening…' : 'reopen'}
                    </button>
                  ) : (
                    <div className="flex shrink-0 items-center gap-2">
                      {noteFor !== f && (
                        <button
                          onClick={() => { setNoteFor(f); setNoteText('') }}
                          className="text-[11px] text-tlw-warm-gray underline-offset-2 hover:underline"
                        >
                          + note
                        </button>
                      )}
                      <button
                        onClick={() => apply(f, noteFor === f ? noteText.trim() : '')}
                        disabled={busy === f}
                        className="rounded-tlw-md px-3 py-1 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: 'var(--tlw-navy-rich, #1a1f5e)' }}
                      >
                        {busy === f ? 'saving…' : 'Mark reviewed'}
                      </button>
                    </div>
                  )}
                </div>

                {res ? (
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                    reviewed by {res.resolved_by} · {new Date(res.resolved_at).toLocaleString()}
                    {res.note ? <> · “{res.note}”</> : null}
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-[12px] leading-relaxed text-tlw-espresso">{guide.fix}</p>

                    {f === 'speaker_reassignment_unconfirmed' && integrity.speaker_reassignments.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {integrity.speaker_reassignments.map((r, i) => (
                          <li key={i} className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                            {r.from} → {r.to}
                            {r.turns.length ? ` · turns: ${r.turns.join(', ')}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}

                    {isAttributionFlag && attrib && (
                      <p className="mt-2 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                        attribution: {attrib.method} via {attrib.source} · confidence {attrib.confidence}
                      </p>
                    )}

                    {f === 'recording_consent_needs_confirmation' && clientId && (
                      <Link
                        href={`/clients/${clientId}`}
                        className="mt-2 inline-block text-[12px] font-medium text-tlw-signal-orange hover:underline"
                      >
                        Open the client record →
                      </Link>
                    )}

                    {noteFor === f && (
                      <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        rows={2}
                        placeholder="Optional note — what you checked, what you found…"
                        className="mt-2 w-full rounded-tlw-md border border-tlw-warm-gray/25 px-3 py-2 text-[12px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                        style={{ backgroundColor: 'var(--color-bg, #fff)' }}
                      />
                    )}
                  </>
                )}
              </div>
            )
          })}
          {err && <p className="text-[12px]" style={{ color: 'var(--color-danger)' }}>{err}</p>}
        </div>
      )}
    </div>
  )
}

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
  const ce = m.contracting_envelope
  // v0.5.3 dual talk-time: the card shows the coaching-body figure (what the
  // 40% flag evaluates); when a contracting envelope was excluded, the raw
  // figure is surfaced alongside — always visible, never suppressed.
  const talkDual =
    m.coach_talk_time_pct_raw != null &&
    m.coach_talk_time_pct != null &&
    m.coach_talk_time_pct_raw !== m.coach_talk_time_pct
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <MetricCard
          label="coach talk-time"
          value={m.coach_talk_time_pct ?? '—'}
          unit={m.coach_talk_time_pct != null ? '%' : undefined}
          flag={m.coach_talk_time_flag}
          status={
            talkDual
              ? `coaching body · ${m.coach_talk_time_pct_raw}% raw incl. contracting${
                  m.coach_talk_time_flag === 'red' ? ' — over 40%' : ''
                }`
              : m.coach_talk_time_flag === 'red'
              ? 'over 40% — telling too much'
              : 'within range'
          }
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
          status={
            m.feeling_explorations === 0
              ? 'zero — gate 3 caps competency 6 at 3'
              : m.feeling_explorations === 1
              ? 'at the minimum of 1'
              : 'staying with feeling'
          }
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
                <p className="text-[13px] text-tlw-espresso">
                  {mv.description}
                  {mv.span && <span className="ml-2 text-[11px] text-tlw-warm-gray">· {mv.span}</span>}
                </p>
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

      {ce?.active && (
        <div className="mt-4 space-y-2">
          <p className="text-[12px] text-tlw-warm-gray">
            contracting — engagement QA, sessions 1–2 (v0.5.3){' '}
            <span style={{ color: ce.present ? 'var(--color-success)' : 'var(--color-danger)' }}>
              · {ce.present ? 'present' : 'absent'}
            </span>
            {ce.present && ce.quality && (
              <span style={{ color: ce.quality === 'partnered' ? 'var(--color-success)' : 'var(--color-warning, #b45309)' }}>
                {' '}· {ce.quality === 'partnered' ? 'partnered' : 'one-directional'}
              </span>
            )}
          </p>
          <div className="rounded-tlw-lg p-3" style={{ backgroundColor: 'var(--color-surface)' }}>
            <p className="text-[12px] leading-relaxed text-tlw-espresso">
              {ce.present
                ? ce.substantial
                  ? 'Engagement contracting present and substantial — excluded from talk-time, question:statement, and the consultant-move count so onboarding behavior isn’t scored as drift.'
                  : 'Some engagement contracting observed, but not substantial (coaching scope, confidentiality, or agreement-setting).'
                : ce.client_waiver_detected
                ? 'No engagement contracting — but the transcript shows the client already understood the coaching relationship or waived it, so no cap applies.'
                : 'No engagement contracting observed in this session.'}
            </p>
            {ce.envelopes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {ce.envelopes.map((env, i) => (
                  <li key={i} className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                    {env.opened_at && env.closed_at ? `${env.opened_at}–${env.closed_at}` : `envelope ${i + 1}`}
                    {env.covers.length > 0 && <> · covers {env.covers.map((c) => c.replace(/_/g, ' ')).join(', ')}</>}
                    {env.subcompetency_refs.length > 0 && <> · {env.subcompetency_refs.join(', ')}</>}
                    {' '}· {env.quality === 'partnered' ? 'partnered' : 'one-directional'}
                  </li>
                ))}
              </ul>
            )}
          </div>
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
  const [clientName, setClientName] = useState<string | null>(null)
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

  // email-this-report state
  const [emailRecipient, setEmailRecipient] = useState<'self' | 'supervisor' | 'other'>('self')
  const [emailOther, setEmailOther] = useState('')
  const [emailing, setEmailing] = useState(false)
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [supervisorEmail, setSupervisorEmail] = useState<string | null>(null)

  // rescore state
  const [rescoring, setRescoring] = useState(false)
  const [rescoreElapsed, setRescoreElapsed] = useState(0)
  const [rescoreMsg, setRescoreMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [emailElapsed, setEmailElapsed] = useState(0)

  useEffect(() => {
    fetch('/api/coach')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSupervisorEmail(d?.coach?.supervisor_email ?? null))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!rescoring) { setRescoreElapsed(0); return }
    const t = setInterval(() => setRescoreElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [rescoring])

  useEffect(() => {
    if (!emailing) { setEmailElapsed(0); return }
    const t = setInterval(() => setEmailElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [emailing])

  async function emailReport() {
    setEmailing(true)
    setEmailMsg(null)
    try {
      const res = await fetch(`/api/reports/${id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: emailRecipient,
          email: emailRecipient === 'other' ? emailOther : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setEmailMsg({ ok: true, text: `Sent to ${data.to}.` })
      else setEmailMsg({ ok: false, text: data.error || 'Could not send the email.' })
    } catch {
      setEmailMsg({ ok: false, text: 'Network error while sending.' })
    } finally {
      setEmailing(false)
    }
  }

  async function rescore() {
    if (
      !window.confirm(
        'Re-score this session against the current rubric? This replaces the engine’s scores, metrics, and suggested moves. Your own self-scores are kept.'
      )
    )
      return
    setRescoring(true)
    setRescoreMsg(null)
    try {
      const res = await fetch(`/api/reports/${id}/rescore`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        // Clear cached suggested-move panels — they were generated off old scores.
        setMoves({})
        setOpenComp(null)
        await load()
        setRescoreMsg({ ok: true, text: 'Re-scored against the current rubric.' })
      } else {
        setRescoreMsg({ ok: false, text: data.error || 'Could not re-score.' })
      }
    } catch {
      setRescoreMsg({ ok: false, text: 'Network error while re-scoring.' })
    } finally {
      setRescoring(false)
    }
  }

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
    setClientName(data.clientName ?? null)
    setSelfScores(data.report?.coach_self_scores || {})
    setNotes(data.report?.coach_notes || '')
    // Seed any previously-generated suggested moves so they show instantly.
    const saved = data.report?.report?.suggested_moves as Record<string, string> | undefined
    if (saved) {
      setMoves(
        Object.fromEntries(Object.entries(saved).map(([k, text]) => [Number(k), { text }]))
      )
    }
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
          <h1 className="text-2xl font-medium text-tlw-navy-deep">Session report · {clientName || s.client_initials}</h1>
          <p className="mt-1 text-[13px] text-tlw-warm-gray">
            {s.coach}
            {s.type ? ` · ${s.type}` : ''} · {fmtDate(s.date)}
            {s.session_number != null && (
              <> · session {s.session_number}{s.engagement_total != null ? ` of ${s.engagement_total}` : ''}</>
            )}
          </p>
          {s.agreement_gap && (
            <p className="mt-1 text-[12px]" style={{ color: 'var(--color-warning)' }}>
              ⚑ No signed coaching agreement on file — administrative follow-up (not a score penalty).
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <BandPill band={report.band} />
          <button
            onClick={rescore}
            disabled={rescoring}
            title="Re-run the engine against the current rubric"
            className="rounded-tlw-md border border-tlw-warm-gray/30 px-3 py-1.5 text-[12px] font-medium text-tlw-espresso transition-opacity duration-tlw-base hover:opacity-80 disabled:opacity-40"
          >
            {rescoring ? `Analyzing… ${rescoreElapsed}s` : 'rescore'}
          </button>
          {rescoreMsg && (
            <p
              className="max-w-[200px] text-right text-[11px]"
              style={{ color: rescoreMsg.ok ? 'var(--color-success)' : 'var(--color-danger)' }}
            >
              {rescoreMsg.text}
            </p>
          )}
        </div>
      </div>

      {/* Data-integrity manual-review panel (v0.5.2 Layer 0) — fail-loud items
          the engine surfaced for a human to confirm before trusting the score.
          Each flag can be reviewed and resolved in place. Keyed so a resolve
          (which changes resolution state) remounts with fresh collapse state. */}
      <ManualReviewPanel
        key={JSON.stringify(report.integrity?.resolutions ?? {})}
        report={report}
        reportId={id}
        clientId={row?.client_id ?? null}
        onUpdated={(updated) => setRow(updated)}
      />

      {/* Growth area development focus — at the very top, before self-score */}
      <DevelopmentFocusCards reportId={id} />

      {/* Self-score — directly under the title (spec §13) */}
      <div className="mt-5">
        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="rounded-tlw-md border border-tlw-warm-gray/30 px-3 py-1.5 text-[12px] font-medium text-tlw-espresso transition-opacity duration-tlw-base hover:opacity-80"
          >
            {Object.keys(selfScores).length > 0
              ? `edit my scores${row?.coach_overall != null ? ` · yours ${row.coach_overall.toFixed(1)}` : ''}`
              : 'score it yourself'}
          </button>
        ) : (
          <div className="rounded-tlw-lg p-4" style={{ backgroundColor: 'var(--color-surface)' }}>
            <p className="mb-3 text-[12px] text-tlw-warm-gray">
              Score the session yourself. Your scores sit alongside the engine&apos;s — they never change it —
              so the two can be reconciled.
            </p>
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
                              : { backgroundColor: 'var(--color-bg, #fff)', color: 'var(--tlw-espresso)' }
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
                className="mt-2 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-white p-3 text-[13px] text-tlw-espresso"
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
          </div>
        )}
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
                          {c.gates_triggered && c.gates_triggered.length > 0 && (
                            <p className="mt-1.5 text-[11px] font-medium" style={{ color: 'var(--color-danger)' }}>
                              {c.gates_triggered.map((gid) => GATE_LABELS[gid] || gid).join(' · ')}
                            </p>
                          )}
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
              'The overall and per-client trend lines build as more sessions are scored. Add your own scores (under the title) to start the calibration record.'
            )}
          </p>
        </Section>

        {/* 7 · Email this report */}
        <Section title="Email this report">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={emailRecipient}
              onChange={(e) => setEmailRecipient(e.target.value as 'self' | 'supervisor' | 'other')}
              className="rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-2 py-1.5 text-[12px] text-tlw-espresso"
            >
              <option value="self">to me</option>
              {supervisorEmail && <option value="supervisor">to my supervisor</option>}
              <option value="other">someone else…</option>
            </select>
            {emailRecipient === 'other' && (
              <input
                type="email"
                value={emailOther}
                onChange={(e) => setEmailOther(e.target.value)}
                placeholder="email address"
                className="min-w-[200px] flex-1 rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-2.5 py-1.5 text-[12px] text-tlw-espresso"
              />
            )}
            <button
              onClick={emailReport}
              disabled={emailing || (emailRecipient === 'other' && !emailOther.trim())}
              className="rounded-tlw-md bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity duration-tlw-base hover:opacity-90 disabled:opacity-40"
            >
              {emailing ? `Sending… ${emailElapsed}s` : 'send report'}
            </button>
          </div>
          {emailMsg && (
            <p
              className="mt-2 text-[12px]"
              style={{ color: emailMsg.ok ? 'var(--color-success)' : 'var(--color-danger)' }}
            >
              {emailMsg.text}
            </p>
          )}
          <p className="mt-2 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            Sends the scorecard for this session as an email.
            {supervisorEmail
              ? ` Your supervisor is ${supervisorEmail}.`
              : ' Set a supervisor on the Account page to email it to them.'}
          </p>
        </Section>
      </div>
    </div>
  )
}
