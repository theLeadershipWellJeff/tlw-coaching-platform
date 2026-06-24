'use client'
/**
 * Shared compact-size primitives for workspace blocks.
 *
 * Every workspace card renders at three sizes. At compact (1-col) the card
 * shows a minimal summary — a count, a status pill, or a text preview — so
 * the coach can scan the page without opening each panel. Standard and expanded
 * render the full existing component.
 */
import { useEffect, useState } from 'react'

// ── tiny fetcher ────────────────────────────────────────────────────────────

/** Single-endpoint fetch with cancel-on-unmount. Returns null while loading. */
export function useCompactFetch<T>(url: string): T | null {
  const [data, setData] = useState<T | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setData(d))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [url])
  return data
}

// ── layout shells ───────────────────────────────────────────────────────────

/** Container that gives the compact card a consistent minimum height. */
export function CompactShell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[72px] flex-col justify-center gap-1 px-1">{children}</div>
}

/** Skeleton pulse while compact data loads. */
export function CompactSkeleton() {
  return (
    <CompactShell>
      <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-tlw-warm-gray/20" />
      <div className="h-3 w-1/2 animate-pulse rounded-full bg-tlw-warm-gray/15" />
    </CompactShell>
  )
}

// ── building blocks ─────────────────────────────────────────────────────────

/** A muted "nothing here yet" placeholder. Keeps the card from looking broken. */
export function CompactEmpty({ label }: { label: string }) {
  return (
    <CompactShell>
      <p className="text-[12px] text-tlw-warm-gray/70 italic">{label}</p>
    </CompactShell>
  )
}

/** Big number + label, with an optional secondary line. */
export function CompactStat({
  count,
  label,
  sub,
}: {
  count: number
  label: string
  sub?: string
}) {
  return (
    <CompactShell>
      <p className="text-[20px] font-semibold leading-none text-tlw-navy-deep">
        {count}
        <span className="ml-1 text-[12px] font-normal text-tlw-warm-gray">{label}</span>
      </p>
      {sub && <p className="line-clamp-1 text-[12px] text-tlw-espresso">{sub}</p>}
    </CompactShell>
  )
}

/** Two counts side by side (e.g. "2 open · 5 done"). */
export function CompactDualStat({
  a,
  aLabel,
  b,
  bLabel,
}: {
  a: number
  aLabel: string
  b: number
  bLabel: string
}) {
  return (
    <CompactShell>
      <div className="flex items-baseline gap-2.5">
        <span className="text-[18px] font-semibold leading-none text-tlw-navy-deep">
          {a}
          <span className="ml-1 text-[11px] font-normal text-tlw-warm-gray">{aLabel}</span>
        </span>
        <span className="text-tlw-warm-gray/40">·</span>
        <span className="text-[18px] font-semibold leading-none text-tlw-navy-deep">
          {b}
          <span className="ml-1 text-[11px] font-normal text-tlw-warm-gray">{bLabel}</span>
        </span>
      </div>
    </CompactShell>
  )
}

/** A single key value (e.g. "Active" or "Awaiting"). */
export function CompactStatus({
  value,
  tone = 'neutral',
  sub,
}: {
  value: string
  tone?: 'neutral' | 'positive' | 'pending' | 'missing'
  sub?: string
}) {
  const color = {
    neutral: 'text-tlw-espresso bg-tlw-warm-gray/10',
    positive: 'text-emerald-700 bg-emerald-50',
    pending: 'text-amber-700 bg-amber-50',
    missing: 'text-tlw-warm-gray/70 bg-tlw-warm-gray/8 italic',
  }[tone]
  return (
    <CompactShell>
      <span className={`inline-block self-start rounded-full px-2.5 py-0.5 text-[12px] font-medium ${color}`}>
        {value}
      </span>
      {sub && <p className="text-[12px] text-tlw-warm-gray">{sub}</p>}
    </CompactShell>
  )
}

/** One primary line + optional muted secondary line. */
export function CompactLine({ primary, sub }: { primary: string; sub?: string }) {
  return (
    <CompactShell>
      <p className="line-clamp-2 text-[13px] font-medium leading-snug text-tlw-navy-deep">{primary}</p>
      {sub && <p className="text-[12px] text-tlw-warm-gray">{sub}</p>}
    </CompactShell>
  )
}
