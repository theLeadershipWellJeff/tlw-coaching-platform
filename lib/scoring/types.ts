/**
 * Types for the coaching evaluation engine output.
 *
 * Mirrors the JSON data model in spec/theLeadershipWell_Session_Report_Spec_v0.3.md
 * (§16). The engine returns a `SessionReportJson`; the report UI renders directly
 * from it, which is what keeps scoring decoupled from presentation.
 */

export type Flag = 'red' | 'amber' | 'green'
export type Band = 'Emerging' | 'Developing' | 'Proficient' | 'Strong' | 'Masterful'
export type MetricSource = 'parsed' | 'estimated' | 'unavailable'

export interface CompetencyScore {
  id: number
  name: string
  domain: string
  score: number // 1..5
  band: Band
  evidence: string // one-line, evidence-linked (spec §6.3)
  subcompetency_refs: string[] // e.g. ["6.04", "6.02"]
  gates_triggered?: string[] // gate ids that capped this competency, e.g. ["gate_3"]
}

export interface ConsultantMove {
  description: string
  signaled: boolean
  permissioned: boolean
  brief: boolean
  floor_returned: boolean
  score: number // 0..4 — count of criteria met
  status: Flag
}

export interface ConsultantMoves {
  count: number
  count_flag: Flag
  execution_flag: Flag
  moves: ConsultantMove[]
}

export interface Metrics {
  coach_talk_time_pct: number | null
  coach_talk_time_flag: Flag | null
  flagged_emotion_count: number | null
  flagged_emotion_flag: Flag | null
  feeling_explorations: number | null
  feeling_explorations_flag: Flag | null
  question_to_statement: string | null // e.g. "1:1.8"
  question_to_statement_flag: Flag | null
  reflective_pauses: number | null
  role_shifts_flagged: number | null
  consultant_moves: ConsultantMoves | null
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
  date: string // YYYY-MM-DD
  standing_engagement?: boolean // an ongoing engagement is in place (spec §9 C3, gate 2)
  // Two-tier AI/recording disclosure (spec v0.4 §9 C1). agreement_on_file is set
  // by the platform when a signed coaching agreement exists for the client — it
  // is the controlling document for AI-evaluation consent and satisfies Gate 1
  // outright. agreement_gap is an administrative follow-up flag: no signed
  // agreement is on file (it does NOT add a score penalty beyond Gate 1).
  agreement_on_file?: boolean
  agreement_gap?: boolean
}

/** The three hard-ceiling gates (spec §10). */
export interface GatesTriggered {
  // C1 capped at band 2 only when there is NO signed agreement on file AND no
  // verbal consent to record was obtained at session open (spec v0.4 §9 C1).
  gate_1: boolean
  gate_2: boolean // no named insight at close AND no standing engagement → C3 capped at band 2
  gate_3: boolean // zero feeling explorations → C6 capped at band 3
}

export interface SessionReportJson {
  session: SessionMeta
  overall_score: number
  band: Band
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
