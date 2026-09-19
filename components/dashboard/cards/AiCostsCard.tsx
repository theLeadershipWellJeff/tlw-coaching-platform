'use client'
/**
 * Assistant usage card — the coach's OWN clients' portal-assistant spend this
 * month and where each stands against their cap (cost-controls brief, Phase 4
 * coach view). Scoped server-side to the coach's clients; never another
 * coach's, never the coach's own scoring/prep spend.
 *   compact   → total this month + how many clients are paused / on the lighter model
 *   standard  → the top ~5 clients with a cap bar each
 *   expanded  → every client who used the assistant this month
 * Each row links to the client workspace, where the "Assistant usage" block
 * carries the Extend action.
 */
import Link from 'next/link'
import { CARD_META } from '@/lib/dashboard/cards'
import { useAiCostsData, type AiCostsData } from '@/lib/dashboard/useAiCostsData'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'
import type { ClientCostRow } from '@/lib/ai/costs'

const USD = 1_000_000
const usd = (m: number, d = 2) => `$${(m / USD).toFixed(d)}`

const STATE_LABEL: Record<ClientCostRow['cap']['state'], string> = { ok: 'on track', soft: 'lighter model', hard: 'paused', none: 'no cap' }
const STATE_TEXT: Record<ClientCostRow['cap']['state'], string> = { ok: 'text-tlw-warm-gray', soft: 'text-amber-700', hard: 'text-red-700', none: 'text-tlw-warm-gray' }

function Row({ r }: { r: ClientCostRow }) {
  const fill = r.cap.state === 'hard' ? 'bg-red-500' : r.cap.state === 'soft' ? 'bg-amber-500' : 'bg-tlw-navy-deep'
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <Link href={`/clients/${r.clientId}`} className="truncate text-[13px] font-medium text-tlw-navy-deep hover:underline">
          {r.name}
        </Link>
        <span className="shrink-0 text-[12px] tabular-nums text-tlw-espresso">
          {usd(r.spent)}
          {r.cap.cap != null && <span className="text-tlw-warm-gray"> / {usd(r.cap.cap, 0)}</span>}
        </span>
      </div>
      {r.cap.pct != null ? (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-tlw-canvas">
          <div className={`h-full ${fill}`} style={{ width: `${Math.min(100, r.cap.pct)}%` }} />
        </div>
      ) : null}
      <p className={`mt-0.5 text-[11px] ${STATE_TEXT[r.cap.state]}`}>
        {r.cap.pct != null ? `${r.cap.pct}% · ` : ''}
        {STATE_LABEL[r.cap.state]} · {r.requests} message{r.requests === 1 ? '' : 's'}
      </p>
    </li>
  )
}

function AiCosts({ size, data }: { size: CardSize; data: AiCostsData }) {
  if (data.loading) return <div className="h-16 animate-pulse rounded-tlw-lg bg-tlw-canvas" />
  if (data.error) return <p className="text-[12px] text-tlw-warm-gray">Assistant usage unavailable right now.</p>
  if (data.unavailable || !data.report) return <p className="text-[12px] text-tlw-warm-gray">Not tracked yet.</p>
  const { report } = data
  const paused = report.clients.filter((c) => c.cap.state === 'hard').length
  const lighter = report.clients.filter((c) => c.cap.state === 'soft').length
  const attention = paused + lighter

  if (size === 'compact') {
    return (
      <div>
        <p className="text-[30px] font-medium leading-none text-tlw-navy-deep">{usd(report.total)}</p>
        <p className="mt-2 text-[11px] text-tlw-warm-gray">
          this month · {report.clients.length} client{report.clients.length === 1 ? '' : 's'}
          {attention ? <span className={paused ? ' text-red-700' : ' text-amber-700'}>{` · ${paused ? `${paused} paused` : ''}${paused && lighter ? ', ' : ''}${lighter ? `${lighter} on the lighter model` : ''}`}</span> : null}
        </p>
      </div>
    )
  }

  const rows = size === 'expanded' ? report.clients : report.clients.slice(0, 5)
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[22px] font-medium leading-none text-tlw-navy-deep">{usd(report.total)}</p>
        <p className="text-[11px] text-tlw-warm-gray">
          this month{attention ? <span className={paused ? ' text-red-700' : ' text-amber-700'}> · {attention} need{attention === 1 ? 's' : ''} a look</span> : null}
        </p>
      </div>
      {rows.length ? (
        <ul className={`mt-2 divide-y divide-tlw-warm-gray/10 ${size === 'expanded' ? 'max-h-96 overflow-y-auto' : ''}`}>
          {rows.map((r) => (
            <Row key={r.clientId} r={r} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[12px] text-tlw-warm-gray">None of your clients has used the assistant this month.</p>
      )}
      {size === 'standard' && report.clients.length > rows.length && <p className="mt-2 text-[11px] text-tlw-warm-gray">+{report.clients.length - rows.length} more — expand the card to see everyone.</p>}
    </div>
  )
}

export const aiCostsCard: DashboardCard<AiCostsData> = {
  ...CARD_META['ai-costs'],
  useData: useAiCostsData,
  render: ({ size, data }) => <AiCosts size={size} data={data} />,
}
