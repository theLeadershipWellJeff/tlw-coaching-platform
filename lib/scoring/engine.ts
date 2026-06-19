/**
 * The coaching evaluation engine.
 *
 * Sends a speaker-separated transcript to Claude with the consolidated Session
 * Report Spec v0.4 encoded as instructions, gets back the §14 JSON, then
 * enforces the mechanical rules deterministically in code so they can't drift:
 * the metric threshold flags, the consultant-move math and >3 mode-drift flag,
 * the three hard-ceiling gates (§10), and the equal-weighted overall average.
 *
 * Gate enforcement: the engine recomputes Gate 3 (zero feeling explorations →
 * C6 ≤ 3) from the metric arithmetically, and applies the model-judged Gate 1
 * (no AI/technology disclosure → C1 ≤ 2) and Gate 2 (no named insight at close
 * AND no standing engagement → C3 ≤ 2) as code ceilings off the booleans the
 * model returns. The finer judgment calls (single-instance band-4 standards,
 * evocative-reframe vs. consultant-move classification, the three-way emotion
 * classification) are instructed in the prompt — they need reading, not math.
 */
import Anthropic from '@anthropic-ai/sdk'
import {
  ATTUNEMENT_COMPETENCIES,
  BAND_ORDER,
  COMPETENCIES,
  COMPETENCY_BANDS,
  CROSS_COMPETENCY_PRINCIPLES,
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

// Default scoring model. The previous default (claude-sonnet-4-20250514) is
// deprecated and retires 2026-06-15, which silently breaks scoring; claude-sonnet-4-6
// is its current drop-in replacement. Override with SCORING_MODEL (e.g. an Opus
// id like claude-opus-4-8) for stronger judgment — the deterministic gates below
// hold the line regardless.
const MODEL = process.env.SCORING_MODEL || 'claude-sonnet-4-6'

export interface ScoringContext {
  coachName: string
  clientInitials: string
  sessionType?: string | null
  sessionNumber?: number | null
  engagementTotal?: number | null
  sessionDate: string // YYYY-MM-DD
}

const SYSTEM = `You are theLeadershipWell's coaching evaluation engine. You score a single executive-coaching session against the ICF 2025 Core Competencies, refined by theLeadershipWell's proprietary standards. You are rigorous and honest, not generous: a solid PCC-level coach lands around 3 on the 5-point scale. Every competency score must be tied to specific evidence from the transcript. Return ONLY a valid JSON object — no markdown fences, no preamble.`

const BAND_NUMBER: Record<string, number> = {
  Emerging: 1,
  Developing: 2,
  Proficient: 3,
  Strong: 4,
  Masterful: 5,
}

/**
 * Render the locked per-competency band definitions (spec v0.4) into prompt
 * text, straight from COMPETENCY_BANDS so the rubric Claude scores against is
 * the same source the coach-facing UI reads. Competencies/bands without an
 * authored definition are simply omitted (the general scale still applies).
 */
function buildRubricBlock(): string {
  return COMPETENCIES.map((c) => {
    const bands = COMPETENCY_BANDS[c.id]
    if (!bands) return ''
    const lines = BAND_ORDER.filter((b) => bands[b]).map(
      (b) => `    ${BAND_NUMBER[b]} ${b} — ${bands[b]}`
    )
    if (lines.length === 0) return ''
    return `  Competency ${c.id} — ${c.name}:\n${lines.join('\n')}`
  })
    .filter(Boolean)
    .join('\n\n')
}

function buildPrompt(transcript: string, ctx: ScoringContext): string {
  const competencyList = COMPETENCIES.map(
    (c) => `  ${c.id}. ${c.name} (domain: ${c.domain})`
  ).join('\n')

  const principles = CROSS_COMPETENCY_PRINCIPLES.map(
    (p) => `  - ${p.name}: ${p.text}`
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

PER-COMPETENCY BAND DEFINITIONS (theLeadershipWell v0.4 — these OVERRIDE the general scale; score the band whose definition the evidence matches):
${buildRubricBlock()}

CROSS-COMPETENCY PRINCIPLES (theLeadershipWell IP — apply across all eight):
${principles}

theLEADERSHIPWELL STANDARDS (apply these refinements on top of ICF):
  - Coach talk-time should be <= 40% of words. Above 40% is a red flag.
  - Flagged emotion (>= 2 per session): coach moves that tune into client emotion — naming a feeling observed, asking a feeling question, reflecting an energy shift, or mirroring the coach's own felt response ONLY when handed back to the client. See EMOTION MOVE CLASSIFICATION below.
  - Feeling exploration (>= 1 per session): staying WITH a feeling and asking into its origin, meaning, function, or cost. An exploration also counts as a flagged-emotion event. ZERO explorations triggers Gate 3 (see GATE RULES).
  - Questions should outnumber statements; parity (1:1) or statements-lead is a red flag.
  - Consultant/teaching/framework moves are welcome ONLY when signaled, permissioned, brief, and floor-returned. For each such move, mark the four criteria true/false. More than 3 moves in a session signals drift from coaching mode.
  - Attunement Standard (Competencies 5, 6, 8): focus earns a 3; reaching a 4 REQUIRES attunement — visible responsiveness to what is emerging beneath the content (emotion, energy, the unsaid), not just steady attention.
  - SINGLE-INSTANCE STANDARD: for Competencies 4, 5, 6, and 7, ONE clear qualifying band-4 move (a trust-deepening move / attunement move / feeling exploration / system- or identity-level insight respectively) is sufficient to reach band 4. For Competency 7, one clear identity/system/process-level insight that is deeply generative and client-owned reaches band 5. Do not require a pattern where one clear instance exists.

EMOTION MOVE CLASSIFICATION (classify each coach emotion move into exactly ONE of three types — getting this wrong is the most common scoring error):
  - Feeling reflection: coach names/mirrors/reflects the client's emotion ("I'm hearing frustration", "you sound angry"). Counts as a flagged-emotion event. Does NOT count as a feeling exploration.
  - Coping inquiry: coach asks how the client is managing or dealing with the emotion ("how are you coping with that?", "how do you deal with the frustration?"). This REDIRECTS away from the emotion — it does NOT count as a feeling exploration AND does NOT count as a flagged-emotion event.
  - Feeling exploration: coach stays with the emotion and asks into its origin, meaning, function, or cost ("what does that frustration feel like?", "where does that come from?", "what is it costing you?"). Counts as a qualifying exploration AND as a flagged-emotion event. Required for C6 band 4+.

CONSULTANT MOVE vs. EVOCATIVE REFRAME (the who-synthesises test):
  - Evocative reframe: coach offers a frame, label, or observation and the CLIENT performs the final synthesis (insight is client-owned). Counts toward evocation (Competency 7), NOT as a consultant move.
  - Consultant move: coach delivers advice, a framework, or a directive conclusion without the client doing the final synthesis — regardless of relational warmth or a positive outcome. Direct advice with no signaling/permission is an unsignaled consultant move (scores 1-2/4, flags red).

GATE RULES (hard ceilings — a competency cannot exceed the ceiling once its gate triggers). Report each gate's boolean in "gates_triggered" and list the gate id on the affected competency's "gates_triggered":
  - Gate 1 → Competency 1 capped at band 2: NO AI/technology disclosure to the client (recording / transcription / AI-assisted evaluation). Conversely, explicit disclosure + client consent at session open is the C1 band-4 marker (it need not be repeated mid-session).
  - Gate 2 → Competency 3 capped at band 2: NO client-named insight at close AND NO standing engagement agreement. If this is a standing/ongoing engagement (set session.standing_engagement true) and the client names a self-generated insight at close, Gate 2 does NOT trigger (band 3 floor).
  - Gate 3 → Competency 6 capped at band 3: ZERO qualifying feeling explorations (the engine also recomputes this from the metric).

SET session.standing_engagement to true when the transcript shows an ongoing engagement (prior sessions referenced, session number > 1, a continuing relationship), otherwise false.

TRANSCRIPT REQUIREMENT
  You need a speaker-separated verbatim transcript to compute the conversation metrics. If the transcript below is NOT speaker-separated (you cannot tell who said what), set every metric field to null and set metrics.source to "unavailable" — do NOT estimate metrics from a summary. Otherwise set metrics.source to "parsed".

Return EXACTLY this JSON shape:
{
  "session": { "coach": "${ctx.coachName}", "client_initials": "${ctx.clientInitials}", "type": "${ctx.sessionType || ''}", "session_number": ${ctx.sessionNumber ?? 'null'}, "engagement_total": ${ctx.engagementTotal ?? 'null'}, "date": "${ctx.sessionDate}", "standing_engagement": false },
  "overall_score": 0.0,
  "band": "Proficient",
  "competencies": [
    { "id": 1, "name": "Demonstrates ethical practice", "domain": "Foundation", "score": 3, "band": "Proficient", "evidence": "one line tied to a moment", "subcompetency_refs": ["1.01"], "gates_triggered": [] }
    // ... all 8, in id order. Put "gate_1"/"gate_2"/"gate_3" in gates_triggered on C1/C3/C6 respectively when the gate fires.
  ],
  "metrics": {
    "coach_talk_time_pct": 0,
    "flagged_emotion_count": 0,
    "feeling_explorations": 0,
    "question_to_statement": "1:1",
    "reflective_pauses": 0,
    "role_shifts_flagged": 0,
    "consultant_moves": {
      "count": 0,
      "moves": [
        { "description": "...", "signaled": true, "permissioned": true, "brief": true, "floor_returned": true, "score": 4, "status": "green" }
      ]
    },
    "source": "parsed"
  },
  "gates_triggered": { "gate_1": false, "gate_2": false, "gate_3": false },
  "win": { "went_well": "...", "improve": "one thing only", "next_step": "one concrete behavioral step for next session" },
  "evidence_moments": [ { "competency": "6.04", "timestamp": "00:00:00", "quote_short": "...", "note": "..." } ]
}

TRANSCRIPT:
${transcript}`
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
/** Feeling explorations: 0 red, 1 amber, >=2 green (spec §7 metric 3). */
function explorationFlag(count: number | null): Flag | null {
  if (count == null) return null
  if (count <= 0) return 'red'
  if (count === 1) return 'amber'
  return 'green'
}
/**
 * Question:statement — green only when questions exceed statements; parity or
 * statements-lead is red (spec §7 metric 4). The ratio is "questions:statements"
 * (e.g. "1:1.4" = statements lead → red; "1.8:1" = questions lead → green).
 */
function questionStatementFlag(ratio: string | null | undefined): Flag | null {
  if (!ratio || typeof ratio !== 'string') return null
  const parts = ratio.split(':').map((p) => Number(p.trim()))
  if (parts.length !== 2 || !parts.every(Number.isFinite)) return 'red'
  return parts[0] > parts[1] ? 'green' : 'red'
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
    feeling_explorations_flag: explorationFlag(explorations),
    question_to_statement: raw?.question_to_statement ?? null,
    question_to_statement_flag: questionStatementFlag(raw?.question_to_statement),
    reflective_pauses: raw?.reflective_pauses == null ? null : Number(raw.reflective_pauses),
    role_shifts_flagged: raw?.role_shifts_flagged == null ? null : Number(raw.role_shifts_flagged),
    consultant_moves: { count, count_flag: countFlag, execution_flag: executionFlag, moves },
    source,
  }
}

/**
 * Enforce the deterministic scoring rules (spec v0.4 §10 gates + §6.4 average):
 *   - Gate 3: zero feeling explorations caps Competency 6 at band 3 (recomputed
 *     here from the metric — authoritative over the model).
 *   - Gate 1: model-judged "no AI/technology disclosure" caps Competency 1 at 2.
 *   - Gate 2: model-judged "no named insight at close" caps Competency 3 at 2,
 *     but ONLY when this is not a standing engagement (revised v0.4).
 *   - overall = equal-weighted mean of the 8 competency scores, 1 decimal.
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

  // Resolve the three gates. Gate 3 is arithmetic (authoritative); gates 1 and 2
  // are model judgments. Gate 2 only fires when there's no standing engagement.
  const standingEngagement = !!raw?.session?.standing_engagement
  const g = raw?.gates_triggered || {}
  const gate1 = !!g.gate_1
  const gate2 = !!g.gate_2 && !standingEngagement
  const gate3 = explorations === 0 // null (unavailable metrics) → false

  const competencies: CompetencyScore[] = COMPETENCIES.map((def) => {
    const c = byId.get(def.id) || {}
    let score = clampScore(c.score)
    const gates: string[] = []
    // Gate 1 → C1 ≤ 2; Gate 2 → C3 ≤ 2; Gate 3 → C6 ≤ 3.
    if (def.id === 1 && gate1 && score > 2) { score = 2; gates.push('gate_1') }
    if (def.id === 3 && gate2 && score > 2) { score = 2; gates.push('gate_2') }
    if (def.id === 6 && gate3 && score > 3) { score = 3; gates.push('gate_3') }
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
      gates_triggered: gates,
    }
  })

  // Equal-weighted overall average, rounded to one decimal (spec §6.4).
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
      standing_engagement: standingEngagement,
    },
    overall_score: overall,
    band: bandForScore(overall),
    competencies,
    metrics,
    gates_triggered: { gate_1: gate1, gate_2: gate2, gate_3: gate3 },
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

/**
 * Reject a parsed response that isn't actually a session report before it
 * reaches enforceRules. enforceRules is deliberately forgiving — a missing
 * competency silently defaults to score 3 — which is right for ONE absent entry
 * but disastrous if the regex grabbed the wrong object (e.g. an example fragment
 * the model echoed) or the model returned an error/empty shape: we'd store a
 * tidy all-"Proficient" report that looks real. Require most of the 8
 * competencies to be present with numeric scores, so garbage fails loud (→
 * scoringError, no report stored) instead of failing silent.
 */
function assertReportShape(parsed: any): void {
  const comps = Array.isArray(parsed?.competencies) ? parsed.competencies : null
  if (!comps) throw new Error('Engine response is missing the competencies array.')
  const scoredIds = new Set(
    comps
      .filter((c: any) => c && typeof c.id === 'number' && Number.isFinite(Number(c.score)))
      .map((c: any) => c.id)
  )
  const required = COMPETENCIES.length - 2 // tolerate up to two omissions
  if (scoredIds.size < required) {
    throw new Error(
      `Engine response had only ${scoredIds.size}/${COMPETENCIES.length} scored competencies — refusing to store a malformed report.`
    )
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

  const message = await client.messages.create(
    {
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(transcript, ctx) }],
    },
    // Fail before Vercel's function timeout (maxDuration on the calling routes is
    // 120s) so a slow call surfaces as a clean scoring error, not a killed
    // function. One retry, not the SDK default of two, to avoid retry storms.
    { timeout: 100_000, maxRetries: 1 }
  )

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
  assertReportShape(parsed)
  return enforceRules(parsed, ctx)
}

// re-export for callers that only need the type
export { ATTUNEMENT_COMPETENCIES }
