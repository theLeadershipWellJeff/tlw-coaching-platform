/**
 * The coaching evaluation engine.
 *
 * Sends a speaker-separated transcript to Claude with the Session Report Spec
 * v0.3 encoded as instructions, gets back the §16 JSON, then enforces the
 * mechanical scoring-engine rules (§17) deterministically in code so they can't
 * drift: the feeling-explorations gate, the consultant-move math and mode-drift
 * flag, the threshold flags, and the equal-weighted overall average. The
 * judgment gates (attunement for 5/6/8, the Competency-2 band-4 gate) are
 * instructed in the prompt — they need reading of the session, not arithmetic.
 */
import Anthropic from '@anthropic-ai/sdk'
import {
  ATTUNEMENT_COMPETENCIES,
  COMPETENCIES,
  bandForScore,
  worstFlag,
} from './rubric'
import type {
  CompetencyScore,
  ConsultantMove,
  Flag,
  Metrics,
  SessionReportJson,
} from './types'

// Proven default model from the repo; override with SCORING_MODEL (e.g. an Opus
// id) once the account has access. Scoring is a judgment task — a stronger model
// helps, but the deterministic gates below hold the line regardless.
const MODEL = process.env.SCORING_MODEL || 'claude-sonnet-4-20250514'

export interface ScoringContext {
  coachName: string
  clientInitials: string
  sessionType?: string | null
  sessionNumber?: number | null
  engagementTotal?: number | null
  sessionDate: string // YYYY-MM-DD
}

const SYSTEM = `You are theLeadershipWell's coaching evaluation engine. You score a single executive-coaching session against the ICF 2025 Core Competencies, refined by theLeadershipWell's proprietary standards. You are rigorous and honest, not generous: a solid PCC-level coach lands around 3 on the 5-point scale. Every competency score must be tied to specific evidence from the transcript. Return ONLY a valid JSON object — no markdown fences, no preamble.`

function buildPrompt(transcript: string, ctx: ScoringContext): string {
  const competencyList = COMPETENCIES.map(
    (c) => `  ${c.id}. ${c.name} (domain: ${c.domain})`
  ).join('\n')

  return `Score this coaching session.

SESSION CONTEXT
  coach: ${ctx.coachName}
  client (initials only): ${ctx.clientInitials}
  type: ${ctx.sessionType || 'unspecified'}
  session number: ${ctx.sessionNumber ?? 'unknown'} of ${ctx.engagementTotal ?? 'unknown'}
  date: ${ctx.sessionDate}

THE 5-POINT BAND SCALE
  1 Emerging — below competent practice
  2 Developing — approaching competent practice
  3 Proficient — competent practice (~PCC range)
  4 Strong — consistently skilled; attunement visible
  5 Masterful — mastery (~MCC range)

THE EIGHT COMPETENCIES (score each 1-5, with a one-line evidence note and sub-competency refs like "6.04"):
${competencyList}

theLEADERSHIPWELL STANDARDS (apply these refinements on top of ICF):
  - Coach talk-time should be <= 40% of words. Above 40% is a red flag.
  - Flagged emotion = coach moves that tune into client emotion (naming a feeling, asking a feeling question, reflecting an energy shift, or mirroring the coach's own felt response ONLY when handed back to the client). Need >= 2 per session.
  - Feeling exploration = staying WITH a feeling and asking into it (origin, meaning, function, cost) — distinct from merely naming it. An exploration also counts as a flagged-emotion event.
  - Questions should outnumber statements; an inverted ratio signals drift toward telling.
  - Consultant/teaching/framework moves are welcome ONLY when signaled, permissioned, brief, and floor-returned. For each such move, mark each of the four criteria true/false. More than 3 moves in a session signals drift from coaching mode.
  - Attunement standard (Competencies 5, 6, 8): focus earns a 3; reaching a 4 REQUIRES visible real-time responsiveness to what is emerging in the client, not just steady attention.
  - Competency 2 (coaching mindset): a 4 requires that consultant moves were consistently signaled, permissioned, brief, and floor-returned, AND the coach nurtures the client's own curiosity rather than filling space with frameworks.

TRANSCRIPT REQUIREMENT
  You need a speaker-separated verbatim transcript to compute the conversation metrics. If the transcript below is NOT speaker-separated (you cannot tell who said what), set every metric field to null and set metrics.source to "unavailable" — do NOT estimate metrics from a summary. Otherwise set metrics.source to "parsed".

Return EXACTLY this JSON shape:
{
  "session": { "coach": "${ctx.coachName}", "client_initials": "${ctx.clientInitials}", "type": "${ctx.sessionType || ''}", "session_number": ${ctx.sessionNumber ?? 'null'}, "engagement_total": ${ctx.engagementTotal ?? 'null'}, "date": "${ctx.sessionDate}" },
  "overall_score": 0.0,
  "band": "Proficient",
  "competencies": [
    { "id": 1, "name": "Demonstrates ethical practice", "domain": "Foundation", "score": 3, "band": "Proficient", "evidence": "one line tied to a moment", "subcompetency_refs": ["1.01"] }
    // ... all 8, in id order
  ],
  "metrics": {
    "coach_talk_time_pct": 0,
    "coach_talk_time_flag": "green",
    "flagged_emotion_count": 0,
    "flagged_emotion_flag": "red",
    "feeling_explorations": 0,
    "feeling_explorations_flag": "red",
    "question_to_statement": "1:1",
    "question_to_statement_flag": "red",
    "reflective_pauses": 0,
    "role_shifts_flagged": 0,
    "consultant_moves": {
      "count": 0, "count_flag": "green", "execution_flag": "green",
      "moves": [
        { "description": "...", "signaled": true, "permissioned": true, "brief": true, "floor_returned": true, "score": 4, "status": "green" }
      ]
    },
    "source": "parsed"
  },
  "win": { "went_well": "...", "improve": "one thing only", "next_step": "one concrete behavioral step for next session" },
  "evidence_moments": [ { "competency": "6.04", "timestamp": "00:00:00", "quote_short": "...", "note": "..." } ]
}

TRANSCRIPT:
${transcript}`
}

