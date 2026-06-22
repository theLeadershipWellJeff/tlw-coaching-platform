'use client'
import Link from 'next/link'
import type { Client } from '@/lib/supabase/types'
import type { CardSize } from '@/lib/dashboard/types'
import { ymdInTimeZone } from '@/lib/datetime'

export interface UpcomingSession {
  id: string
  title: string
  start: string
  end?: string
  clientName: string
  clientEmail: string
  duration: number
  meetLink?: string
}

function prepHref(s: UpcomingSession): string {
  const qs = new URLSearchParams({
    clientName: s.clientName,
    clientEmail: s.clientEmail,
    start: s.start || '',
    duration: String(s.duration),
  })
  return `/session/${s.id}?${qs.toString()}`
}

// All labels render in the coach's timezone (passed down from the profile) so a
// session reads the same regardless of which device's clock is showing it.
function dayLabel(iso: string, timeZone: string): string {
  const d = new Date(iso)
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const ymd = ymdInTimeZone(d, timeZone)
  if (ymd === ymdInTimeZone(now, timeZone)) return 'Today'
  if (ymd === ymdInTimeZone(tomorrow, timeZone)) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone })
}

function timeLabel(iso: string, timeZone: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
}

function groupByDay(
  sessions: UpcomingSession[],
  timeZone: string
): { label: string; items: UpcomingSession[] }[] {
  const groups: { label: string; items: UpcomingSession[] }[] = []
  for (const s of sessions) {
    const label = dayLabel(s.start, timeZone)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(s)
    else groups.push({ label, items: [s] })
  }
  return groups
}

/**
 * Match a calendar session back to a roster client so each card can link into
 * the workspace. Email first (exact), then full name — the same email-first
 * rule the rest of the app uses.
 */
function resolveClientId(s: UpcomingSession, byEmail: Map<string, string>, byName: Map<string, string>): string | null {
  const email = (s.clientEmail || '').trim().toLowerCase()
  if (email && byEmail.has(email)) return byEmail.get(email)!
  const name = (s.clientName || '').trim().toLowerCase()
  if (name && byName.has(name)) return byName.get(name)!
  return null
}

/**
 * The "Up next" column: upcoming calendar sessions with the existing
 * generate-prep flow, plus a button into the client's workspace when the
 * session resolves to a roster client.
 */
