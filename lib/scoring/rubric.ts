/**
 * The fixed rubric scaffolding from the Session Report Spec (baseline v0.3,
 * band definitions updated in v0.5 — see spec/theLeadershipWell_Session_Report_Spec_v0.5.md):
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
  // 2 — Embodies a coaching mindset. v0.5 B2: signaling a role shift earns
  // mindset credit off the floor (2.04 bias-awareness, ethics 3.7 disclosure).
  // Signaling is necessary but not sufficient — mindset content governs the ceiling.
  2: {
    Emerging:
      "Coach-centered; curiosity absent; client's choices not respected.",
    Developing:
      'Approaching client-centeredness; frequent unsignaled consultant moves; framework-filling is the dominant mode.',
    Proficient:
      'Generally client-centered. Signals role shifts when they occur (earns the floor). Curiosity present but process-curiosity (2.09) underdeveloped; bias toward action/frameworks (2.04) live. May supply centerpiece insight rather than evoking it.',
    Strong:
      "Role shifts signaled, permissioned, brief, returned. Coach shows awareness of bias toward frameworks/content and actively nurtures the client's own curiosity rather than filling space. Consulting is the exception, not the back half.",
    Masterful:
      "Deep mastery of 2.01, 2.04, 2.05, 2.09. Holds not-knowing with the client. Curiosity is contagious. Offers feel like the client's own discovery; consultant moves rare, surgical, indistinguishable from evocation.",
  },
  // 3 — Establishes and maintains agreements. v0.5 B4: band logic rewritten —
  // a client who arrives with a clear agenda should not be penalized. "Partnering"
  // means helping the client get to an agenda; if they already have one, clean
  // receipt is itself strong practice. Gate 2 unchanged: no named insight at close
  // AND no standing engagement → band 2.
  3: {
    Emerging:
      'No session focus established; no engagement agreement referenced.',
    Developing:
      'Session focus emerges without coach invitation; no named insight at close; no standing engagement agreement (Gate 2).',
    Proficient:
      'Client has an agenda; coach receives it cleanly and works it. A clear, self-evident agenda received well is a legitimate 3.',
    Strong:
      'Coach helps refine the agenda when refinement adds value — asks around the items, sharpens outcomes, tests completeness. If the agenda already has clear outcomes and needs no refinement, clean receipt is itself band 4, not a capped 3. Coach tracks the agreement when the client shifts it mid-session. A client-generated recap/close satisfies the close at band 4 — explicit coach consolidation or coach-named closure of the loop is NOT required at band 4 and is a band-5 signal only.',
    Masterful:
      'Client manages agenda and focus largely themselves; coach nearly invisible (Invisibility Standard). Explicit coach-named closure of the agreement loop, where it serves the client, appears here (ICF 3.06, 3.08, 3.09).',
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
      "Client shares freely and candidly, including emotionally raw content. Coach adapts to the client's style and identity. One clear qualifying trust-deepening move present (single-instance standard; ICF 4.01, 4.02, 4.05, 4.06).",
    Masterful:
      'Client experiences the relationship itself as generative. Coach vulnerability and transparency deepen trust actively (ICF 4.06).',
  },
  // 5 — Maintains presence. Attunement Standard; single-instance standard for band 4.
  5: {
    Emerging:
      'Coach distracted, agenda-driven, or disengaged.',
    Developing:
      "Partial presence; coach moves away from the client's energy toward own plan.",
    Proficient:
      'Coach is focused and tracks the conversation; picks up threads; responds to content (ICF 5.01, 5.02).',
    Strong:
      'Coach is attuned — present to what is emerging beneath the content (emotion, energy, the unsaid). Creates space for silence. One clear qualifying attunement move present (single-instance standard; ICF 5.03, 5.06, 5.07).',
    Masterful:
      "Coach's presence is generative. The client slows down and goes deeper because of the quality of attention in the room (ICF 5.03–5.07).",
  },
  // 6 — Listens actively. v0.5 B3: scored on two dimensions (combined for final
  // score). Attunement Standard; single instance for band 4.
  // EMOTIONAL dimension (6.04): governed by feeling-reflection/exploration logic.
  //   Gate 3 caps THIS dimension only at band 3 on zero feeling explorations.
  // COGNITIVE/STRUCTURAL dimension (6.01–6.03, 6.05–6.06): scored independently.
  //   Reflecting accurately, catching patterns, cross-session callbacks, using
  //   the client's own metaphors — score on their merits regardless of Gate 3.
  6: {
    Emerging:
      'Coach not tracking client; interrupting or redirecting without basis.',
    Developing:
      'Surface listening; coach reflects content but misses subtext.',
    Proficient:
      'Coach reflects and summarizes content accurately. Emotion named or mirrored at least twice. Stays focused on what the client is saying (ICF 6.02, 6.04). Scored on two dimensions: emotional (6.04) and cognitive/structural (6.01–6.03, 6.05–6.06).',
    Strong:
      "Emotional dimension (6.04): attuned to what is beneath the content — emotion, energy, the unsaid. At least one qualifying feeling exploration present (Gate 3 caps this dimension at band 3 if absent). Cognitive/structural dimension (6.01, 6.02, 6.05, 6.06): reflects patterns, uses client\'s own metaphors, surfaces cross-session themes. One clear qualifying attunement move present (single-instance standard; ICF 6.03, 6.04, 6.05).",
    Masterful:
      'Coach hears what the client cannot yet say. Reflects patterns across the session and engagement. Emotion exploration is deep, sustained, and transformative. Cross-session pattern recognition and metaphor use are second nature (ICF 6.03–6.06).',
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
      "Coach evokes awareness at system or identity level. Questions go beyond the situation to the client's patterns, values, or worldview. One clear qualifying insight present (single-instance standard; ICF 7.02, 7.03, 7.08).",
    Masterful:
      'Any one clear instance of identity-, system-, or process-level insight that is deeply generative and fully client-owned. Coach nearly invisible (ICF 7.02, 7.08, 7.11).',
  },
  // 8 — Facilitates client growth. Authorship Hinge between bands 3 and 4.
  // v0.5 B5: offer vs. recommendation distinction. An offer that crystallizes the
  // client's own insight into concrete form — held without attachment (7.11),
  // client free to reshape — meets the band-4 authorship hinge. A recommendation
  // the coach is invested in does not.
  8: {
    Emerging:
      'No closing or integration; session ends without learning consolidated.',
    Developing:
      'Coach attempts close but insight or action is thin, coach-packaged, or absent. No return to agreed session actions (ICF 8.06 absent or weak).',
    Proficient:
      'Coach consolidates learning at close; client names an insight. Actions may be coach-suggested (ICF 8.01, 8.06, 8.09).',
    Strong:
      "Client generates their own insight and at least one self-authored action or commitment. An offer that crystallizes the client\'s own insight into concrete form — held without attachment (7.11), client free to reshape — also meets this standard. Coach partners on accountability (authorship hinge met; ICF 7.11, 8.02, 8.03).",
    Masterful:
      'Client integrates insight into their worldview and self-generates a growth plan. Coach nearly invisible in the growth design (ICF 8.01, 8.02, 8.07).',
  },
}

/**
 * theLeadershipWell named IP principles (spec v0.5 §8) — cross-competency
 * standards that appear in scoring rationale. Folded into the engine prompt.
 */
