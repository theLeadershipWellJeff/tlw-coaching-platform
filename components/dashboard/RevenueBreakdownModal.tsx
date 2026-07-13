'use client'
/**
 * RevenueBreakdownModal — the click-through view for the three revenue cards
 * (Past / Projected / Annual): a donut pie of the period's total revenue split
 * by client, plus a legend listing each client's sessions, amount, and share.
 *
 * Chart rules followed (dataviz method):
 *  - categorical palette in fixed slot order, validated for CVD separation on
 *    the white surface; clients beyond 8 fold into a gray "Other" slice
 *  - 2px surface gap between slices (stroke in the surface color)
 *  - every slice is labelled in the legend (name · sessions · $ · %) — the
 *    legend doubles as the table view, so identity is never color-alone
 *  - text stays in ink colors; the swatch alone carries the series color
 *  - hover on a slice or legend row highlights it and swaps the donut center
 *    from the period total to that client's figure
 */
import { useMemo, useState } from 'react'
import type { ClientRevenue } from '@/lib/dashboard/useRevenueData'

// Validated categorical palette (scripts/validate_palette.js, surface #FFFFFF:
// worst adjacent CVD ΔE 24.2). Slot order is the safety mechanism — keep it.
const PALETTE = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834']
const OTHER_COLOR = '#8B8680' // tlw-warm-gray — neutral, never a 9th hue
const MAX_SLICES = 8

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function pct(amount: number, total: number): string {
  if (total <= 0) return '—'
  return `${Math.round((amount / total) * 1000) / 10}%`
}

type Slice = ClientRevenue & { color: string }

/** Donut arc path: angles in radians from 12 o'clock, clockwise. */
function arcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number): string {
  const large = end - start > Math.PI ? 1 : 0
  const pt = (r: number, a: number) => `${cx + r * Math.sin(a)} ${cy - r * Math.cos(a)}`
  return [
    `M ${pt(rOuter, start)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${pt(rOuter, end)}`,
    `L ${pt(rInner, end)}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${pt(rInner, start)}`,
    'Z',
  ].join(' ')
}

function Donut({ slices, total, hovered, onHover }: {
  slices: Slice[]
  total: number
  hovered: number | null
  onHover: (i: number | null) => void
}) {
  const SIZE = 220
  const CX = SIZE / 2
  const R_OUT = 100
  const R_IN = 64

  const active = hovered != null ? slices[hovered] : null

  // Build the arcs; zero-amount slices get no geometry (they still appear in
  // the legend).
  let angle = 0
  const arcs = slices.map((s, i) => {
    const sweep = total > 0 ? (s.amount / total) * Math.PI * 2 : 0
    const start = angle
    angle += sweep
    return { s, i, start, end: angle, sweep }
  })

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={`Revenue by client: ${slices.map((s) => `${s.client} ${money(s.amount)}`).join(', ')}`}
      className="shrink-0"
    >
      {arcs.map(({ s, i, start, end, sweep }) => {
        if (sweep <= 0) return null
        const dim = hovered != null && hovered !== i
        // A single slice covering (almost) the full circle can't be one arc path.
        const full = sweep >= Math.PI * 2 - 0.0001
        const shape = full ? (
          <g key={i}>
            <circle cx={CX} cy={CX} r={R_OUT} fill={s.color} />
            <circle cx={CX} cy={CX} r={R_IN} fill="#FFFFFF" />
          </g>
        ) : (
          <path key={i} d={arcPath(CX, CX, R_OUT, R_IN, start, end)} fill={s.color} stroke="#FFFFFF" strokeWidth={2} />
        )
        return (
          <g
            key={i}
            opacity={dim ? 0.35 : 1}
            onMouseEnter={() => onHover(i)}
            onMouseLeave={() => onHover(null)}
            style={{ transition: 'opacity 150ms', cursor: 'default' }}
          >
            <title>{`${s.client} — ${money(s.amount)} (${pct(s.amount, total)})`}</title>
            {shape}
          </g>
        )
      })}
      {/* Center readout — the period total, or the hovered client's figure. */}
      {active ? (
        <>
          <text x={CX} y={CX - 14} textAnchor="middle" fontSize="11" fill="#8B8680">
            {active.client.length > 18 ? `${active.client.slice(0, 17)}…` : active.client}
          </text>
          <text x={CX} y={CX + 6} textAnchor="middle" fontSize="18" fontWeight="600" fill="#111226">
            {money(active.amount)}
          </text>
          <text x={CX} y={CX + 24} textAnchor="middle" fontSize="11" fill="#8B8680">
            {pct(active.amount, total)}
          </text>
        </>
      ) : (
        <>
          <text x={CX} y={CX - 2} textAnchor="middle" fontSize="20" fontWeight="600" fill="#111226">
            {money(total)}
          </text>
          <text x={CX} y={CX + 18} textAnchor="middle" fontSize="11" fill="#8B8680">
            total
          </text>
        </>
      )}
    </svg>
  )
}

export function RevenueBreakdownModal({ title, subtitle, total, items, onClose }: {
  title: string
  subtitle?: string
  total: number
  items: ClientRevenue[]
  onClose: () => void
}) {
  const [hovered, setHovered] = useState<number | null>(null)

  // Top 8 clients get a palette slot; the rest fold into one gray "Other".
  const slices: Slice[] = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.amount - a.amount)
    const top = sorted.slice(0, MAX_SLICES).map((c, i) => ({ ...c, color: PALETTE[i] }))
    const rest = sorted.slice(MAX_SLICES)
    if (rest.length > 0) {
      top.push({
        client: `Other (${rest.length} client${rest.length === 1 ? '' : 's'})`,
        sessions: rest.reduce((s, c) => s + c.sessions, 0),
        amount: rest.reduce((s, c) => s + c.amount, 0),
        color: OTHER_COLOR,
      })
    }
    return top
  }, [items])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tlw-navy-deep/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-tlw-2xl bg-tlw-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-tlw-warm-gray/15 px-5 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">{title}</p>
            {subtitle && <p className="mt-0.5 text-[12px] text-tlw-warm-gray">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-1.5 py-1 text-[14px] leading-none text-tlw-warm-gray transition-colors hover:bg-tlw-warm-gray/15 hover:text-tlw-espresso"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {slices.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-tlw-warm-gray">No sessions in this period.</p>
          ) : total <= 0 ? (
            <p className="py-8 text-center text-[13px] text-tlw-warm-gray">
              Sessions were logged, but none carry a fee — set session fees on the client records to see revenue here.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
              <Donut slices={slices} total={total} hovered={hovered} onHover={setHovered} />
              <ul className="min-w-0 flex-1 space-y-1 self-stretch">
                {slices.map((s, i) => (
                  <li
                    key={i}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    className={`flex items-center gap-2.5 rounded-tlw-lg px-2 py-1.5 transition-colors ${hovered === i ? 'bg-tlw-canvas' : ''}`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: s.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-tlw-espresso">{s.client}</span>
                    <span className="shrink-0 text-[12px] text-tlw-warm-gray">
                      {s.sessions} session{s.sessions === 1 ? '' : 's'}
                    </span>
                    <span className="w-16 shrink-0 text-right text-[13px] font-medium text-tlw-navy-deep">
                      {money(s.amount)}
                    </span>
                    <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-tlw-warm-gray">
                      {pct(s.amount, total)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
