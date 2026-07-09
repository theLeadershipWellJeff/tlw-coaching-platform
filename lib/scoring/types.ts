/**
 * Types for the coaching evaluation engine output.
 *
 * Mirrors the JSON data model in spec/theLeadershipWell_Session_Report_Spec_v0.5.md
 * (§12, superseding v0.4 §14). The engine returns a `SessionReportJson`; the
 * report UI renders directly from it, which is what keeps scoring decoupled from
 * presentation.
 */

export type Flag = 'red' | 'amber' | 'green'
export type Band = 'Emerging' | 'Developing' | 'Proficient' | 'Strong' | 'Masterful'
export type MetricSource = 'parsed' | 'estimated' | 'unavailable'

// v0.5 A1: speaker-attribution confidence and method
export interface Attribution {
  method: 'role-mapped' | 'diarization-order' | 'unknown'
  source: 'plaud-diarization' | 'zoom-vtt' | 'manual' | 'unknown'
  confidence: 'high' | 'medium' | 'low'
  likely_swap_flag: boolean
}

// v0.5 A2: utterance taxonomy (Q:S denominator = consultative_telling only).
// v0.5.3 adds the contracting bucket — engagement-level agreement-setting,
// active only in sessions 1–2, excluded from the Q:S denominator and the
// consultant-move count (null on pre-v0.5.3 reports / when the bucket is inactive).
export interface UtteranceTaxonomy {
  questions: number | null
  evocative_reflections: number | null
  co_thinking: number | null
  consultative_telling: number | null
  process_logistics: number | null
  contracting?: number | null
}

// v0.5 A3: fail-loud recording consent flag (agreement on file but recording_authorized = false)
export interface RecordingConsentFlag {
  agreement_on_file: boolean
  recording_authorized: boolean | null
  status: 'confirmed' | 'needs_confirmation' | 'declined'
}

// v0.5.2 §Engine Layer 0: data-integrity gates that run BEFORE any metric is
// computed. All three are fail-loud — they flag for manual confirmation rather
// than silently proceeding.
export interface SpeakerReassignment {
  from: string // the candidate mis-attributed speaker label, e.g. "Speaker 3"
  to: string // the primary speaker it was reassigned to, e.g. "coach" | "client"
  turns: string[] // timestamps/markers of the reassigned turns
  confirmed: boolean // false until a human confirms (fail-loud, L0.1)
}
// A coach's resolution of one manual-review flag (set via
// POST /api/reports/[id]/resolve-flag). Lives inside the report jsonb, so a
// rescore — which regenerates the flags — correctly resets resolutions too.
export interface FlagResolution {
  action: 'confirmed'
  note?: string
  resolved_at: string // ISO timestamp
  resolved_by: string // coach email
}

export interface IntegrityBlock {
  // L0.1 — phantom/minority speaker turns reassigned to the nearest primary speaker.
  speaker_reassignments: SpeakerReassignment[]
  // L0.3 — every quoted evidence string verified as a literal transcript substring.
  evidence_verbatim_check: 'pass' | 'fail' | 'unchecked'
  // Aggregated fail-loud flags requiring manual review before delivery.
  flags_for_manual_review: string[]
  // Coach resolutions, keyed by flag id. A flag stays listed for audit; the UI
  // shows it as resolved. Absent/empty = nothing reviewed yet.
  resolutions?: Record<string, FlagResolution>
}

// v0.5 B3: C6 dimensional split — emotional (6.04) + cognitive/structural (6.01–6.03, 6.05–6.06)
export interface C6Dimensions {
  emotional: {
    score: number
    gate?: string // set when Gate 3 caps this dimension
  }
  cognitive_structural: {
    score: number
    evidence?: string
  }
}

export interface CompetencyScore {
  id: number
  name: string
  domain: string
  score: number // 1..5, one decimal allowed (v0.5 B1)
  band: Band
  evidence: string // one-line, evidence-linked (spec §6.3)
  subcompetency_refs: string[] // e.g. ["6.04", "6.02"]
  gates_triggered?: string[] // gate ids that capped this competency, e.g. ["gate_3"]
  dimensions?: C6Dimensions // C6 only (v0.5 B3 dimensional split)
  // v0.5.3, C3 only: which face(s) informed the read — session-agenda
  // (3.06–3.08, all sessions) and/or engagement (3.01–3.05, sessions 1–2) — so
  // Phase 2 never benchmarks a first-session C3 against a mid-engagement C3.
  faces?: ('session_agenda' | 'engagement')[]
}

