'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface Session {
  id: string
  title: string
  start: string
  end?: string
  clientName: string
  clientEmail: string
  duration: number
  meetLink?: string
}

function prepHref(s: Session): string {
  const qs = new URLSearchParams({
    clientName: s.clientName,
    clientEmail: s.clientEmail,
    start: s.start || '',
    duration: String(s.duration),
  })
  return `/session/${s.id}?${qs.toString()}`
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function timeLabel(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function groupByDay(sessions: Session[]): { label: string; items: Session[] }[] {
  const groups: { label: string; items: Session[] }[] = []
  for (const s of sessions) {
    const label = dayLabel(s.start)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(s)
    else groups.push({ label, items: [s] })
  }
  return groups
}

export function DashboardSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/sessions')
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      const cutoff = Date.now() + 7 * 24 * 60 * 60 * 1000
      const within7 = (data.sessions || []).filter((s: Session) => {
        if (!s.start) return false
        const t = new Date(s.start).getTime()
        return t >= Date.now() - 60 * 60 * 1000 && t <= cutoff
      })
      setSessions(within7)
    } catch {
      setError(true)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface/60"
          />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-tlw-xl border border-tlw-warm-gray/20 bg-tlw-surface p-8 text-center">
        <p className="text-[13px] text-tlw-espresso">Couldn&apos;t load your calendar.</p>
        <button
          onClick={load}
          className="mt-3 text-[13px] font-medium text-tlw-signal-orange hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-8 text-center">
        <h2 className="mb-1 text-base font-medium text-tlw-navy-deep">No sessions in the next 7 days</h2>
        <p className="mb-4 max-w-sm text-[13px] text-tlw-warm-gray">
          Coaching sessions on your calendar will show up here automatically.
        </p>
        <Link
          href="/session/manual"
          className="text-[13px] font-medium text-tlw-signal-orange hover:underline"
        >
          Prep a session manually
        </Link>
      </div>
    )
  }

  const [upNext, ...rest] = sessions
  const groups = groupByDay(rest)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-tlw-warm-gray">
          {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} over the next 7 days
        </p>
        <button
          onClick={load}
          className="text-[12px] font-medium text-tlw-warm-gray transition-colors duration-tlw-base hover:text-tlw-espresso"
        >
          Refresh
        </button>
      </div>

      <section>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          Up next
        </p>
        <Link
          href={prepHref(upNext)}
          className="group block rounded-tlw-2xl bg-tlw-navy-rich p-6 transition-all duration-tlw-base hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-tlw-cream">{upNext.clientName}</p>
              {upNext.clientEmail && (
                <p className="mt-0.5 truncate text-[12px] text-tlw-warm-gray">{upNext.clientEmail}</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[13px] font-medium text-tlw-cream">{dayLabel(upNext.start)}</p>
              <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
                {timeLabel(upNext.start)} · {upNext.duration} min
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between gap-4">
            <p className="truncate text-[12px] text-tlw-warm-gray">{upNext.title}</p>
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray transition-colors duration-tlw-base group-hover:text-tlw-cream">
              Generate prep →
            </span>
          </div>
        </Link>
      </section>

      {groups.length > 0 && (
        <section className="space-y-6">
          <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
            Later this week
          </p>
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 text-[13px] font-medium text-tlw-espresso">{group.label}</p>
              <div className="space-y-2">
                {group.items.map((s) => (
                  <Link
                    key={s.id}
                    href={prepHref(s)}
                    className="group block rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-4 transition-all duration-tlw-base hover:-translate-y-0.5 hover:border-tlw-warm-gray/30 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-tlw-navy-deep">{s.clientName}</p>
                        <p className="mt-0.5 truncate text-[12px] text-tlw-warm-gray">{s.title}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <div className="text-right">
                          <p className="text-[13px] text-tlw-espresso">{timeLabel(s.start)}</p>
                          <p className="text-[12px] text-tlw-warm-gray">{s.duration} min</p>
                        </div>
                        <span className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray opacity-0 transition-opacity duration-tlw-base group-hover:opacity-100">
                          Prep →
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