export const CROSS_COMPETENCY_PRINCIPLES: { name: string; text: string }[] = [
  {
    name: 'The Attunement Standard',
    text: 'The hinge between Proficient (band 3) and Strong (band 4) for Competencies 5, 6, and 8. Focus earns a 3; attunement earns a 4.',
  },
  {
    name: 'The Exploration Gate',
    text: 'v0.5: Zero feeling explorations caps the EMOTIONAL DIMENSION of Competency 6 at band 3 — not all of C6. The cognitive/structural dimension (6.01–6.03, 6.05–6.06) scores independently. feeling_explorations remains visible as a sub-metric. Named in the scoring output when triggered.',
  },
  {
    name: 'The Authorship Hinge',
    text: 'For Competency 8, client-generated vs. coach-packaged actions is the hinge between bands 3 and 4. v0.5 B5: an offer that crystallizes the client\'s own insight — held without attachment (7.11), freely rephraseable — meets the hinge. A recommendation the coach is invested in does not.',
  },
  {
    name: 'The Consultant Pull Signature',
    text: 'v0.5 A4: consultant move count > 3 is a coach-facing advisory flag ("pattern to watch"), not a score-down on C2. The mode read lands on C7 and the overall via Q:S (redefined as questions:consultative-telling). When the coach perceives ~60% questions but the engine reads Q:S < 1:1, that gap is the signature of consultant pull under engagement.',
  },
  {
    name: 'The Co-thinking / Consulting Boundary',
    text: 'v0.5 A2: co-thinking builds on the client\'s own material, offered tentatively for the client to react to, WITHOUT attachment to adoption (7.11). It is excluded from consultant-move count and Q:S denominator. When attachment is present or signaling/invitation is absent, classify as consulting. Co-thinking must not become a laundering label for advice — when in doubt, default to consulting.',
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
