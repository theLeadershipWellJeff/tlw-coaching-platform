'use client'
/**
 * AI cost cockpit (supervisor-only; cost-controls brief, Phase 4). One month
 * of the org's AI ledger: spend by feature / model / coach / client, % of
 * every cap, the top clients with invoiced revenue beside assistant spend,
 * the cache-read ratio, and a straight-line month-end projection. All data
 * comes from GET /api/admin/ai-costs (requireSupervisor); a regular coach
 * sees the access notice. Money and counts only — never a prompt.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/app/components/layout/PageHeader'
import type { CapView, ClientCostRow, OrgCostReport } from '@/lib/ai/costs'

const USD = 1_000_000
function usd(micros: number | null | undefined, digits = 2): string {
  return micros == null ? '—' : `$${(micros / USD).toFixed(digits)}`
}
function pct(n: number | null | undefined): string {
  return n == null ? '—' : `${n}%`
}
function ratio(r: number | null | undefined): string {
  return r == null ? '—' : `${Math.round(r * 100)}%`
}
function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}
function monthLabel(month: string): string {
  return new Date(`${month}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}
function thisMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

const STATE_STYLES: Record<CapView['state'], string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  soft: 'bg-amber-100 text-amber-800',
  hard: 'bg-red-50 text-red-700',
  none: 'bg-tlw-canvas text-tlw-warm-gray',
}
const STATE_LABEL: Record<CapView['state'], string> = { ok: 'on track', soft: 'lighter model', hard: 'paused', none: 'no cap' }

function CapChip({ cap }: { cap: CapView }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATE_STYLES[cap.state]}`}>{STATE_LABEL[cap.state]}</span>
}

function CapBar({ pctValue, state }: { pctValue: number | null; state: CapView['state'] }) {
  if (pctValue == null) return null
  const color = state === 'hard' ? 'bg-red-500' : state === 'soft' ? 'bg-amber-500' : 'bg-tlw-navy-deep'
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-tlw-canvas">
      <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pctValue)}%` }} />
    </div>
  )
}

function Stat({ value, label, sub, tone = 'navy' }: { value: string; label: string; sub?: string; tone?: 'navy' | 'orange' | 'red' }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'orange' ? 'text-tlw-signal-orange' : 'text-tlw-navy-deep'
  return (
    <div className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface px-4 py-3">
      <p className={`text-[20px] font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wider text-tlw-warm-gray">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-tlw-warm-gray">{sub}</p>}
    </div>
  )
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-wider text-tlw-warm-gray">{title}</h2>
      {sub && <p className="mb-3 text-[12px] text-tlw-warm-gray">{sub}</p>}
      <div className={`overflow-x-auto rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface ${sub ? '' : 'mt-3'}`}>{children}</div>
    </section>
  )
}

const th = 'px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-tlw-warm-gray'
const td = 'px-4 py-2 text-[13px] text-tlw-espresso'
const num = `${td} text-right tabular-nums`

function ClientsTable({ rows, showType }: { rows: ClientCostRow[]; showType: boolean }) {
  if (!rows.length) return <p className="px-4 py-3 text-[13px] text-tlw-warm-gray">No portal-assistant use this month.</p>
  return (
    <table className="w-full">
      <thead className="border-b border-tlw-warm-gray/15">
        <tr>
          <th className={th}>Client</th>
          <th className={`${th} text-right`}>Spend</th>
          <th className={`${th} text-right`}>Cap</th>
          <th className={th}>Status</th>
          <th className={`${th} text-right`}>Requests</th>
          <th className={`${th} text-right`}>Cache reads</th>
          <th className={`${th} text-right`}>Invoiced</th>
          <th className={`${th} text-right`}>Spend ÷ revenue</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.clientId} className="border-b border-tlw-warm-gray/10 last:border-0">
            <td className={td}>
              <Link href={`/clients/${r.clientId}`} className="font-medium text-tlw-navy-deep hover:underline">
                {r.name}
              </Link>
              {showType && r.clientType && r.clientType !== 'client' && <span className="ml-2 text-[11px] text-tlw-warm-gray">{r.clientType}</span>}
              <div className="mt-1 w-40">
                <CapBar pctValue={r.cap.pct} state={r.cap.state} />
              </div>
            </td>
            <td className={num}>{usd(r.spent)}</td>
            <td className={num}>{r.cap.cap != null ? `${usd(r.cap.cap, 0)} · ${pct(r.cap.pct)}` : '—'}</td>
            <td className={td}>
              <CapChip cap={r.cap} />
            </td>
            <td className={num}>{r.requests}{r.released ? <span className="ml-1 text-[11px] text-red-700" title="failed calls (released, not charged)">({r.released} failed)</span> : null}</td>
            <td className={num}>{ratio(r.cacheReadRatio)}</td>
            <td className={num}>{r.revenue != null ? usd(r.revenue, 0) : '—'}</td>
            <td className={num}>{r.spendPctOfRevenue != null ? `${r.spendPctOfRevenue}%` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function AiCostsCockpit() {
  const [month, setMonth] = useState(thisMonth())
  const [report, setReport] = useState<OrgCostReport | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'unavailable' | 'denied' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    setState('loading')
    fetch(`/api/admin/ai-costs?month=${month.slice(0, 7)}`)
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) throw new Error('denied')
        if (!r.ok) throw new Error('error')
        return r.json()
      })
      .then((d) => {
        if (cancelled) return
        if (d.unavailable || !d.report) {
          setReport(null)
          setState('unavailable')
        } else {
          setReport(d.report as OrgCostReport)
          setState('ok')
        }
      })
      .catch((e) => {
        if (cancelled) return
        setState(String(e?.message) === 'denied' ? 'denied' : 'error')
      })
    return () => {
      cancelled = true
    }
  }, [month])

  const isFuture = month > thisMonth()

  return (
    <>
      <PageHeader
        backHref="/command-center"
        backLabel="Command Center"
        title="AI costs"
        subtitle="What the assistant, scoring, and every other model call cost this month — against the caps"
        actions={
          <div className="flex items-center gap-1">
            <button onClick={() => setMonth((m) => shiftMonth(m, -1))} className="rounded-tlw-lg border border-tlw-warm-gray/30 px-2.5 py-1.5 text-[13px] text-tlw-espresso hover:bg-tlw-canvas" aria-label="Previous month">
              ←
            </button>
            <span className="min-w-[150px] text-center text-[13px] font-medium text-tlw-navy-deep">{monthLabel(month)}</span>
            <button onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={isFuture || month === thisMonth()} className="rounded-tlw-lg border border-tlw-warm-gray/30 px-2.5 py-1.5 text-[13px] text-tlw-espresso hover:bg-tlw-canvas disabled:opacity-40" aria-label="Next month">
              →
            </button>
          </div>
        }
      />

      {state === 'denied' && <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6 text-[14px] text-tlw-espresso">Supervisor access required.</div>}
      {state === 'error' && <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6 text-[14px] text-tlw-espresso">The cost report could not be loaded. Try again in a moment.</div>}
      {state === 'unavailable' && (
        <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6 text-[14px] text-tlw-espresso">The AI usage ledger is not available yet — apply migration 069 and every model call will be recorded here.</div>
      )}
      {state === 'loading' && <div className="h-32 animate-pulse rounded-tlw-2xl bg-tlw-surface/70" />}

      {state === 'ok' && report && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat value={usd(report.totals.spent)} label="Spent" sub={report.period.isCurrent ? `day ${report.period.elapsedDays} of ${report.period.days}` : `${report.period.days}-day month`} />
            <Stat value={usd(report.totals.projected)} label="Month-end" sub="straight-line from spend so far" />
            <Stat
              value={report.portal.cap != null ? `${pct(report.portal.pct)}` : usd(report.portal.spent)}
              label="Portal vs ceiling"
              sub={report.portal.cap != null ? `${usd(report.portal.spent)} of ${usd(report.portal.cap, 0)} · ${STATE_LABEL[report.portal.state]}` : 'no org cap enabled'}
              tone={report.portal.state === 'hard' ? 'red' : report.portal.state === 'soft' ? 'orange' : 'navy'}
            />
            <Stat value={usd(report.principals.coach.spent)} label="Coach-side" sub="scoring, prep, nudges, plans" />
            <Stat value={String(report.totals.requests)} label="Requests" sub={report.totals.released ? `${report.totals.released} failed · ${report.totals.reserved} open` : `${report.totals.settled} settled`} tone={report.totals.released ? 'orange' : 'navy'} />
            <Stat
              value={ratio(report.portalChat.cacheReadRatio)}
              label="Chat cache reads"
              sub={report.portalChat.cacheReadRatio == null ? 'no chat traffic yet' : report.portalChat.cacheReadRatio >= 0.6 ? 'target > 60% met' : 'target > 60% after warm-up'}
              tone={report.portalChat.cacheReadRatio != null && report.portalChat.cacheReadRatio < 0.6 ? 'orange' : 'navy'}
            />
          </div>

          <Section title="Top clients by assistant spend" sub={`${report.clientCount} client${report.clientCount === 1 ? '' : 's'} used the assistant this month. Spend is client-principal only (portal chat, weekly plan, uploads); "Invoiced" is issued-invoice income this month attributed to the client through billing.`}>
            <ClientsTable rows={report.topClients} showType />
          </Section>

          <div className="grid gap-8 lg:grid-cols-2">
            <Section title="By feature" sub="Purpose = the routing key in lib/ai/models.ts. A feature cap shows when one is enabled.">
              <table className="w-full">
                <thead className="border-b border-tlw-warm-gray/15">
                  <tr>
                    <th className={th}>Feature</th>
                    <th className={`${th} text-right`}>Spend</th>
                    <th className={`${th} text-right`}>Requests</th>
                    <th className={`${th} text-right`}>Cap</th>
                    <th className={`${th} text-right`}>Cache reads</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byPurpose.map((b) => (
                    <tr key={b.key} className="border-b border-tlw-warm-gray/10 last:border-0">
                      <td className={td}>
                        <span className="font-medium text-tlw-navy-deep">{b.key}</span>
                        {b.cap.cap != null && (
                          <div className="mt-1 w-32">
                            <CapBar pctValue={b.cap.pct} state={b.cap.state} />
                          </div>
                        )}
                      </td>
                      <td className={num}>{usd(b.spent)}</td>
                      <td className={num}>{b.requests}{b.released ? <span className="ml-1 text-[11px] text-red-700">({b.released} failed)</span> : null}</td>
                      <td className={num}>{b.cap.cap != null ? `${usd(b.cap.cap, 0)} · ${pct(b.cap.pct)}` : '—'}</td>
                      <td className={num}>{ratio(b.cacheReadRatio)}</td>
                    </tr>
                  ))}
                  {!report.byPurpose.length && (
                    <tr>
                      <td className={td} colSpan={5}>
                        No model calls this month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Section>

            <Section title="By model" sub="Tokens are the settled totals from the API's own usage counts.">
              <table className="w-full">
                <thead className="border-b border-tlw-warm-gray/15">
                  <tr>
                    <th className={th}>Model</th>
                    <th className={`${th} text-right`}>Spend</th>
                    <th className={`${th} text-right`}>Requests</th>
                    <th className={`${th} text-right`}>Input</th>
                    <th className={`${th} text-right`}>Output</th>
                    <th className={`${th} text-right`}>Cache read / write</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byModel.map((b) => (
                    <tr key={b.key} className="border-b border-tlw-warm-gray/10 last:border-0">
                      <td className={`${td} font-medium text-tlw-navy-deep`}>{b.key}</td>
                      <td className={num}>{usd(b.spent)}</td>
                      <td className={num}>{b.requests}</td>
                      <td className={num}>{tokens(b.input)}</td>
                      <td className={num}>{tokens(b.output)}</td>
                      <td className={num}>
                        {tokens(b.cacheRead)} / {tokens(b.cacheWrite)}
                      </td>
                    </tr>
                  ))}
                  {!report.byModel.length && (
                    <tr>
                      <td className={td} colSpan={6}>
                        No model calls this month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Section>
          </div>

          <Section title="By coach" sub="Every call attributed to a coach — their own features plus their clients' portal use.">
            <table className="w-full">
              <thead className="border-b border-tlw-warm-gray/15">
                <tr>
                  <th className={th}>Coach</th>
                  <th className={`${th} text-right`}>Spend</th>
                  <th className={`${th} text-right`}>Requests</th>
                  <th className={`${th} text-right`}>Last call</th>
                </tr>
              </thead>
              <tbody>
                {report.byCoach.map((b) => (
                  <tr key={b.coachId} className="border-b border-tlw-warm-gray/10 last:border-0">
                    <td className={`${td} font-medium text-tlw-navy-deep`}>{b.name}</td>
                    <td className={num}>{usd(b.spent)}</td>
                    <td className={num}>{b.requests}</td>
                    <td className={num}>{b.lastAt ? new Date(b.lastAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                  </tr>
                ))}
                {!report.byCoach.length && (
                  <tr>
                    <td className={td} colSpan={4}>
                      No model calls this month.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          <p className="text-[12px] text-tlw-warm-gray">
            Reconcile against the Anthropic Console invoice with <code className="rounded bg-tlw-canvas px-1">node scripts/reconcile-ai-costs.js --month {month.slice(0, 7)} --invoice &lt;usd&gt;</code> (±5% is the brief&apos;s tolerance). Prices are data in <code className="rounded bg-tlw-canvas px-1">ai_model_prices</code>; update them there when Anthropic&apos;s list changes.
          </p>
        </div>
      )}
    </>
  )
}