// v0.5.2 §7: a consultant move is a contiguous ENVELOPE (opens at a role-shift
// out of coaching mode, closes on re-contract / a floor-returning question / a
// pause the client fills), NOT a single advice-act. Everything between open and
// close is ONE move regardless of how many sentences or distinct recommendations
// it contains. `span` records the envelope's approximate transcript timespan.
export interface ConsultantMove {
  description: string
  span?: string // e.g. "50:40-53:21" — the envelope's timespan in the transcript
  signaled: boolean
  permissioned: boolean
  brief: boolean
  floor_returned: boolean
  score: number // 0..4 — count of criteria met (evaluated at envelope scope)
  status: Flag
}

// v0.5.3 §Layer 0: a contracting envelope mirrors the consultant-move envelope —
// opens when the coach shifts into engagement-agreement-setting (what coaching
// is/isn't, roles, confidentiality, journey, fees, compatibility), closes on a
// return to the client's agenda, a floor-returning question, or a pause the
// client fills with reflection. Distinct from process/logistics (within-session
// housekeeping), which routes to nothing special.
export interface ContractingEnvelope {
  opened_at?: string // e.g. "00:01:40"
  closed_at?: string // e.g. "00:09:12"
  covers: string[] // e.g. ["coaching_scope", "confidentiality", "journey", "compatibility"]
  subcompetency_refs: string[] // 3.01–3.05, plus 1.06 where coaching-vs-consulting scope is drawn
  quality: 'partnered' | 'one_directional'
}

// v0.5.3: the contracting block on metrics. Active only in engagement sessions
// 1–2 (the engine derives `active` from the session number — never the model);
// from session 3+ the bucket is inactive and contracting content reads as normal
// content under the standing drift rules. Null on pre-v0.5.3 reports.
export interface ContractingEnvelopeBlock {
  active: boolean // false when session_number >= 3 (bucket inactive)
  present: boolean // any contracting envelope observed
  substantial: boolean // meaningful contracting (scope, confidentiality, OR agreement-setting) — clears the S1 absence cap
  client_waiver_detected: boolean // client already understood / explicitly waived → cap suppressed regardless
  // Fail-loud: the contracting vs process/logistics split was unclear somewhere —
  // flag for manual confirmation rather than guess (Layer 0 principle).
  classification_uncertain?: boolean
  quality: 'partnered' | 'one_directional' | null
  envelopes: ContractingEnvelope[]
}

export interface ConsultantMoves {
  count: number // envelope count (v0.5.2: once per envelope, not per advice-act)
  unit: 'envelope' // v0.5.2 §7: the counting unit is the envelope
  count_flag: Flag // amber when >3 (v0.5 A4: advisory flag only, not a score cap)
  execution_flag: Flag
  caps_c2: false // v0.5 A4: consultant move count no longer scores C2 down
  note: string   // e.g. "pattern to watch — count no longer scores C2 down"
  moves: ConsultantMove[]
}

