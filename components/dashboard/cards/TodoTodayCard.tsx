'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CARD_META } from '@/lib/dashboard/cards'
import { useCoachTimezone } from '@/lib/dashboard/useCoachTimezone'
import type { DashboardCard } from '@/lib/dashboard/types'
import type { UpcomingSession } from '@/app/(authenticated)/dashboard/UpNextPanel'

const NUDGE_TYPE_LABEL: Record<string, string> = {
  action_checkin: 'Action check-in',
  insight: 'Insight',
  framework: 'Framework',
  reengagement: 'Re-engagement',
}

interface TodoNudge {
  id: string
  client_id: string
  client_name: string
  type: string
  last_appointment: string | null
  days_since: number | null
}

interface TodoTranscript {
  id: string
  client_id: string | null
  client_name: string | null
  title: string
  session_date: string | null
  match_status: string
  needs_review: boolean
}

function formatSessionDate(iso: string, timeZone: string) {
  try {
    const d = new Date(iso)
    const today = new Date()
    const diff = Math.round(
      (d.setHours(0, 0, 0, 0) - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
        86400000,
    )
    const time = new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
    if (diff === 0) return `Today ${time}`
    if (diff === 1) return `Tomorrow ${time}`
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone }) + ` ${time}`
  } catch {
    return iso
  }
}

function Chip({ label, color }: { label: string; color: 'navy' | 'orange' | 'amber' }) {
  const cls = {
    navy: 'bg-tlw-navy-rich/10 text-tlw-navy-rich',
    orange: 'bg-tlw-signal-orange/10 text-tlw-signal-orange',
    amber: 'bg-amber-100 text-amber-700',
  }[color]
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>
  )
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="mb-2 flex items-center gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">{title}</p>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-tlw-navy-rich/10 px-2 py-[1px] text-[11px] font-semibold text-tlw-navy-rich">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function EmptySlate({ message }: { message: string }) {
  return (
    <div className="flex min-h-[56px] items-center justify-center rounded-tlw-xl border border-dashed border-tlw-warm-gray/20 bg-tlw-surface/60 px-4 text-[12px] text-tlw-warm-gray">
      {message}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface/60" />
      ))}
    </div>
  )
}

function TodoTodayBody() {
  const timeZone = useCoachTimezone()
  const [nudges, setNudges] = useState<TodoNudge[]>([])
  const [transcripts, setTranscripts] = useState<TodoTranscript[]>([])
  const [preps, setPreps] = useState<UpcomingSession[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [todoRes, sessionsRes] = await Promise.all([
        fetch('/api/dashboard/todo').then((r) => (r.ok ? r.json() : { nudges: [], transcripts: [] })),
        fetch('/api/sessions').then((r) => (r.ok ? r.json() : { sessions: [] })),
      ])
      setNudges(todoRes.nudges || [])
      setTranscripts(todoRes.transcripts || [])

      // Filter calendar sessions to the next 3 days
      const now = Date.now()
      const threeDays = now + 3 * 24 * 60 * 60 * 1000
      const upcoming = ((sessionsRes.sessions || []) as UpcomingSession[]).filter((s) => {
        if (!s.start) return false
        const t = new Date(s.start).getTime()
        return t >= now - 30 * 60 * 1000 && t <= threeDays
      })
      setPreps(upcoming.slice(0, 3))
    } catch {
      // fail silently — card shows empty states
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const hasAnything = nudges.length > 0 || preps.length > 0 || transcripts.length > 0

  return (
    <div>
      {loading ? (
        <Skeleton />
      ) : !hasAnything ? (
        <div className="flex min-h-[120px] flex-col items-center justify-center rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 text-center">
          <p className="text-[13px] text-tlw-warm-gray">You&apos;re all caught up.</p>
          <p className="mt-1 text-[12px] text-tlw-warm-gray">No pending nudges, preps, or transcripts right now.</p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Nudges to review */}
          <Section title="Nudges to review" count={nudges.length}>
            {nudges.length === 0 ? (
              <EmptySlate message="No nudges in the 6-day window" />
            ) : (
              <div className="space-y-2">
                {nudges.map((n) => (
                  <Link
                    key={n.id}
                    href={`/nudges?focus=${n.id}`}
                    className="flex items-center justify-between gap-3 rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-3.5 transition-all duration-tlw-base hover:-translate-y-0.5 hover:border-tlw-warm-gray/30 hover:shadow-md"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-tlw-navy-deep">{n.client_name}</p>
                      <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
                        {n.days_since !== null ? `${n.days_since}d since last session` : 'No recent session'}
                      </p>
                    </div>
                    <Chip label={NUDGE_TYPE_LABEL[n.type] || n.type} color="navy" />
                  </Link>
                ))}
              </div>
            )}
          </Section>

          {/* Session preps */}
          <Section title="Session preps — next 3 days" count={preps.length}>
            {preps.length === 0 ? (
              <EmptySlate message="No sessions in the next 3 days" />
            ) : (
              <div className="space-y-2">
                {preps.map((s) => (
                  <Link
                    key={s.id}
                    href={`/session/${s.id}`}
                    className="flex items-center justify-between gap-3 rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-3.5 transition-all duration-tlw-base hover:-translate-y-0.5 hover:border-tlw-warm-gray/30 hover:shadow-md"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-tlw-navy-deep">
                        {s.clientName || s.title || 'Session'}
                      </p>
                      <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
                        {s.start ? formatSessionDate(s.start, timeZone) : '—'}
                      </p>
                    </div>
                    <Chip label="Prep" color="orange" />
                  </Link>
                ))}
              </div>
            )}
          </Section>

          {/* Transcripts to score */}
          <Section title="Transcripts to score" count={transcripts.length}>
            {transcripts.length === 0 ? (
              <EmptySlate message="No transcripts waiting" />
            ) : (
              <div className="space-y-2">
                {transcripts.map((t) => (
                  <Link
                    key={t.id}
                    href={`/practice?transcript=${t.id}`}
                    className="flex items-center justify-between gap-3 rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-3.5 transition-all duration-tlw-base hover:-translate-y-0.5 hover:border-tlw-warm-gray/30 hover:shadow-md"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-tlw-navy-deep">
                        {t.client_name || 'Unknown client'}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-tlw-warm-gray">{t.title}</p>
                    </div>
                    <Chip
                      label={t.needs_review ? 'Needs review' : 'Score'}
                      color={t.needs_review ? 'amber' : 'navy'}
                    />
                  </Link>
                ))}
              </div>
            )}
          </Section>

        </div>
      )}
    </div>
  )
}

export const todoTodayCard: DashboardCard<null> = {
  ...CARD_META['todo-today'],
  useData: () => null,
  render: () => <TodoTodayBody />,
}
