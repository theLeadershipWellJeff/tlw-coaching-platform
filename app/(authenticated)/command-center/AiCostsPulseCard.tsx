'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { OrgCostReport } from '@/lib/ai/costs'

const USD = 1_000_000
const usd = (m: number, d = 2) => `$${(m / USD).toFixed(d)}`

function Stat({ value, label, tone = 'navy' }: { value: string; label: string; tone?: 'navy' | 'orange' | 'red' }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'orange' ? 'text-tlw-signal-orange' : 'text-tlw-navy-deep'
  return (
    <div className="rounded-tlw-lg bg-tlw-canvas px-3 py-2">
      <p className={`text-[18px] font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-tlw-warm-gray">{label}</p>
    </div>
  )
}

/**
 * AI spend at a glance — this month's ledger against the caps. The whole card
 * opens the cockpit (/command-center/ai-costs). Money and counts only.
 */
export function AiCostsPulseCard() {
  const [report, setReport] = useState<OrgCostReport | null | 'error' | 'unavailable'>(null)

  useEffect(() => {
    fetch('/api/admin/ai-costs')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setReport(d.unavailable || !d.report ? 'unavailable' : d.report))
      .catch(() => setReport('error'))
  }, [])

  const r = report && typeof report === 'object' ? report : null
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-tlw-warm-gray">AI costs</h2>
      <Link
        href="/command-center/ai-costs"
        className="block rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5 transition-colors hover:border-tlw-signal-orange/60 hover:bg-tlw-canvas/40"
        title="Open the AI cost cockpit"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-medium text-tlw-navy-deep">This month&apos;s model spend against the caps</p>
            <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
              {r ? `${r.clientCount} client${r.clientCount === 1 ? '' : 's'} used the assistant · ${r.totals.requests} requests` : 'By feature, model, coach, and client — with the invoiced-revenue join'}
            </p>
          </div>
          <span className="shrink-0 text-[13px] font-medium text-tlw-signal-orange">Open →</span>
        </div>
        {report === null ? (
          <div className="mt-4 h-14 animate-pulse rounded-tlw-lg bg-tlw-canvas" />
        ) : report === 'error' ? (
          <p className="mt-3 text-[12px] text-tlw-warm-gray">Cost figures unavailable right now.</p>
        ) : report === 'unavailable' ? (
          <p className="mt-3 text-[12px] text-tlw-warm-gray">The usage ledger is not applied yet (migration 069).</p>
        ) : r ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat value={usd(r.totals.spent)} label="Spent" />
            <Stat value={usd(r.totals.projected)} label="Month-end" />
            <Stat
              value={r.portal.cap != null ? `${r.portal.pct ?? 0}%` : usd(r.portal.spent)}
              label={r.portal.cap != null ? `Portal of ${usd(r.portal.cap, 0)}` : 'Portal'}
              tone={r.portal.state === 'hard' ? 'red' : r.portal.state === 'soft' ? 'orange' : 'navy'}
            />
            <Stat value={usd(r.principals.coach.spent)} label="Coach-side" />
            <Stat value={r.portalChat.cacheReadRatio == null ? '—' : `${Math.round(r.portalChat.cacheReadRatio * 100)}%`} label="Chat cache reads" tone={r.portalChat.cacheReadRatio != null && r.portalChat.cacheReadRatio < 0.6 ? 'orange' : 'navy'} />
          </div>
        ) : null}
      </Link>
    </section>
  )
}
