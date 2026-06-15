/**
 * Shared presentational pieces for the scorecard, built to the Session Report
 * Spec's design language (§4): flat surfaces, no shadows, color only ever
 * carries meaning (status / band), sentence case, numbers as the largest type.
 */
import type { Band, Flag } from '@/lib/scoring/types'
import { bandFamily, bandReference } from '@/lib/scoring/rubric'

const FAMILY_VAR: Record<'success' | 'info' | 'warning', string> = {
  success: 'var(--color-success)',
  info: 'var(--color-info)',
  warning: 'var(--color-warning)',
}

export function bandColor(band: Band): string {
  return FAMILY_VAR[bandFamily(band)]
}

export function flagColor(flag: Flag | null | undefined): string {
  if (flag === 'red') return 'var(--color-danger)'
  if (flag === 'amber') return 'var(--color-warning)'
  if (flag === 'green') return 'var(--color-success)'
  return 'var(--color-muted)'
}

/** Band-and-score chip used throughout the report (spec §5.4). */
export function BandChip({ band, score }: { band: Band; score?: number }) {
  const color = bandColor(band)
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-tlw-sm px-2 py-0.5 text-[11px] font-medium"
      style={{ color, backgroundColor: `${color}14` }}
    >
      <span className="lowercase first-letter:uppercase">{band.toLowerCase()}</span>
      {typeof score === 'number' && <span style={{ opacity: 0.7 }}>· {score.toFixed(1)}</span>}
    </span>
  )
}

/** The overall band pill in the header, e.g. "proficient · PCC range" (§5.1). */
export function BandPill({ band }: { band: Band }) {
  const color = bandColor(band)
  const ref = bandReference(band)
  return (
    <span
      className="inline-flex items-center rounded-tlw-md px-2.5 py-1 text-[12px] font-medium"
      style={{ color, backgroundColor: `${color}14` }}
    >
      {band.toLowerCase()}
      {ref && <span style={{ opacity: 0.7 }}>&nbsp;· {ref}</span>}
    </span>
  )
}

/**
 * A muted metric card — fill, no border (§4 layout). `value` is the big number;
 * `flag` tints the value and shows a status line when present.
 */
export function MetricCard({
  label,
  value,
  unit,
  status,
  flag,
}: {
  label: string
  value: string | number
  unit?: string
  status?: string
  flag?: Flag | null
}) {
  return (
    <div
      className="rounded-tlw-lg p-4"
      style={{ backgroundColor: 'var(--color-surface)' }}
    >
      <p className="text-[11px] font-normal text-tlw-warm-gray">{label}</p>
      <p
        className="mt-2 text-[26px] font-medium leading-none"
        style={{ color: flag ? flagColor(flag) : 'var(--tlw-navy-deep)' }}
      >
        {value}
        {unit && <span className="ml-0.5 text-[14px] font-normal">{unit}</span>}
      </p>
      {status && (
        <p className="mt-2 text-[11px]" style={{ color: flag ? flagColor(flag) : 'var(--color-muted)' }}>
          {status}
        </p>
      )}
    </div>
  )
}

/** A section with the spec's 0.5px top divider and generous vertical padding. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="pt-8"
      style={{ borderTop: '0.5px solid var(--color-divider)' }}
    >
      <h2 className="mb-4 text-[15px] font-medium text-tlw-navy-deep">{title}</h2>
      {children}
    </section>
  )
}