const FLAG_VALUES: Flag[] = ['red', 'amber', 'green']
function asFlag(v: unknown, fallback: Flag): Flag {
  return FLAG_VALUES.includes(v as Flag) ? (v as Flag) : fallback
}
function clampScore(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 3
  return Math.min(5, Math.max(1, Math.round(v)))
}

/** Talk-time: red above 40% (spec §7 metric 1). */
function talkTimeFlag(pct: number | null): Flag | null {
  if (pct == null) return null
  return pct > 40 ? 'red' : 'green'
}
/** Flagged emotion: <2 red, =2 amber, >2 green (spec §7 metric 2). */
function emotionFlag(count: number | null): Flag | null {
  if (count == null) return null
  if (count < 2) return 'red'
  if (count === 2) return 'amber'
  return 'green'
}
/** A single consultant move's status from its four criteria (spec §7 metric 7). */
function moveStatus(score: number): Flag {
  if (score >= 4) return 'green'
  if (score === 3) return 'amber'
  return 'red'
}

/**
 * Recompute the mechanical parts of the metrics block so the spec's rules are
 * guaranteed, not merely requested. Leaves judgment-only fields (q:s flag,
 * counts without thresholds) as the model returned them.
 */
function enforceMetrics(raw: any): Metrics {
  const source = raw?.source === 'unavailable' || raw?.source === 'estimated' ? raw.source : 'parsed'

  if (source === 'unavailable') {
    return {
      coach_talk_time_pct: null,
      coach_talk_time_flag: null,
      flagged_emotion_count: null,
      flagged_emotion_flag: null,
      feeling_explorations: null,
      feeling_explorations_flag: null,
      question_to_statement: null,
      question_to_statement_flag: null,
      reflective_pauses: null,
      role_shifts_flagged: null,
      consultant_moves: null,
      source: 'unavailable',
    }
  }

  const talk = raw?.coach_talk_time_pct == null ? null : Number(raw.coach_talk_time_pct)
  const emotion = raw?.flagged_emotion_count == null ? null : Number(raw.flagged_emotion_count)
  const explorations = raw?.feeling_explorations == null ? null : Number(raw.feeling_explorations)

  // Consultant moves: derive each move's score from its four criteria, derive
  // status from score, and apply the >3 mode-drift flag (spec §17 rule 2).
  const rawMoves: any[] = Array.isArray(raw?.consultant_moves?.moves)
    ? raw.consultant_moves.moves
    : []
  const moves: ConsultantMove[] = rawMoves.map((m) => {
    const score =
      (m?.signaled ? 1 : 0) +
      (m?.permissioned ? 1 : 0) +
      (m?.brief ? 1 : 0) +
      (m?.floor_returned ? 1 : 0)
    return {
      description: String(m?.description || ''),
      signaled: !!m?.signaled,
      permissioned: !!m?.permissioned,
      brief: !!m?.brief,
      floor_returned: !!m?.floor_returned,
      score,
      status: moveStatus(score),
    }
  })
  const count = moves.length
  const executionFlag = worstFlag(moves.map((m) => m.status))
  const countFlag: Flag = count > 3 ? 'red' : 'green'

  return {
    coach_talk_time_pct: talk,
    coach_talk_time_flag: talkTimeFlag(talk),
    flagged_emotion_count: emotion,
    flagged_emotion_flag: emotionFlag(emotion),
    feeling_explorations: explorations,
    feeling_explorations_flag: explorations == null ? null : explorations > 0 ? 'green' : 'red',
    question_to_statement: raw?.question_to_statement ?? null,
    question_to_statement_flag: asFlag(raw?.question_to_statement_flag, 'red'),
    reflective_pauses: raw?.reflective_pauses == null ? null : Number(raw.reflective_pauses),
    role_shifts_flagged: raw?.role_shifts_flagged == null ? null : Number(raw.role_shifts_flagged),
    consultant_moves: { count, count_flag: countFlag, execution_flag: executionFlag, moves },
    source,
  }
}

