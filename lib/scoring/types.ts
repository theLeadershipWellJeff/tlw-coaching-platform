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
}

export interface SessionReportJson {
  session: SessionMeta
  overall_score: number
  band: Band
  competencies: CompetencyScore[]
  metrics: Metrics
  win: Win
  evidence_moments: EvidenceMoment[]
}