export interface Metrics {
  // v0.5.3 dual talk-time: `coach_talk_time_pct` is the COACHING-BODY figure
  // (contracting envelope excluded — what the 40% flag evaluates; same field
  // name so existing readers keep working). `coach_talk_time_pct_raw` is all
  // coach words, always displayed alongside so the exclusion is transparent.
  // Outside sessions 1–2 (or pre-v0.5.3 reports) the two are equal / raw is null.
  coach_talk_time_pct: number | null
  coach_talk_time_pct_raw?: number | null
  coach_talk_time_flag: Flag | null
  flagged_emotion_count: number | null
  flagged_emotion_flag: Flag | null
  feeling_explorations: number | null
  feeling_explorations_flag: Flag | null
  question_to_statement: string | null // e.g. "1:1.1" — v0.5: questions:consultative-telling only
  question_to_statement_flag: Flag | null
  // v0.5.2 L0.2: reminder that only telling statements count toward the
  // denominator — evocative reflections are excluded (classification precedes the ratio).
  question_to_statement_note?: string | null
  reflective_pauses: number | null
  role_shifts_flagged: number | null
  consultant_moves: ConsultantMoves | null
  // v0.5.3: contracting / agreement-setting envelopes (sessions 1–2 only —
  // `active` false and the block suppressed from the scorecard session 3+).
  contracting_envelope?: ContractingEnvelopeBlock | null
  utterance_taxonomy: UtteranceTaxonomy | null // v0.5 A2 taxonomy (+ v0.5.3 contracting bucket)
  attribution?: Attribution // v0.5 A1 speaker-attribution confidence
  source: MetricSource
}

export interface Win {
  went_well: string
  improve: string
  next_step: string
}

export interface EvidenceMoment {
  competency: string // sub-competency ref, e.g. "6.04"
  timestamp: string // e.g. "00:20:27"
  quote_short: string
  note: string
}

export interface SessionMeta {
  coach: string
  client_initials: string
  type: string
  session_number: number | null
  engagement_total: number | null
  // v0.5.3 fail-loud state: 'confirmed' = explicit front matter or a clean
  // platform derivation; 'uncertain' = derived over incomplete history (or
  // unknown). Uncertain SUPPRESSES the session-1 contracting absence cap —
  // an attribution guess never moves a score.
  session_number_confidence?: 'confirmed' | 'uncertain'
  // v0.5.3 derived: session_number ∈ {1, 2} — the contracting bucket's window.
  is_onboarding?: boolean
  date: string // YYYY-MM-DD
  standing_engagement?: boolean // an ongoing engagement is in place (spec §9 C3, gate 2)
  // Two-tier AI/recording disclosure (spec v0.4 §9 C1). agreement_on_file is set
  // by the platform when a signed coaching agreement exists for the client — it
  // is the controlling document for AI-evaluation consent and satisfies Gate 1
  // outright. agreement_gap is an administrative follow-up flag: no signed
  // agreement is on file (it does NOT add a score penalty beyond Gate 1).
  agreement_on_file?: boolean
  agreement_gap?: boolean
  // The client's signed recording/AI decision (true = consented, false =
  // declined, null = legacy/unknown). Recording consent on file requires an
  // agreement AND not an explicit decline.
  recording_authorized?: boolean | null
  // v0.5 A3: set when agreement is on file but recording_authorized = false —
  // requires human confirmation before Gate 1 cap is applied.
  recording_consent_flag?: RecordingConsentFlag
}

/** The three hard-ceiling gates (spec §10). */
export interface GatesTriggered {
  // C1 capped at band 2 only when there is NO signed agreement on file AND no
  // verbal consent to record was obtained at session open (spec v0.4 §9 C1).
  // v0.5 A3: does NOT fire when agreement is on file but recording_authorized=false
  // (that case emits recording_consent_flag and requires human confirmation instead).
  gate_1: boolean
  gate_2: boolean // no named insight at close AND no standing engagement → C3 capped at band 2
  // v0.5 B3: Gate 3 now caps C6's emotional dimension only (not all of C6).
  gate_3: boolean // zero feeling explorations → C6 emotional dimension capped at band 3
}

export interface SessionReportJson {
  session: SessionMeta
  overall_score: number
  band: Band
  // v0.5.2 §Engine Layer 0: data-integrity results (speaker reassignments,
  // verbatim-evidence check, manual-review flags). Runs before scoring.
  integrity?: IntegrityBlock
  competencies: CompetencyScore[]
  metrics: Metrics
  gates_triggered: GatesTriggered // session-level gate state (spec §10)
  win: Win
  evidence_moments: EvidenceMoment[]
  // Suggested coaching moves to raise a competency, generated on demand and
  // cached here so they're instant on re-open. Keyed by competency id. Not
  // produced by the engine — added post-hoc by /api/reports/[id]/suggest.
  suggested_moves?: Record<string, string>
}
