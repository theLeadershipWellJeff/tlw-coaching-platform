/**
 * The fixed rubric scaffolding from the Session Report Spec (baseline v0.3,
 * band definitions locked in v0.4):
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

/** Bands in ascending order, for "what's the next level" lookups. */
export const BAND_ORDER: Band[] = ['Emerging', 'Developing', 'Proficient', 'Strong', 'Masterful']

/**
 * General band descriptions (the 5-point scale, spec §6.1). Per-competency band
 * definitions are now locked in spec v0.4 (see `COMPETENCY_BANDS`); these
 * generic descriptions remain the fallback for any competency/band not yet
 * authored (e.g. Competency 2 bands 1–2). Use `bandDefinition()` to resolve.
 */
export const BAND_DESCRIPTIONS: Record<Band, string> = {
  Emerging:
    'Below competent practice. The behavior is largely absent or applied inconsistently; the coach is still building the habit.',
  Developing:
    'Approaching competent practice. The behavior shows up, but unevenly — present in moments and missed in others.',
  Proficient:
    'Competent practice (around the PCC range, the ICF credential threshold). The behavior is reliably present and well executed.',
  Strong:
    'Consistently skilled. The behavior is sustained across the session and attunement to the client is visible, not just focus.',
  Masterful:
    'Mastery (around the MCC range). The behavior is fluid, client-led, and adapts seamlessly to what the moment calls for.',
}

/**
 * Per-competency band definitions, locked in spec v0.4 (consolidated, all eight
 * competencies). These OVERRIDE the generic BAND_DESCRIPTIONS for the competency
 * expander, and are folded into the engine prompt so the rubric the coach reads
 * and the rubric Claude scores against are the same text. A competency/band
 * missing here falls back to the generic description (see `bandDefinition`).
 */
