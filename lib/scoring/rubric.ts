/**
 * The fixed rubric scaffolding from the Session Report Spec v0.3:
 * the eight ICF 2025 Core Competencies (§6.2), the four domains, the 5-point
 * band scale (§6.1), and the helpers that map a numeric score to a band and a
 * semantic color family (§4 band chip colors).
 *
 * Competency names and numbering per ICF 2025 Core Competencies
 * (© International Coaching Federation) — referenced, not reproduced.
 */
import type { Band, Flag } from './types'

export interface CompetencyDef {
  id: number
  name: string
  domain: string
}

export const DOMAINS = [
  { key: 'A', label: 'Foundation' },
  { key: 'B', label: 'Co-creating the relationship' },
  { key: 'C', label: 'Communicating effectively' },
  { key: 'D', label: 'Cultivating learning and growth' },
] as const

export const COMPETENCIES: CompetencyDef[] = [
  { id: 1, name: 'Demonstrates ethical practice', domain: 'Foundation' },
  { id: 2, name: 'Embodies a coaching mindset', domain: 'Foundation' },
  { id: 3, name: 'Establishes and maintains agreements', domain: 'Co-creating the relationship' },
  { id: 4, name: 'Cultivates trust and safety', domain: 'Co-creating the relationship' },
  { id: 5, name: 'Maintains presence', domain: 'Co-creating the relationship' },
  { id: 6, name: 'Listens actively', domain: 'Communicating effectively' },
  { id: 7, name: 'Evokes awareness', domain: 'Communicating effectively' },
  { id: 8, name: 'Facilitates client growth', domain: 'Cultivating learning and growth' },
]

/** Competencies where band 4 requires attunement, not just focus (spec §6.5). */
export const ATTUNEMENT_COMPETENCIES = [5, 6, 8]

/**
 * Map a numeric score to its band. Integer competency scores land exactly
 * (3 -> Proficient); the overall decimal average is banded by rounding to the
 * nearest band, e.g. 3.3 -> Proficient, 3.5 -> Strong (spec §14 H.B. anchor).
 */
export function bandForScore(score: number): Band {
  if (score >= 4.5) return 'Masterful'
  if (score >= 3.5) return 'Strong'
  if (score >= 2.5) return 'Proficient'
  if (score >= 1.5) return 'Developing'
  return 'Emerging'
}

/** Band chip color family (spec §4). */
export function bandFamily(band: Band): 'success' | 'info' | 'warning' {
  if (band === 'Strong' || band === 'Masterful') return 'success'
  if (band === 'Proficient') return 'info'
  return 'warning'
}

/** Rough ICF credential range a band gestures at, for the overall pill (spec §5). */
export function bandReference(band: Band): string {
  if (band === 'Proficient') return 'PCC range'
  if (band === 'Masterful') return 'MCC range'
  return ''
}

export const FLAG_ORDER: Record<Flag, number> = { red: 0, amber: 1, green: 2 }

/** Worst (most cautionary) flag among a set — used for consultant-move execution. */
export function worstFlag(flags: Flag[]): Flag {
  if (flags.length === 0) return 'green'
  return flags.reduce((acc, f) => (FLAG_ORDER[f] < FLAG_ORDER[acc] ? f : acc), 'green' as Flag)
}
