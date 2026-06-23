/**
 * The coaching evaluation engine — spec v0.5.
 *
 * Sends a speaker-separated transcript to Claude with the Session Report Spec
 * v0.5 encoded as instructions, gets back the §12 JSON, then enforces the
 * mechanical rules deterministically in code so they can't drift.
 *
 * v0.5 changes from v0.4:
 *   A1: Speaker-attribution integrity step — role-map by session structure, not
 *       diarization order; fail-loud on low confidence; likely-swap flag.
 *   A2: Four-bucket utterance taxonomy (question / evocative-reflection /
 *       co-thinking / consultative-telling / process-logistics). Q:S redefined
 *       as questions:consultative-telling — evocative reflections, co-thinking,
 *       and logistics are excluded from the denominator.
 *   A3: Fail-loud when agreement on file but recording_authorized=false — emits
 *       recording_consent_flag and withholds Gate 1 cap until confirmed. Gate 1
 *       itself is unchanged and working as designed.
 *   A4: Consultant-move count >3 is now an amber advisory flag, not a red cap on
 *       C2. caps_c2 is always false. Mode read lands on C7/overall via Q:S.
 *   B1: Decimal scores (one place) allowed as within-band position; band word is
 *       the unit of meaning for Phase 2 comparison.
 *   B3: Gate 3 (zero feeling explorations) now caps C6's EMOTIONAL DIMENSION
 *       only. The cognitive/structural dimension scores independently. Final C6 =
 *       average of the two capped dimensions. feeling_explorations stays visible.
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
  Attribution,
  C6Dimensions,
  CompetencyScore,
  ConsultantMove,
  Flag,
  Metrics,
  RecordingConsentFlag,
  SessionReportJson,
  UtteranceTaxonomy,
} from './types'

// Default scoring model. The previous default (claude-sonnet-4-20250514) is
// deprecated and retired 2026-06-15, which silently breaks scoring; claude-sonnet-4-6
// is its current drop-in replacement. Override with SCORING_MODEL (e.g. an Opus
// id like claude-opus-4-8) for stronger judgment — the deterministic gates below
// hold the line regardless.
const SAFE_DEFAULT_MODEL = 'claude-sonnet-4-6'
// Model ids that have retired — calling them throws and breaks scoring. If a
// stale SCORING_MODEL still points at one (e.g. left in Vercel from before the
// default was bumped), ignore it and fall back to the safe default so scoring
// can't silently die again.
const RETIRED_MODELS = new Set([
  'claude-sonnet-4-20250514',
  'claude-3-5-sonnet-20240620',
  'claude-3-5-sonnet-20241022',
  'claude-3-opus-20240229',
])
function resolveModel(): string {
  const configured = process.env.SCORING_MODEL?.trim()
  if (configured && RETIRED_MODELS.has(configured)) {
    console.warn(
      `SCORING_MODEL "${configured}" is retired; falling back to ${SAFE_DEFAULT_MODEL}. ` +
        `Update the env var to a current model id (e.g. claude-opus-4-8).`
    )
    return SAFE_DEFAULT_MODEL
  }
  return configured || SAFE_DEFAULT_MODEL
}
const MODEL = resolveModel()

export interface ScoringContext {
  coachName: string
  clientInitials: string
  sessionType?: string | null
  sessionNumber?: number | null
  engagementTotal?: number | null
  sessionDate: string // YYYY-MM-DD
  // True when the platform finds a signed coaching agreement on file for this
  // client (spec v0.4 §9 C1, Tier 1). The agreement is the controlling document
  // for AI-evaluation consent.
  agreementOnFile: boolean
  // The client's explicit recording/AI decision captured at signing: true =
  // consented, false = declined, null = legacy/unknown. Recording consent counts
  // as "on file" when there is an agreement and the client did not decline.
  recordingAuthorized?: boolean | null
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

  return `Score this coaching session against theLeadershipWell's Session Report Spec v0.5.

SESSION CONTEXT
  coach: ${ctx.coachName}
  client (initials only): ${ctx.clientInitials}
  type: ${ctx.sessionType || 'unspecified'}
  session number: ${ctx.sessionNumber ?? 'unknown'} of ${ctx.engagementTotal ?? 'unknown'}
  date: ${ctx.sessionDate}
  agreement_on_file: ${ctx.agreementOnFile} (platform-set: a signed coaching agreement exists for this client)
  recording_authorized: ${ctx.recordingAuthorized === null || ctx.recordingAuthorized === undefined ? 'unknown' : ctx.recordingAuthorized} (platform-set: the client's signed recording/AI decision — false means they declined)

THE 5-POINT BAND SCALE (v0.5 B1: scores may carry ONE decimal as within-band position — the band word is the unit of meaning, not the decimal)
  1 Emerging — below competent practice
  2 Developing — approaching competent practice
  3 Proficient — competent practice (~PCC range)
  4 Strong — consistently skilled; attunement visible
  5 Masterful — mastery (~MCC range)
  Decimal examples: 3.4 = proficient, 3.8 = high-proficient reaching toward strong, 4.5 = strong-high

THE EIGHT COMPETENCIES (score each 1.0–5.0 with one decimal, plus a one-line evidence note and sub-competency refs like "6.04"):
${competencyList}

PER-COMPETENCY BAND DEFINITIONS (theLeadershipWell v0.5 — these OVERRIDE the general scale; score the band whose definition the evidence matches):
${buildRubricBlock()}

CROSS-COMPETENCY PRINCIPLES (theLeadershipWell IP — apply across all eight):
${principles}

STEP 1 — SPEAKER ATTRIBUTION (v0.5 A1 — do this BEFORE computing any metrics):
  Transcripts from Plaud use numbered diarization (Speaker 1, Speaker 2, …) — NOT role-mapped. Do NOT assume the lower-numbered speaker is the coach.
  Role-map using session-structure signals:
    - The COACH is the speaker who opens and closes with the evaluation/agenda frame (WIN loop: "what went well," "what would you improve," "what's your action," "what's your insight").
    - The COACH is the speaker who manages logistics (scheduling the next session, "let me save this," tech housekeeping).
    - The coach normally holds the frame while talking LESS. If a single speaker holds both the open/close coaching frame AND the majority of talk-time, raise likely_swap_flag = true.
  NESTED COACHING: if the client spends part of the session coaching a third party (e.g. coaching their own report), those utterances stay attributed to the CLIENT — do not reassign them to the coach because they sound like coaching.
  If role-mapping confidence is low (you cannot reliably determine who is coach and who is client), set attribution.confidence = "low". The engine will not trust metrics from a low-confidence attribution — fail loud, do not guess.
  Record: attribution.method ("role-mapped" or "diarization-order"), attribution.source ("plaud-diarization" or "zoom-vtt"), attribution.confidence ("high"/"medium"/"low"), attribution.likely_swap_flag (boolean).

STEP 2 — UTTERANCE TAXONOMY (v0.5 A2 — classify every coach utterance into exactly ONE of five buckets by FUNCTION, not grammatical form):
  1. Question — interrogative that evokes client thinking (C7). Counts in Q:S numerator.
  2. Evocative reflection / observation — reflects, summarizes, reframes, or shares an observation to create insight (6.02, 7.10, 7.11). Credits C6/C7. EXCLUDED from Q:S denominator and consultant-move count.
  3. Co-thinking — builds on the client's own material, offered tentatively, WITHOUT ATTACHMENT to adoption (7.11). EXCLUDED from consultant-move count. Flagged for coach visibility.
  4. Consultative / telling — advice, framework, or answer the coach supplies and is invested in. THIS IS THE Q:S DENOMINATOR. Input to consultant-move count.
  5. Process / logistics — scheduling, housekeeping, tech. Neutral; excluded everywhere.
  Q:S REDEFINED (v0.5): question_to_statement = questions : consultative_telling. Evocative reflections, co-thinking, and process utterances are OUT of the denominator. "1:1.1" means 1 question per 1.1 consultative statements.
  CO-THINKING vs. CONSULTING boundary — ICF 7.11 "without attachment":
    - Built on the client's own prior material? → toward co-thinking
    - Offered tentatively, client explicitly invited to react/reshape/reject? → toward co-thinking
    - Coach signaled it ("I'm going to think alongside you here")? → toward co-thinking
    - Coach ATTACHED to the client adopting it? → CONSULTING regardless of framing
    When in doubt, default to consulting (conservative read) and flag.
  Record utterance counts in metrics.utterance_taxonomy: {questions, evocative_reflections, co_thinking, consultative_telling, process_logistics}.

theLEADERSHIPWELL STANDARDS (apply these on top of ICF):
  - Coach talk-time should be <= 40% of words. Above 40% is a red flag.
  - Flagged emotion (>= 2 per session): coach moves that tune into client emotion. See EMOTION MOVE CLASSIFICATION.
  - Feeling exploration (>= 1 per session): staying WITH a feeling and asking into its origin, meaning, function, or cost. ZERO explorations triggers Gate 3 on C6's EMOTIONAL DIMENSION (see GATE RULES and C6 DIMENSIONAL SCORING).
  - Q:S: questions:consultative-telling — parity (1:1) or statements-lead is red.
  - Consultant/teaching/framework moves: welcome when signaled, permissioned, brief, and floor-returned. For each, mark the four criteria true/false. Count > 3 is a coach-facing advisory flag ("pattern to watch") — it does NOT cap C2. v0.5 A4.
  - Attunement Standard (Competencies 5, 6, 8): focus earns a 3; reaching a 4 REQUIRES attunement — visible responsiveness to what is emerging beneath the content.
  - SINGLE-INSTANCE STANDARD: for C4, C5, C6, C7, ONE clear qualifying band-4 move is sufficient to reach band 4.

EMOTION MOVE CLASSIFICATION (classify each coach emotion move into exactly ONE of three types — misclassification is the most common scoring error):
  - Feeling reflection: coach names/mirrors/reflects the client's emotion. Counts as a flagged-emotion event. Does NOT count as a feeling exploration.
  - Coping inquiry: coach asks how the client is managing/dealing with the emotion. REDIRECTS away from the feeling — does NOT count as a feeling exploration AND does NOT count as a flagged-emotion event.
  - Feeling exploration: coach stays with the emotion and asks into its origin, meaning, function, or cost. Counts as a qualifying exploration AND a flagged-emotion event.

C6 DIMENSIONAL SCORING (v0.5 B3 — score Competency 6 on TWO dimensions, return both):
  EMOTIONAL dimension (6.04): feeling-reflection / coping-inquiry / feeling-exploration logic. Gate 3 caps THIS dimension at band 3 (score 3.0) when feeling_explorations = 0.
  COGNITIVE/STRUCTURAL dimension (6.01, 6.02, 6.03, 6.05, 6.06): scored independently regardless of Gate 3. Reflecting content accurately, catching patterns, using the client's OWN metaphors and examples back to them, surfacing cross-session themes — all strong active-listening moves that score on their merits.
  Return both dimension scores in competency 6's "dimensions" field. The engine computes final C6 as the average of the two (after any cap). Include evidence for the cognitive/structural dimension.

CONSULTANT MOVE vs. EVOCATIVE REFRAME (the who-synthesises test):
  - Evocative reframe: coach offers a frame or observation and the CLIENT performs the final synthesis. Counts toward C7, NOT as a consultant move.
  - Consultant move: coach delivers advice, framework, or conclusion without the client synthesising. Direct advice with no signaling = unsignaled consultant move.
  - Co-thinking (see taxonomy): not a consultant move when "without attachment" holds.

C8 OFFER vs. RECOMMENDATION (v0.5 B5 — the "without attachment" test):
  - Recommendation: coach authors the forward action, hands it over, client receives. Coach is invested in adoption. Caps at band 3 (does not meet authorship hinge).
  - Offer of the client's own insight: the client has already touched the action/insight; the coach crystallizes it into concrete form and hands it BACK for the client to accept, reject, or reshape. Coach is NOT attached. Authorship stays with the client. Meets the band-4 hinge (8.02, 8.03).

AI / RECORDING DISCLOSURE — TWO-TIER STANDARD (spec §9 C1; drives Gate 1):
  - Tier 1 — agreement on file: if agreement_on_file is true AND recording_authorized is not false, the disclosure obligation is FULLY satisfied. Do NOT evaluate session-level disclosure. Set verbal_consent_to_record to false. Gate 1 does NOT trigger.
    EXCEPTION (v0.5 A3): if agreement_on_file is true AND recording_authorized is false, this may be a data-capture error. Still set verbal_consent_to_record based on what you hear. The ENGINE will handle the Gate 1 decision — do not apply it yourself.
  - Tier 2 — no agreement on file: scan the first ~5 minutes for explicit client consent to RECORD. ANY affirmative response passes. Set verbal_consent_to_record true if present, otherwise false.
  - You are NOT required to find AI scoring disclosure anywhere. The signed agreement carries those obligations.

COACHING / COUNSELING BOUNDARY (§9 C1.06): crossed ONLY when the coach attempts to repair psychological wounds. NOT a violation: psychological analysis of third parties as context; exploring the client's emotional patterns/triggers; emotional-wellbeing regulation; relational dynamics where the client is the focal point; extended exploration of the client's internal experience. Flag ONLY on: diagnosing a psychological condition, therapeutic intervention aimed at resolving trauma, or a sustained therapeutic frame. When in doubt, do NOT flag.

GATE RULES (hard ceilings — enforced in code; report each gate boolean and list the gate id on the affected competency):
  - Gate 1 → C1 capped at band 2: ONLY when NO agreement on file AND no verbal consent to record (agreement_on_file false AND verbal_consent_to_record false). NOTE: when agreement_on_file is true and recording_authorized is false, the ENGINE handles this case — set verbal_consent_to_record from what you hear and let the engine decide.
  - Gate 2 → C3 capped at band 2: no client-named insight at close AND no standing engagement. If standing engagement present, Gate 2 does NOT trigger.
  - Gate 3 → C6 EMOTIONAL DIMENSION capped at band 3 (score 3.0): zero qualifying feeling explorations. The cognitive/structural dimension is NOT capped. Return both dimension scores; the engine averages them for the final C6 score.

SET session.standing_engagement to true when the transcript shows an ongoing engagement (prior sessions referenced, session number > 1, continuing relationship), otherwise false.

TRANSCRIPT REQUIREMENT
  You need a speaker-separated verbatim transcript to compute metrics. If NOT speaker-separated, set every metric field to null and set metrics.source to "unavailable". Otherwise set metrics.source to "parsed".

Return EXACTLY this JSON shape (v0.5):
{
  "session": { "coach": "${ctx.coachName}", "client_initials": "${ctx.clientInitials}", "type": "${ctx.sessionType || ''}", "session_number": ${ctx.sessionNumber ?? 'null'}, "engagement_total": ${ctx.engagementTotal ?? 'null'}, "date": "${ctx.sessionDate}", "standing_engagement": false },
  "overall_score": 0.0,
  "band": "Proficient",
  "attribution": { "method": "role-mapped", "source": "plaud-diarization", "confidence": "high", "likely_swap_flag": false },
  "competencies": [
    { "id": 1, "name": "Demonstrates ethical practice", "domain": "Foundation", "score": 3.0, "band": "Proficient", "evidence": "one line tied to a moment", "subcompetency_refs": ["1.01"], "gates_triggered": [] },
    { "id": 2, "name": "Embodies a coaching mindset", "domain": "Foundation", "score": 3.0, "band": "Proficient", "evidence": "...", "subcompetency_refs": ["2.04"], "gates_triggered": [] },
    { "id": 3, "name": "Establishes and maintains agreements", "domain": "Co-creating the relationship", "score": 3.0, "band": "Proficient", "evidence": "...", "subcompetency_refs": ["3.06"], "gates_triggered": [] },
    { "id": 4, "name": "Cultivates trust and safety", "domain": "Co-creating the relationship", "score": 3.0, "band": "Proficient", "evidence": "...", "subcompetency_refs": ["4.04"], "gates_triggered": [] },
    { "id": 5, "name": "Maintains presence", "domain": "Co-creating the relationship", "score": 3.0, "band": "Proficient", "evidence": "...", "subcompetency_refs": ["5.01"], "gates_triggered": [] },
    { "id": 6, "name": "Listens actively", "domain": "Communicating effectively", "score": 3.5, "band": "Proficient", "evidence": "...", "subcompetency_refs": ["6.02", "6.06"], "gates_triggered": [],
      "dimensions": { "emotional": { "score": 3.0 }, "cognitive_structural": { "score": 4.0, "evidence": "cross-session callback (6.06); client's own metaphors (6.01)" } } },
    { "id": 7, "name": "Evokes awareness", "domain": "Communicating effectively", "score": 3.0, "band": "Proficient", "evidence": "...", "subcompetency_refs": ["7.03"], "gates_triggered": [] },
    { "id": 8, "name": "Facilitates client growth", "domain": "Cultivating learning and growth", "score": 3.0, "band": "Proficient", "evidence": "...", "subcompetency_refs": ["8.01"], "gates_triggered": [] }
  ],
  "metrics": {
    "coach_talk_time_pct": 0,
    "flagged_emotion_count": 0,
    "feeling_explorations": 0,
    "question_to_statement": "1:1",
    "utterance_taxonomy": { "questions": 0, "evocative_reflections": 0, "co_thinking": 0, "consultative_telling": 0, "process_logistics": 0 },
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
  "verbal_consent_to_record": false,
  "gates_triggered": { "gate_1": false, "gate_2": false, "gate_3": false },
  "win": { "went_well": "...", "improve": "one thing only", "next_step": "one concrete behavioral step for next session" },
  "evidence_moments": [ { "competency": "6.04", "timestamp": "00:00:00", "quote_short": "...", "note": "..." } ]
}

TRANSCRIPT:
${transcript}`
}

// v0.5 B1: decimal scores (one place) allowed as within-band position.
// Still clamped to [1, 5]; the band word remains the unit of meaning.
function clampScore(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 3
  return Math.round(Math.min(5, Math.max(1, v)) * 10) / 10
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
      utterance_taxonomy: null,
      attribution: undefined,
      source: 'unavailable',
    }
  }

  const talk = raw?.coach_talk_time_pct == null ? null : Number(raw.coach_talk_time_pct)
  const emotion = raw?.flagged_emotion_count == null ? null : Number(raw.flagged_emotion_count)
  const explorations = raw?.feeling_explorations == null ? null : Number(raw.feeling_explorations)

  // Consultant moves: derive each move's score from its four criteria, derive
  // status from score. v0.5 A4: count >3 is amber advisory flag — no score cap.
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
  // v0.5 A4: amber (not red) for >3 — this is a coach development signal, not a cap.
  const countFlag: Flag = count > 3 ? 'amber' : 'green'

  // v0.5 A2: four-bucket utterance taxonomy
  const rawTaxonomy = raw?.utterance_taxonomy
  const utteranceTaxonomy: UtteranceTaxonomy | null = rawTaxonomy
    ? {
        questions: rawTaxonomy.questions == null ? null : Number(rawTaxonomy.questions),
        evocative_reflections:
          rawTaxonomy.evocative_reflections == null ? null : Number(rawTaxonomy.evocative_reflections),
        co_thinking: rawTaxonomy.co_thinking == null ? null : Number(rawTaxonomy.co_thinking),
        consultative_telling:
          rawTaxonomy.consultative_telling == null ? null : Number(rawTaxonomy.consultative_telling),
        process_logistics:
          rawTaxonomy.process_logistics == null ? null : Number(rawTaxonomy.process_logistics),
      }
    : null

  // v0.5 A1: speaker attribution confidence
  const rawAttrib = raw?.attribution
  const attribution: Attribution | undefined = rawAttrib
    ? {
        method: rawAttrib.method ?? 'unknown',
        source: rawAttrib.source ?? 'unknown',
        confidence: rawAttrib.confidence ?? 'low',
        likely_swap_flag: !!rawAttrib.likely_swap_flag,
      }
    : undefined

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
    consultant_moves: {
      count,
      count_flag: countFlag,
      execution_flag: executionFlag,
      caps_c2: false,
      note: count > 3 ? 'pattern to watch — count no longer scores C2 down' : '',
      moves,
    },
    utterance_taxonomy: utteranceTaxonomy,
    attribution,
    source,
  }
}

/**
 * Enforce the deterministic scoring rules (spec v0.4 §10 gates + §6.4 average):
 *   - Gate 3: zero feeling explorations caps Competency 6 at band 3 (recomputed
 *     here from the metric — authoritative over the model).
 *   - Gate 1: no signed agreement on file AND no verbal consent to record caps
 *     Competency 1 at band 2 (two-tier disclosure standard, revised v0.4).
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

  // Resolve the three gates. Gate 3 is arithmetic (authoritative); Gate 2 is a
  // model judgment that only fires when there's no standing engagement.
  const standingEngagement = !!raw?.session?.standing_engagement
  const g = raw?.gates_triggered || {}
  // Gate 1 (spec v0.4 §9 C1, two-tier): a signed agreement on file satisfies the
  // disclosure obligation outright; otherwise verbal consent to record at session
  // open passes. The gate caps C1 only when BOTH are absent. Recomputed here from
  // agreement_on_file (platform) + verbal_consent_to_record (model) — authoritative
  // over the model's own gate_1 boolean. agreement_gap is the administrative
  // follow-up flag: no signed agreement on file (independent of verbal consent).
  const agreementOnFile = !!ctx.agreementOnFile
  const recordingAuthorized = ctx.recordingAuthorized ?? null
  const verbalConsent = !!raw?.verbal_consent_to_record
  // v0.5 A3: when an agreement IS on file but recording_authorized = false, this
  // may be a data-capture error (catastrophic: −2 bands on C1). Emit a fail-loud
  // flag and withhold Gate 1 cap until a human confirms it is a genuine decline.
  // Gate 1 itself is working as designed — only the silent application of a
  // high-cost default is the defect.
  const recordingConsentOnFile = agreementOnFile && recordingAuthorized !== false
  const recordingConsentNeedsConfirmation = agreementOnFile && recordingAuthorized === false
  // Gate 1 fires only when: not in the needs-confirmation state AND consent is
  // on neither path (no agreement OR explicit decline + no verbal consent).
  const gate1 = !recordingConsentNeedsConfirmation && !recordingConsentOnFile && !verbalConsent
  const agreementGap = !agreementOnFile
  const gate2 = !!g.gate_2 && !standingEngagement
  // v0.5 B3: gate3 drives C6 EMOTIONAL dimension cap only (not all of C6).
  const gate3 = explorations === 0 // null (unavailable metrics) → false

  const competencies: CompetencyScore[] = COMPETENCIES.map((def) => {
    const c = byId.get(def.id) || {}
    let score = clampScore(c.score)
    const gates: string[] = []
    let dimensions: C6Dimensions | undefined

    // Gate 1 → C1 ≤ 2; Gate 2 → C3 ≤ 2.
    if (def.id === 1 && gate1 && score > 2) { score = 2; gates.push('gate_1') }
    if (def.id === 3 && gate2 && score > 2) { score = 2; gates.push('gate_2') }

    // v0.5 B3: Gate 3 caps C6 EMOTIONAL DIMENSION only (not all of C6).
    // The model returns c.dimensions.{emotional.score, cognitive_structural.score}.
    // Final C6 = average of the two dimension scores (emotional after any cap).
    if (def.id === 6) {
      const rawDims = c.dimensions
      if (rawDims && rawDims.emotional?.score != null && rawDims.cognitive_structural?.score != null) {
        const emotionalRaw = clampScore(rawDims.emotional.score)
        const cogRaw = clampScore(rawDims.cognitive_structural.score)
        const emotionalCapped = gate3 ? Math.min(emotionalRaw, 3) : emotionalRaw
        if (gate3 && emotionalRaw > 3) gates.push('gate_3')
        dimensions = {
          emotional: {
            score: emotionalCapped,
            gate: gate3 && emotionalRaw > 3 ? 'feeling-exploration cap applied to this dimension only' : undefined,
          },
          cognitive_structural: {
            score: cogRaw,
            evidence: rawDims.cognitive_structural?.evidence || undefined,
          },
        }
        score = Math.round(((emotionalCapped + cogRaw) / 2) * 10) / 10
      } else if (gate3 && score > 3) {
        // Fallback: model didn't return dimensions — apply old whole-C6 cap.
        score = 3
        gates.push('gate_3')
      }
    }

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
      dimensions,
    }
  })

  // Equal-weighted overall average, rounded to one decimal (spec §6.4).
  const overall =
    Math.round((competencies.reduce((s, c) => s + c.score, 0) / competencies.length) * 10) / 10

  // v0.5 A3: build the recording consent flag when human confirmation is needed.
  const recordingConsentFlag: RecordingConsentFlag | undefined = recordingConsentNeedsConfirmation
    ? {
        agreement_on_file: agreementOnFile,
        recording_authorized: recordingAuthorized,
        status: 'needs_confirmation',
      }
    : undefined

  return {
    session: {
      coach: ctx.coachName,
      client_initials: ctx.clientInitials,
      type: ctx.sessionType || '',
      session_number: ctx.sessionNumber ?? null,
      engagement_total: ctx.engagementTotal ?? null,
      date: ctx.sessionDate,
      standing_engagement: standingEngagement,
      agreement_on_file: agreementOnFile,
      agreement_gap: agreementGap,
      recording_authorized: recordingAuthorized,
      recording_consent_flag: recordingConsentFlag,
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
      max_tokens: 6000,
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