/**
 * Enforce the scoring-engine rules (spec §17) that are pure arithmetic/gates:
 *   1. feeling_explorations === 0 caps Competency 6 at 3
 *   5. overall = equal-weighted mean of the 8 competency scores, 1 decimal
 * plus re-derive every band from its score. Returns a clean SessionReportJson.
 */
export function enforceRules(raw: any, ctx: ScoringContext): SessionReportJson {
  // Build the canonical 8-competency array from the model output, keyed by id,
  // so a missing or mis-ordered entry can't corrupt the report.
  const byId = new Map<number, any>()
  for (const c of Array.isArray(raw?.competencies) ? raw.competencies : []) {
    if (c && typeof c.id === 'number') byId.set(c.id, c)
  }

  const metrics = enforceMetrics(raw?.metrics)
  const explorations = metrics.feeling_explorations

  const competencies: CompetencyScore[] = COMPETENCIES.map((def) => {
    const c = byId.get(def.id) || {}
    let score = clampScore(c.score)
    // Rule 1: zero feeling explorations caps Competency 6 at 3.
    if (def.id === 6 && explorations === 0 && score > 3) score = 3
    return {
      id: def.id,
      name: def.name,
      domain: def.domain,
      score,
      band: bandForScore(score),
      evidence: String(c.evidence || '').trim(),
      subcompetency_refs: Array.isArray(c.subcompetency_refs)
        ? c.subcompetency_refs.map(String)
        : [],
    }
  })

  // Rule 5: equal-weighted overall average, rounded to one decimal.
  const overall =
    Math.round((competencies.reduce((s, c) => s + c.score, 0) / competencies.length) * 10) / 10

  return {
    session: {
      coach: ctx.coachName,
      client_initials: ctx.clientInitials,
      type: ctx.sessionType || '',
      session_number: ctx.sessionNumber ?? null,
      engagement_total: ctx.engagementTotal ?? null,
      date: ctx.sessionDate,
    },
    overall_score: overall,
    band: bandForScore(overall),
    competencies,
    metrics,
    win: {
      went_well: String(raw?.win?.went_well || '').trim(),
      improve: String(raw?.win?.improve || '').trim(),
      next_step: String(raw?.win?.next_step || '').trim(),
    },
    evidence_moments: Array.isArray(raw?.evidence_moments)
      ? raw.evidence_moments.map((e: any) => ({
          competency: String(e?.competency || ''),
          timestamp: String(e?.timestamp || ''),
          quote_short: String(e?.quote_short || ''),
          note: String(e?.note || ''),
        }))
      : [],
  }
}

/** Score a transcript end to end: prompt Claude, parse JSON, enforce the rules. */
export async function scoreTranscript(
  transcript: string,
  ctx: ScoringContext
): Promise<SessionReportJson> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured.')
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: 'user', content: buildPrompt(transcript, ctx) }],
  })

  const text = message.content.find((b) => b.type === 'text')
  const rawText = text && 'text' in text ? text.text : ''
  const clean = rawText.replace(/```json\n?|```/g, '').trim()
  const match = clean.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Engine returned no JSON object.')

  let parsed: any
  try {
    parsed = JSON.parse(match[0])
  } catch {
    throw new Error('Engine returned invalid JSON.')
  }
  return enforceRules(parsed, ctx)
}

// re-export for callers that only need the type
export { ATTUNEMENT_COMPETENCIES }
