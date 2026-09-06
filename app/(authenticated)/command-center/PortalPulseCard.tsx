'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Stats = {
  users: number
  byKind: { coaching: number; coaching_zf: number; standalone: number; enterprise: number }
  invited: number
  active: number
  companies: number
  activeCohorts: number
  seatsPurchased: number
  seatsActivated: number
  reportsComplete: number
  reportsHeld: number
  reportsMissing: number
  openTickets: number
  chatMessages7d: number
  activeClients7d: number
  plansSaved7d: number
}

function Stat({ value, label, tone = 'navy' }: { value: string | number; label: string; tone?: 'navy' | 'orange' | 'red' }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'orange' ? 'text-tlw-signal-orange' : 'text-tlw-navy-deep'
  return (
    <div className="rounded-tlw-lg bg-tlw-canvas px-3 py-2">
      <p className={`text-[18px] font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-tlw-warm-gray">{label}</p>
    </div>
  )
}

/**
 * The Client Portal at a glance. One card, entirely clickable, that opens the
 * portal admin (/command-center/portal). Counts come from /api/admin/portal-stats
 * — never a name or a document.
 */
export function PortalPulseCard() {
  const [stats, setStats] = useState<Stats | null | 'error'>(null)

  useEffect(() => {
    fetch('/api/admin/portal-stats')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setStats(d))
      .catch(() => setStats('error'))
  }, [])

  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-tlw-warm-gray">Client Portal</h2>
      <Link
        href="/command-center/portal"
        className="block rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5 transition-colors hover:border-tlw-signal-orange/60 hover:bg-tlw-canvas/40"
        title="Open the Client Portal admin"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-medium text-tlw-navy-deep">Portal users, ZF cohorts, reports, support</p>
            <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
              {stats && stats !== 'error'
                ? `${stats.byKind.coaching + stats.byKind.coaching_zf} coaching · ${stats.byKind.standalone} standalone ZF · ${stats.byKind.enterprise} enterprise`
                : 'Every client in the portal, across all four use cases'}
            </p>
          </div>
          <span className="shrink-0 text-[13px] font-medium text-tlw-signal-orange">Open →</span>
        </div>
        {stats === null ? (
          <div className="mt-4 h-14 animate-pulse rounded-tlw-lg bg-tlw-canvas" />
        ) : stats === 'error' ? (
          <p className="mt-3 text-[12px] text-tlw-warm-gray">Statistics unavailable right now.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Stat value={stats.users} label="Portal users" />
            <Stat value={`${stats.active}/${stats.invited}`} label="Active / invited" />
            <Stat value={stats.activeClients7d} label="Active this week" />
            <Stat value={stats.chatMessages7d} label="Chat msgs · 7d" />
            <Stat value={`${stats.seatsActivated}/${stats.seatsPurchased}`} label={`Seats · ${stats.activeCohorts} cohort${stats.activeCohorts === 1 ? '' : 's'}`} />
            <Stat value={stats.reportsComplete} label="Reports on file" />
            <Stat value={stats.reportsHeld + stats.reportsMissing} label="Reports held / missing" tone={stats.reportsHeld + stats.reportsMissing ? 'orange' : 'navy'} />
            <Stat value={stats.openTickets} label="Open support" tone={stats.openTickets ? 'red' : 'navy'} />
          </div>
        )}
      </Link>
    </section>
  )
}
