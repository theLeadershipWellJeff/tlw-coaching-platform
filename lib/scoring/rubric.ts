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
 * Per-competency band definitions, locked in spec v0.4 (Competencies 1, 3–8)
 * with Competency 2 carried from v0.3. These OVERRIDE the generic
 * BAND_DESCRIPTIONS for the competency expander, and are folded verbatim into
 * the engine prompt so the rubric the coach reads and the rubric Claude scores
 * against are the same text. A competency/band missing here falls back to the
 * generic description (see `bandDefinition`); not every competency has all five
 * bands authored (C2 only has 3–5).
 */
export const COMPETENCY_BANDS: Record<number, Partial<Record<Band, string>>> = {
  // 1 — Demonstrates ethical practice (v0.4). Gate: absent AI/technology
  // disclosure caps this competency at Developing (band 2).
  1: {
    Emerging:
      'Ethical boundaries regularly violated or unrecognized. Role drift unnamed. Client confidentiality not protected. Coach agenda dominates.',
    Developing:
      'Some awareness of ethical obligations but applied inconsistently. Role shifts occur without naming. Coach occasionally steers toward preferred outcomes. Absence of client disclosure around AI/technology use is an automatic band-2 ceiling here regardless of other ethical behaviors.',
    Proficient:
      'Generally avoids ethical violations. Role shifts may occur but are recognized after the fact. Client mostly in the driver’s seat, though the coach occasionally leads or loads questions with agenda. Confidentiality maintained. Coach/counseling line managed reactively.',
    Strong:
      'Role clarity is consistent and proactive; role shifts are named and permissioned. Client remains in the driver’s seat throughout — moves are transparently for the client’s benefit, not the coach’s agenda. AI/technology use is disclosed and consented to. Coach/counseling boundary actively managed.',
    Masterful:
      'A clear, explicit coaching container is established and maintained. Ethical practice is architectural — it shapes the session before problems arise. Client autonomy is structurally protected. Role, confidentiality, technology, and competence boundaries are all proactively named and held.',
  },
  // 2 — Embodies a coaching mindset (v0.3). Bands 1–2 fall back to generic.
  2: {
    Proficient:
      'Generally client-centered; names role shifts when they occur; curiosity present but process-curiosity underdeveloped. Consultant moves may occur without full signaling or permission.',
    Strong:
      'Consultant moves are signaled, permissioned, brief, and returned to the client. Coach shows awareness of bias toward frameworks and content. Nurtures the client’s own curiosity rather than filling space with frameworks.',
    Masterful:
      'Deep mastery of 2.01/2.04/2.05/2.09. Coach holds not-knowing with the client. Curiosity is contagious. Framework offers feel like the client’s own discovery. Consultant moves are rare, surgical, and indistinguishable from evocation.',
  },
  // 3 — Establishes and maintains agreements (v0.4). Gate: a session that does
  // not close with at least one named insight/learning caps at band 2.
  3: {
    Emerging:
      'No session agreement established. Coach sets direction unilaterally. Engagement objectives absent or ignored. Session ends without closure.',
    Developing:
      'Session focus is loosely established but not co-created. Engagement objectives not referenced. Coach may follow tangents without returning to the stated focus. Failure to circle back to session insights or close the session is an automatic band-2 ceiling here regardless of other agreement behaviors.',
    Proficient:
      'Session focus established collaboratively at the opening. Coach tracks the thread and returns to it when the session drifts. Engagement objectives may not be explicitly referenced but their spirit is present. Session closes with explicit acknowledgment of at least one insight or learning.',
    Strong:
      'Coach invites the client to reference engagement objectives at the opening as a resource, without imposing them. Focus is co-created and revisited if the client signals a shift. Thread held consistently. Close is deliberate — learning is named and next steps are clear.',
    Masterful:
      'Engagement objectives and session focus are held fluidly — the client experiences them as their own compass, not the coach’s agenda. Pivots are recognized and explicitly agreed upon. The close integrates session learning with the broader engagement arc. The client leaves knowing where they are in their own journey.',
  },
  // 4 — Cultivates trust and safety (v0.4). Band-4 hinge: client enablement
  // (deep unprompted disclosure / sitting with a hard question / surprising
  // self-generated insight). One clear instance qualifies.
  4: {
    Emerging:
      'Coach behaviors actively undermine trust. Client is guarded, redirected, or dismissed. No safe container established.',
    Developing:
      'Generally respectful but trust-building behaviors are inconsistent. Client disclosure stays surface level. Empathy is stated but not felt. Coach may inadvertently minimize client experience.',
    Proficient:
      'Consistent respect, empathy, and support. Client feels heard. Trust-building behaviors are present and reliable — the coach adapts tone and language to the client, acknowledges feelings, and avoids judgment.',
    Strong:
      'The container produces visible evidence of client enablement: at least one of deep unprompted disclosure, willingness to sit with a hard question without deflecting, or self-generated insight that surprised the client. The coach’s trust-building behaviors made it possible.',
    Masterful:
      'All three enablement indicators present. The client operates with full psychological safety — taking risks, naming fears, generating insight that extends beyond the session. The coach is nearly invisible as the source of safety; it feels like the client’s own courage.',
  },
  // 5 — Maintains presence (v0.4). Band-4 hinge: presence-as-instrument move
  // (coach uses own felt response as a signal, bridged back to the client).
  5: {
    Emerging:
      'Coach is distracted, reactive, or self-focused. Client experience is not tracked. Silence is absent or uncomfortable.',
    Developing:
      'Generally attentive but presence is inconsistent. Emotional content is noted but not responded to. Silence is managed but not created deliberately.',
    Proficient:
      'Stays focused on the client; manages own reactions without losing the thread; creates space for the client to think. Presence is consistent but primarily receptive.',
    Strong:
      'Uses own felt response as a signal — noticing what is emerging internally and bridging it back to the client as an invitation to reflect. This presence-as-instrument move is distinct from self-disclosure; the coach’s feeling is the instrument, not the subject. One clear instance qualifies.',
    Masterful:
      'Presence-as-instrument is fluid and frequent. Coach and client co-regulate in real time. The coach’s internal state and the client’s state move together visibly.',
  },
  // 6 — Listens actively (v0.4). Band-4 hinge: attunement observation (coach
  // names resistance, energy shift, or emotional undercurrent) — counts as a
  // feeling exploration. Zero feeling explorations still caps this at band 3.
  6: {
    Emerging:
      'Coach does not listen. Interrupts, redirects, or imposes own agenda. Client’s words are not tracked or reflected.',
    Developing:
      'Hears surface content but misses subtext. Reflections are inaccurate or generic. Emotional content is consistently missed or avoided.',
    Proficient:
      'Reflects and summarizes accurately; names feelings when observable; emotions are acknowledged but not consistently deepened.',
    Strong:
      'Notices resistance, energy shift, or emotional undercurrent and names it directly — an attunement observation that goes beyond reflecting stated content. One clear instance qualifies. Feeling explorations present (deepening questions follow the emotion).',
    Masterful:
      'Attunement is continuous. Coach tracks emotional undercurrent across the full session, not just at peak moments. Patterns across the session are named and explored.',
  },
  // 7 — Evokes awareness (v0.4). Band-4 hinge: good question → pause →
  // unconsidered insight. Band 5 is measured by DEPTH (identity/system/process),
  // not frequency.
  7: {
    Emerging:
      'Questions are primarily informational or leading. Coach tells more than asks. No observable client insight generated.',
    Developing:
      'Asks questions but they are predictable from the conversation — the client could have anticipated them. Questions move the conversation forward but do not open new territory. Insight is surface level or coach-supplied.',
    Proficient:
      'Asks questions that are genuinely curious and client-centered. Some land in unconsidered territory. Client generates their own responses without being led. Occasional insight observable but not consistently deep.',
    Strong:
      'At least one question produces the observable sequence — good question → pause → unconsidered insight. The question came from outside the client’s current frame; the insight is the client’s own, not the coach’s reframe handed to them.',
    Masterful:
      'Multiple questions produce deep unconsidered insight. At least one reaches identity, system, or process level — the client sees themselves, their patterns, or how they operate fundamentally differently. The questions feel inevitable in retrospect but were invisible in advance.',
  },
  // 8 — Facilitates client growth (v0.4). Band-4 hinge: authorship — client
  // generates their own actions (coach-packaged actions cap at band 3).
  8: {
    Emerging:
      'No integration of learning into action. Session ends without forward movement. Coach may generate conclusions on the client’s behalf or skip closure.',
    Developing:
      'Some action items identified but primarily coach-generated or coach-suggested. Client is passive in designing next steps. Learning is not explicitly connected to action. Accountability absent or superficial.',
    Proficient:
      'Actions are identified and the client understands them. Coach may summarize or package next steps on the client’s behalf. Learning acknowledged. Some client ownership, but the coach is doing meaningful integration work. Accountability loosely held.',
    Strong:
      'Client generates their own actions without the coach summarizing or packaging them. Coach creates conditions — through questions and silence — for the client to name what they will do and why. Actions connect to the client’s own insight. Accountability is co-designed, not assigned.',
    Masterful:
      'Client willingly examines their own beliefs, values, and behaviors with a desire to change toward a better version of themselves — the coach operates at that level through questions alone. The client engages deep change courageously and apparently on their own; the coach is nearly invisible. Actions emerge from identity, system, or process-level insight.',
  },
}

/**
 * theLeadershipWell cross-competency principles (spec v0.4) — the philosophical
 * foundation the whole rubric rests on. Folded into the engine prompt.
 */
export const CROSS_COMPETENCY_PRINCIPLES: { name: string; text: string }[] = [
  {
    name: 'Attunement Standard',
    text: 'The hinge from Proficient (3) to Strong (4) across Competencies 5, 6, and 8 is the shift from focused to attuned. Focus earns a 3; attunement earns a 4.',
  },
  {
    name: 'Enablement Standard',
    text: 'At band 4, scoring shifts from evaluating coach behaviors to evaluating what those behaviors enable in the client. The transcript is the evidence; one clear instance of client enablement qualifies.',
  },
  {
    name: 'Invisibility Standard',
    text: 'At band 5, the coach is nearly invisible as the source of the work. The client’s courage, insight, and action feel self-generated. The coach’s role is architectural — it created the conditions, then stepped back.',
  },
  {
    name: 'Depth Standard',
    text: 'Band 5 on Competencies 7 and 8 is measured by depth of insight (identity, system, or process level), not frequency of moves. Situational insight does not qualify.',
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