export const COMPETENCY_BANDS: Record<number, Partial<Record<Band, string>>> = {
  // 1 — Demonstrates ethical practice. Gate 1 (two-tier, v0.4): a signed
  // agreement on file satisfies the disclosure obligation; else verbal consent
  // to record at open passes. The band-2 ceiling applies only when BOTH are
  // absent. Recording consent (agreement or verbal) = band-4 marker. The
  // coaching/counseling boundary (1.06) is crossed only by wound-repair attempts.
  1: {
    Emerging:
      'Ethical obligations not met; confidentiality or role distinctions breached.',
    Developing:
      'Partial ethical practice; no signed agreement on file AND no verbal consent to record at session open (Gate 1 — band-2 ceiling).',
    Proficient:
      'Ethical standards met; role distinctions generally maintained; recording consent in place (signed agreement on file or verbal consent at open).',
    Strong:
      'Recording/AI consent established — by a signed coaching agreement on file or explicit verbal consent at session open. Role distinctions maintained throughout (ICF 1.06, 2.5).',
    Masterful:
      'Ethics woven into the coaching relationship itself — proactive, transparent, client-empowering. The client experiences the ethical stance as care, not compliance.',
  },
  // 2 — Embodies a coaching mindset.
  2: {
    Emerging:
      'Coach-centered; curiosity absent; client’s choices not respected.',
    Developing:
      'Approaching client-centeredness; frequent unsignaled consultant moves; framework-filling is the dominant mode.',
    Proficient:
      'Generally client-centered; names role shifts when they occur; curiosity present but process-curiosity underdeveloped. Consultant moves may occur without full signaling or permission.',
    Strong:
      'Consultant moves are signaled, permissioned, brief, and returned to the client. Coach shows awareness of bias toward frameworks and content. Nurtures the client’s own curiosity rather than filling space with frameworks.',
    Masterful:
      'Deep mastery of 2.01/2.04/2.05/2.09. Coach holds not-knowing with the client. Curiosity is contagious. Framework offers feel like the client’s own discovery. Consultant moves are rare, surgical, and indistinguishable from evocation.',
  },
  // 3 — Establishes and maintains agreements. Gate 2: no named insight at close
  // AND no standing engagement → band 2.
  3: {
    Emerging:
      'No session focus established; no engagement agreement referenced.',
    Developing:
      'Session focus emerges without coach invitation; no named insight at close; no standing engagement agreement (Gate 2).',
    Proficient:
      'Session focus emerges organically; client’s agenda received by the coach. Standing engagement agreement present.',
    Strong:
      'Coach explicitly invites the client’s agenda and receives it (ICF 3.06). Client names at least one insight at close.',
    Masterful:
      'Coach reflects the agenda back and partners on its completeness or priority before proceeding. Close includes consolidated insight and forward movement (ICF 3.06, 3.08, 3.09).',
  },
  // 4 — Cultivates trust and safety. Single-instance standard for band 4.
  4: {
    Emerging:
      'Client does not feel safe; coach behavior undermines trust.',
    Developing:
      'Some warmth present; trust fragile or inconsistent.',
    Proficient:
      'Client feels safe to share; coach demonstrates consistent respect and empathy (ICF 4.04, 4.05).',
    Strong:
      'Client shares freely and candidly, including emotionally raw content. Coach adapts to the client’s style and identity. One clear qualifying trust-deepening move present (single-instance standard; ICF 4.01, 4.02, 4.05, 4.06).',
    Masterful:
      'Client experiences the relationship itself as generative. Coach vulnerability and transparency deepen trust actively (ICF 4.06).',
  },
  // 5 — Maintains presence. Attunement Standard; single-instance standard for band 4.
  5: {
    Emerging:
      'Coach distracted, agenda-driven, or disengaged.',
    Developing:
      'Partial presence; coach moves away from the client’s energy toward own plan.',
    Proficient:
      'Coach is focused and tracks the conversation; picks up threads; responds to content (ICF 5.01, 5.02).',
    Strong:
      'Coach is attuned — present to what is emerging beneath the content (emotion, energy, the unsaid). Creates space for silence. One clear qualifying attunement move present (single-instance standard; ICF 5.03, 5.06, 5.07).',
    Masterful:
      'Coach’s presence is generative. The client slows down and goes deeper because of the quality of attention in the room (ICF 5.03–5.07).',
  },
  // 6 — Listens actively. Attunement Standard; Exploration Gate (Gate 3); single
  // instance for band 4.
  6: {
    Emerging:
      'Coach not tracking client; interrupting or redirecting without basis.',
    Developing:
      'Surface listening; coach reflects content but misses subtext.',
    Proficient:
      'Coach reflects and summarizes content accurately. Emotion named or mirrored at least twice. Stays focused on what the client is saying (reflection present; no exploration; ICF 6.02, 6.04).',
    Strong:
      'Coach is attuned to what is beneath the content — emotion, energy, the unsaid. At least one qualifying feeling exploration present. One clear qualifying attunement move present (single-instance standard; ICF 6.03, 6.04, 6.05).',
    Masterful:
      'Coach hears what the client cannot yet say. Reflects patterns across the session and engagement. Emotion exploration is deep, sustained, and transformative (ICF 6.03–6.06).',
  },
  // 7 — Evokes awareness. Band 5 = one clear identity/system/process-level
  // insight, deeply generative and client-owned.
  7: {
    Emerging:
      'Coach not evoking; advice-giving dominant.',
    Developing:
      'Some questions present but coach-directed; insight not generated.',
    Proficient:
      'Coach uses powerful questions; client generates awareness at process level. Coach may use reframes or metaphors (ICF 7.03, 7.04, 7.10).',
    Strong:
      'Coach evokes awareness at system or identity level. Questions go beyond the situation to the client’s patterns, values, or worldview. One clear qualifying insight present (single-instance standard; ICF 7.02, 7.03, 7.08).',
    Masterful:
      'Any one clear instance of identity-, system-, or process-level insight that is deeply generative and fully client-owned. Coach nearly invisible (ICF 7.02, 7.08, 7.11).',
  },
  // 8 — Facilitates client growth. Authorship Hinge between bands 3 and 4.
  8: {
    Emerging:
      'No closing or integration; session ends without learning consolidated.',
    Developing:
      'Coach attempts close but insight or action is thin, coach-packaged, or absent. No return to agreed session actions (ICF 8.06 absent or weak).',
    Proficient:
      'Coach consolidates learning at close; client names an insight. Actions may be coach-suggested (ICF 8.01, 8.06, 8.09).',
    Strong:
      'Client generates their own insight and at least one self-authored action or commitment. Coach partners on accountability (authorship hinge met; ICF 8.02, 8.03).',
    Masterful:
      'Client integrates insight into their worldview and self-generates a growth plan. Coach nearly invisible in the growth design (ICF 8.01, 8.02, 8.07).',
  },
}

/**
 * theLeadershipWell named IP principles (spec v0.4 §8) — cross-competency
 * standards that appear in scoring rationale. Folded into the engine prompt.
 */
export const CROSS_COMPETENCY_PRINCIPLES: { name: string; text: string }[] = [
  {
    name: 'The Attunement Standard',
    text: 'The hinge between Proficient (band 3) and Strong (band 4) for Competencies 5, 6, and 8. Focus earns a 3; attunement earns a 4.',
  },
  {
    name: 'The Exploration Gate',
    text: 'Zero feeling explorations caps Competency 6 at band 3 regardless of emotion-flag count. Named in the scoring output when triggered.',
  },
  {
    name: 'The Authorship Hinge',
    text: 'For Competency 8, client-generated vs. coach-packaged actions is the hinge between bands 3 and 4.',
  },
  {
    name: 'The Consultant Pull Signature',
    text: 'When the coach perceives ~60% questions but the engine reads statements exceeding questions, that measurable gap is the signature of consultant pull under emotional or intellectual engagement (Competency 2, metric 4).',
  },
]

/**
 * The locked band definition for a competency at a band, or the generic
 * BAND_DESCRIPTIONS fallback when that competency/band has not been authored.
 */
export function bandDefinition(competencyId: number, band: Band): string {
  return COMPETENCY_BANDS[competencyId]?.[band] ?? BAND_DESCRIPTIONS[band]
}

/** The band one level above `band`, or null if already at the top. */
export function nextBand(band: Band): Band | null {
  const i = BAND_ORDER.indexOf(band)
  return i >= 0 && i < BAND_ORDER.length - 1 ? BAND_ORDER[i + 1] : null
}

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