export function UpNextPanel({
  sessions,
  clients,
  loading,
  error,
  onRefresh,
  onSkip,
  timeZone,
  size = 'expanded',
}: {
  sessions: UpcomingSession[]
  clients: Client[]
  loading: boolean
  error: boolean
  onRefresh: () => void
  onSkip: (id: string) => void
  timeZone: string
  size?: CardSize
}) {
  const byEmail = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const c of clients) {
    if (c.email) byEmail.set(c.email.trim().toLowerCase(), c.id)
    if (c.name) byName.set(c.name.trim().toLowerCase(), c.id)
  }

  if (loading) {
    return (
      <section className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface/60" />
        ))}
      </section>
    )
  }

  if (error) {
    return (
      <section className="rounded-tlw-xl border border-tlw-warm-gray/20 bg-tlw-surface p-8 text-center">
        <p className="text-[13px] text-tlw-espresso">Couldn&apos;t load your calendar.</p>
        <button onClick={onRefresh} className="mt-3 text-[13px] font-medium text-tlw-signal-orange hover:underline">
          Try again
        </button>
      </section>
    )
  }

  if (sessions.length === 0) {
    return (
      <section className="flex min-h-[220px] flex-col items-center justify-center rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-8 text-center">
        <h2 className="mb-1 text-base font-medium text-tlw-navy-deep">No sessions in the next 7 days</h2>
        <p className="mb-4 max-w-sm text-[13px] text-tlw-warm-gray">
          Coaching sessions on your calendar will show up here automatically.
        </p>
        <Link href="/session/manual" className="text-[13px] font-medium text-tlw-signal-orange hover:underline">
          Prep a session manually
        </Link>
      </section>
    )
  }

  // Small + medium: a compact, scrollable list (small ≈ next 2, medium ≈ next 5);
  // large keeps the rich hero + grouped view below.
  if (size === 'compact' || size === 'standard') {
    const listMax = size === 'compact' ? 'max-h-[9rem]' : 'max-h-[22rem]'
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Up next</p>
          <button
            onClick={onRefresh}
            className="text-[12px] font-medium text-tlw-warm-gray transition-colors hover:text-tlw-espresso"
          >
            Refresh
          </button>
        </div>
        <div className={`space-y-2 overflow-y-auto pr-1 ${listMax}`}>
          {sessions.map((s) => {
            const clientId = resolveClientId(s, byEmail, byName)
            return (
              <div key={s.id} className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-tlw-navy-deep">{s.clientName}</p>
                    <p className="mt-0.5 truncate text-[12px] text-tlw-warm-gray">
                      {dayLabel(s.start, timeZone)} · {timeLabel(s.start, timeZone)} · {s.duration} min
                    </p>
                  </div>
                  <button
                    onClick={() => onSkip(s.id)}
                    title="Skip"
                    aria-label={`Skip ${s.clientName}`}
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-[13px] leading-none text-tlw-warm-gray transition-colors hover:bg-tlw-warm-gray/15 hover:text-tlw-espresso"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <Link href={prepHref(s)} className="text-[12px] font-medium text-tlw-signal-orange hover:underline">
                    Generate prep →
                  </Link>
                  {clientId && (
                    <Link
                      href={`/clients/${clientId}`}
                      className="text-[12px] font-medium text-tlw-warm-gray transition-colors hover:text-tlw-espresso"
                    >
                      Workspace
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const [upNext, ...rest] = sessions
  const groups = groupByDay(rest, timeZone)
  const upNextClientId = resolveClientId(upNext, byEmail, byName)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Up next</p>
        <button
          onClick={onRefresh}
          className="text-[12px] font-medium text-tlw-warm-gray transition-colors duration-tlw-base hover:text-tlw-espresso"
        >
          Refresh
        </button>
      </div>

      <section>
        <div className="rounded-tlw-2xl bg-tlw-navy-rich p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-tlw-cream">{upNext.clientName}</p>
              {upNext.clientEmail && (
                <p className="mt-0.5 truncate text-[12px] text-tlw-warm-gray">{upNext.clientEmail}</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[13px] font-medium text-tlw-cream">{dayLabel(upNext.start, timeZone)}</p>
              <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
                {timeLabel(upNext.start, timeZone)} · {upNext.duration} min
              </p>
            </div>
          </div>
          {upNext.title && <p className="mt-4 truncate text-[12px] text-tlw-warm-gray">{upNext.title}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link
              href={prepHref(upNext)}
              className="rounded-tlw-lg bg-tlw-cream px-4 py-2 text-[12px] font-semibold text-tlw-navy-deep transition-opacity hover:opacity-90"
            >
              Generate prep →
            </Link>
            {upNextClientId && (
              <Link
                href={`/clients/${upNextClientId}`}
                className="rounded-tlw-lg border border-tlw-cream/30 px-4 py-2 text-[12px] font-medium text-tlw-cream transition-colors hover:border-tlw-cream/60"
              >
                Open workspace →
              </Link>
            )}
            <button
              onClick={() => onSkip(upNext.id)}
              className="ml-auto rounded-tlw-lg px-3 py-2 text-[12px] font-medium text-tlw-warm-gray transition-colors hover:text-tlw-cream"
            >
              Skip
            </button>
          </div>
        </div>
      </section>

      {groups.length > 0 && (
        <section className="space-y-6">
          <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Later this week</p>
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 text-[13px] font-medium text-tlw-espresso">{group.label}</p>
              <div className="space-y-2">
                {group.items.map((s) => {
                  const clientId = resolveClientId(s, byEmail, byName)
                  return (
                    <div
                      key={s.id}
                      className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-4 transition-colors duration-tlw-base hover:border-tlw-warm-gray/30"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-tlw-navy-deep">{s.clientName}</p>
                          <p className="mt-0.5 truncate text-[12px] text-tlw-warm-gray">{s.title}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[13px] text-tlw-espresso">{timeLabel(s.start, timeZone)}</p>
                          <p className="text-[12px] text-tlw-warm-gray">{s.duration} min</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-4">
                        <Link
                          href={prepHref(s)}
                          className="text-[12px] font-medium text-tlw-signal-orange hover:underline"
                        >
                          Generate prep →
                        </Link>
                        {clientId && (
                          <Link
                            href={`/clients/${clientId}`}
                            className="text-[12px] font-medium text-tlw-warm-gray transition-colors hover:text-tlw-espresso"
                          >
                            Workspace →
                          </Link>
                        )}
                        <button
                          onClick={() => onSkip(s.id)}
                          className="ml-auto text-[12px] font-medium text-tlw-warm-gray transition-colors hover:text-tlw-espresso"
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
