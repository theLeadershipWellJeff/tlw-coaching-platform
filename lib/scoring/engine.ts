/**
 * The coaching evaluation engine — spec v0.5.3.
 *
 * Sends a speaker-separated transcript to Claude with the Session Report Spec
 * v0.5.3 encoded as instructions, gets back the §12 JSON, then enforces the
 * mechanical rules deterministically in code so they can't drift.
 *
 * v0.5.3 changes from v0.5.2 (contracting / agreement-setting):
 *   L0 — A fifth utterance bucket: CONTRACTING (engagement-level agreement-
 *        setting — what coaching is/isn't, roles, confidentiality, journey,
 *        fees, compatibility). Distinct from process/logistics (within-session
 *        housekeeping); an unclear split flags for manual confirmation
 *        (fail-loud). Active ONLY in engagement sessions 1–2; session 3+
 *        contracting content reads as normal content (possible drift).
 *   §7 — Contracting is ENVELOPED (mirrors the consultant-move envelope) and
 *        excluded from the drift denominators: talk-time becomes a DUAL figure
 *        (raw + coaching-body; the 40% flag evaluates coaching-body only, raw
 *        always displayed), contracting statements leave the Q:S denominator,
 *        and contracting is never a consultant move. The carve-out is
 *        content-scoped (the envelope), never session-scoped.
 *   C3 — Two faces: session-agenda (3.06–3.08, all sessions, unchanged) and
 *        engagement-contracting (3.01–3.05, sessions 1–2 only; bands 3/4/5 =
 *        focused one-directional / partnered / client co-authors). The weaker
 *        in-scope face governs the ceiling. Absence of contracting is
 *        upside-only EXCEPT session 1, where substantial absence caps C3 at
 *        band 3 (ceiling 3.4, engine-enforced) — cleared by substantial
 *        presence, waived on observed client understanding/explicit waiver
 *        (C1-precedence pattern), and SUPPRESSED (+ manual-review flag) when
 *        the session number is uncertain: a guess never moves a score.
 *
 * v0.5.2 changes from v0.5.1 (T.S. session calibration, July 2 2026):
 *   L0 — Data-integrity layer that runs BEFORE scoring, all fail-loud:
 *     L0.1 collapse phantom/minority speakers (<5% of turns or <3 turns) onto the
 *          nearest primary speaker, surfaced for manual confirmation.
 *     L0.2 classify every coach utterance BEFORE the ratio — only telling
 *          statements count toward the Q:S denominator (evocative reflections out).
 *     L0.3 every quoted evidence string must be a literal transcript substring —
 *          verified in code, fail-loud (flags for manual review) on any miss.
 *   §7 — A consultant move is a contiguous ENVELOPE (opened by a role-shift out of
 *        coaching mode, closed by re-contract / a floor-returning question / a
 *        pause the client fills), NOT a single advice-act. Count increments once
 *        per envelope; each move carries a `span`. Fixes the T.S. 7-vs-2 count gap.
 *   C1 — Platform-boolean precedence: observed in-session verbal consent PASSES
 *        the Tier-2 gate regardless of the recording_authorized boolean; the gate
 *        fails only when BOTH no agreement on file AND no verbal consent. But
 *        unset/false platform booleans cap C1 BELOW band 4 — band 4 requires the
 *        on-file infrastructure (signed agreement + recorded authorization).
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
  ContractingEnvelope,
  ContractingEnvelopeBlock,
  Flag,
  IntegrityBlock,
  Metrics,
  RecordingConsentFlag,
  SessionReportJson,
  SpeakerReassignment,
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
  // v0.5.3 fail-loud state for the session number: 'confirmed' (explicit front
  // matter, or a clean platform derivation) or 'uncertain' (derived over
  // incomplete history / unknown). Uncertain suppresses the session-1
  // contracting absence cap. Defaults to 'uncertain' when sessionNumber is null.
  sessionNumberConfidence?: 'confirmed' | 'uncertain'
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

/**
 * v0.5.3 session-number state, shared by the prompt and enforceRules. The
 * contracting bucket's window is OPEN for sessions 1–2 and for an unknown
 * session number (fail-loud: detect and report, the engine decides); it is
 * CLOSED only when the session is confirmed/known to be 3+.
 */
function sessionNumberState(ctx: ScoringContext): {
  sessionNumber: number | null
  confidence: 'confirmed' | 'uncertain'
  isOnboarding: boolean
  contractingWindowOpen: boolean
} {
  const n = ctx.sessionNumber ?? null
  const confidence: 'confirmed' | 'uncertain' =
    n == null ? 'uncertain' : ctx.sessionNumberConfidence ?? 'confirmed'
  return {
    sessionNumber: n,
    confidence,
    isOnboarding: n === 1 || n === 2,
    contractingWindowOpen: n == null || n <= 2,
  }
}

function buildPrompt(transcript: string, ctx: ScoringContext): string {
  const competencyList = COMPETENCIES.map(
    (c) => `  ${c.id}. ${c.name} (domain: ${c.domain})`
  ).join('\n')

  const principles = CROSS_COMPETENCY_PRINCIPLES.map(
    (p) => `  - ${p.name}: ${p.text}`
  ).join('\n')

  const sn = sessionNumberState(ctx)

  return `Score this coaching session against theLeadershipWell's Session Report Spec v0.5.3.

SESSION CONTEXT
  coach: ${ctx.coachName}
  client (initials only): ${ctx.clientInitials}
  type: ${ctx.sessionType || 'unspecified'}
  session number: ${ctx.sessionNumber ?? 'unknown'} of ${ctx.engagementTotal ?? 'unknown'}
  session_number_confidence: ${sn.confidence} (platform-set fail-loud state — 'uncertain' means the position in the engagement is a derivation, not a confirmed fact)
  is_onboarding: ${sn.isOnboarding}${sn.sessionNumber == null ? ' (session number unknown — treat the contracting window as OPEN and report what you observe)' : ''}
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

LAYER 0 — DATA INTEGRITY (v0.5.2 — run these THREE checks BEFORE any metric or competency is scored; all are FAIL-LOUD: flag for manual confirmation, never silently proceed):
  L0.1 — SPEAKER MIS-ATTRIBUTION COLLAPSE. A phantom or minority speaker label (one appearing in fewer than 5% of turns, OR fewer than 3 turns total — whichever is larger) is a candidate mis-attribution that distorts talk-time and the Q:S ratio. Reassign each such turn to the nearest PRIMARY speaker by content and role consistency (question-asking cadence / reflective register → coach; narrative / self-disclosure → client). Record every reassignment in integrity.speaker_reassignments as { from, to, turns:[timestamps], confirmed:false } and DO NOT silently merge — the reassignment is provisional until a human confirms it.
  L0.2 — UTTERANCE CLASSIFICATION PRECEDES THE RATIO. Classify every coach utterance into its bucket (STEP 2 below) BEFORE computing question_to_statement. Evocative reflections are evocation, not telling — they are EXCLUDED from the statement denominator; only consultative/telling statements count. This prevents the coach's strongest register (evocative reflection) from being miscounted as telling and inflating the denominator.
  L0.3 — EVIDENCE STRINGS MUST BE VERBATIM. Every string you place inside quotation marks — in a competency evidence note, an evidence_moments quote_short, or anywhere — MUST be a LITERAL substring of the transcript above (identical except for whitespace and casing). NEVER synthesize, reconstruct, paraphrase, or approximate a quote and present it inside quotation marks. If you want to characterize a move in your own words, do so WITHOUT quotation marks (an unquoted paraphrase is fine). A fabricated quote is fatal to a calibration anchor. The engine re-verifies every quoted string against the transcript after you respond and fails loud on any miss.

STEP 1 — SPEAKER ATTRIBUTION (v0.5 A1 — do this BEFORE computing any metrics):
  Transcripts from Plaud use numbered diarization (Speaker 1, Speaker 2, …) — NOT role-mapped. Do NOT assume the lower-numbered speaker is the coach.
  Role-map using session-structure signals:
    - The COACH is the speaker who opens and closes with the evaluation/agenda frame (WIN loop: "what went well," "what would you improve," "what's your action," "what's your insight").
    - The COACH is the speaker who manages logistics (scheduling the next session, "let me save this," tech housekeeping).
    - The coach normally holds the frame while talking LESS. If a single speaker holds both the open/close coaching frame AND the majority of talk-time, raise likely_swap_flag = true.
  NESTED COACHING: if the client spends part of the session coaching a third party (e.g. coaching their own report), those utterances stay attributed to the CLIENT — do not reassign them to the coach because they sound like coaching.
  If role-mapping confidence is low (you cannot reliably determine who is coach and who is client), set attribution.confidence = "low". The engine will not trust metrics from a low-confidence attribution — fail loud, do not guess.
  Record: attribution.method ("role-mapped" or "diarization-order"), attribution.source ("plaud-diarization" or "zoom-vtt"), attribution.confidence ("high"/"medium"/"low"), attribution.likely_swap_flag (boolean).

STEP 2 — UTTERANCE TAXONOMY (v0.5 A2, extended v0.5.3 — classify every coach utterance into exactly ONE of six buckets by FUNCTION, not grammatical form):
  1. Question — interrogative that evokes client thinking (C7). Counts in Q:S numerator.
  2. Evocative reflection / observation — reflects, summarizes, reframes, or shares an observation to create insight (6.02, 7.10, 7.11). Credits C6/C7. EXCLUDED from Q:S denominator and consultant-move count.
  3. Co-thinking — builds on the client's own material, offered tentatively, WITHOUT ATTACHMENT to adoption (7.11). EXCLUDED from consultant-move count. Flagged for coach visibility.
  4. Consultative / telling — advice, framework, or answer the coach supplies and is invested in. THIS IS THE Q:S DENOMINATOR. Input to consultant-move count.
  5. Process / logistics — WITHIN-SESSION housekeeping only: time checks, "where do you want to start today," session-agenda mechanics, scheduling, tech. Neutral; excluded everywhere.
  6. Contracting / agreement-setting (v0.5.3 — ${sn.contractingWindowOpen ? 'ACTIVE for this session' : 'INACTIVE for this session (confirmed session 3+) — do NOT use this bucket; classify engagement-contracting content into the other buckets as normal content (it may read as drift under the standing rules)'}) — coach speech that establishes or re-establishes the coaching ENGAGEMENT itself: defining what coaching is and is not, explaining the engagement journey, setting confidentiality, roles, responsibilities, logistics of the engagement, fees, duration/termination, and determining coach–client compatibility. Routes to C3's engagement face (3.01–3.05) and, where coaching-vs-consulting scope is drawn, to 1.06. EXCLUDED from the Q:S denominator (same pattern as evocative reflection) and NEVER a consultant move. NOT the same as process/logistics: process/logistics is within-session housekeeping; contracting is engagement-level agreement-setting. When the split between the two is unclear, set contracting_envelope.classification_uncertain = true and flag for manual confirmation rather than guess (Layer 0 fail-loud principle). Mid-engagement re-contracting under 3.12 is ordinary C3 content, NOT this bucket.
  Q:S REDEFINED (v0.5, extended v0.5.3): question_to_statement = questions : consultative_telling. Evocative reflections, co-thinking, process utterances, and contracting utterances are OUT of the denominator. "1:1.1" means 1 question per 1.1 consultative statements.
  CO-THINKING vs. CONSULTING boundary — ICF 7.11 "without attachment":
    - Built on the client's own prior material? → toward co-thinking
    - Offered tentatively, client explicitly invited to react/reshape/reject? → toward co-thinking
    - Coach signaled it ("I'm going to think alongside you here")? → toward co-thinking
    - Coach ATTACHED to the client adopting it? → CONSULTING regardless of framing
    When in doubt, default to consulting (conservative read) and flag.
  Record utterance counts in metrics.utterance_taxonomy: {questions, evocative_reflections, co_thinking, consultative_telling, process_logistics, contracting}.

CONTRACTING ENVELOPE (v0.5.3 — ${sn.contractingWindowOpen ? 'the contracting window is OPEN for this session; apply these rules' : 'the contracting window is CLOSED (confirmed session 3+): return metrics.contracting_envelope = null and classify any engagement-contracting content as normal content'}):
  - A contracting envelope mirrors the consultant-move envelope architecture: it OPENS when the coach shifts into engagement-agreement-setting and CLOSES on a return to the client's agenda, a floor-returning coaching question, or a pause after which the client resumes reflection unprompted. Utterances inside the envelope are tagged contracting.
  - GUARDRAIL: the carve-out is CONTENT-SCOPED (the envelope), never session-scoped. Genuine consultant drift inside a first session still counts as consultant moves and consultative telling and flags normally.
  - Report metrics.contracting_envelope:
      · present — any contracting envelope observed.
      · substantial — SOME meaningful engagement contracting occurred (coaching scope, confidentiality, OR agreement-setting). Completeness across 3.01–3.05 is NOT required for substantial — that separates band 3 from 4/5 on C3's engagement face. A first session covering scope and confidentiality but omitting fees is still substantial.
      · client_waiver_detected — true when the transcript shows the client already understood the coaching relationship or explicitly waived contracting (an experienced coaching client, or a continuing relationship mislabeled as session 1). Observed evidence overrides the session-number boolean, exactly as observed verbal consent satisfies the C1 Tier-2 gate.
      · classification_uncertain — true when the contracting vs process/logistics split was unclear anywhere (fail-loud; the engine flags for manual confirmation).
      · quality — "partnered" (checks understanding, invites the client's questions, co-creates) or "one_directional" (focused, accurate, largely presented).
      · envelopes — one entry per envelope: { opened_at, closed_at, covers (e.g. ["coaching_scope","confidentiality","journey","fees","compatibility"]), subcompetency_refs (3.01–3.05, plus 1.06 where coaching-vs-consulting scope is drawn), quality }.
  - TALK-TIME DUAL FIGURE: report BOTH coach_talk_time_pct_raw (ALL coach words) and coach_talk_time_pct_coaching_body (contracting-enveloped words excluded). The 40% flag evaluates coaching-body only; the raw figure is always displayed, never suppressed. With no contracting present the two figures are equal.
  - Do NOT apply the session-1 absence cap to C3 yourself — report the booleans above and the engine computes the cap deterministically.

theLEADERSHIPWELL STANDARDS (apply these on top of ICF):
  - Coach talk-time should be <= 40% of words. Above 40% is a red flag. v0.5.3: when contracting envelopes are present, the 40% threshold evaluates the COACHING-BODY figure (contracting excluded); report both figures per the CONTRACTING ENVELOPE section.
  - Flagged emotion (>= 2 per session): coach moves that tune into client emotion. See EMOTION MOVE CLASSIFICATION.
  - Feeling exploration (>= 1 per session): staying WITH a feeling and asking into its origin, meaning, function, or cost. ZERO explorations triggers Gate 3 on C6's EMOTIONAL DIMENSION (see GATE RULES and C6 DIMENSIONAL SCORING).
  - Q:S: questions:consultative-telling — parity (1:1) or statements-lead is red.
  - Consultant/teaching/framework moves are counted as ENVELOPES (v0.5.2 §7 — the single most important counting rule):
      · An envelope OPENS at a role-shift OUT of coaching mode (into consulting, teaching, mentoring, framework-offering, or spiritual direction) — whether that shift is signaled or unsignaled.
      · An envelope CLOSES at the coach's return to coaching mode, evidenced by ANY of: (a) an explicit re-contract ("I'll put my coach hat back on"); (b) a floor-returning coaching question ("What are your thoughts on that?", "How do you feel about that?"); (c) a pause after which the client returns to reflection unprompted (the coach hands the role back and the client picks it up).
      · EVERYTHING between open and close is ONE move — regardless of how many sentences, distinct recommendations, or topic shifts occur inside the envelope. Increment the count ONCE per envelope. Do NOT count each discrete advice-act separately (that is the bug this rule fixes).
      · Score each ENVELOPE on the four criteria at envelope scope: Signaled (was the OPENING role-shift named?), Permissioned (did the client agree before the envelope proceeded?), Brief (is the WHOLE envelope terse, or does it crowd out client discovery? — long envelopes fail brief even when they pass the other three), Floor returned (did a close-signal a/b/c actually occur?). Record each move's approximate transcript span (e.g. "50:40-53:21").
      · Envelope count > 3 is a coach-facing advisory flag ("pattern to watch") — it does NOT cap C2 (v0.5 A4). Execution quality is judged per envelope regardless of the count.
      · v0.5.3: a CONTRACTING envelope is NOT a consultant move — exclude contracting from the consultant-move count entirely (it has its own envelope object).
  - Attunement Standard (Competencies 5, 6, 8): focus earns a 3; reaching a 4 REQUIRES attunement — visible responsiveness to what is emerging beneath the content.
  - SINGLE-INSTANCE STANDARD: for C4, C5, C6, C7, ONE clear qualifying band-4 move is sufficient to reach band 4.

EMOTION MOVE CLASSIFICATION (classify each coach emotion move into exactly ONE of three types — misclassification is the most common scoring error):
  - Feeling reflection: coach names/mirrors/reflects the client's emotion. Counts as a flagged-emotion event. Does NOT count as a feeling exploration.
  - Coping inquiry: coach asks how the client is managing/dealing with the emotion. REDIRECTS away from the feeling — does NOT count as a feeling exploration AND does NOT count as a flagged-emotion event.
  - Feeling exploration: coach stays with the emotion and asks into its origin, meaning, function, or cost. Counts as a qualifying exploration AND a flagged-emotion event.

C6 DIMENSIONAL SCORING (v0.5.1 — TWO raw sub-scores required; engine enforces gate and composite):
  You MUST return BOTH sub-scores in competency 6's "dimensions" field. Do NOT apply Gate 3 yourself to the top-level C6 score — report the raw sub-scores and the engine computes the composite deterministically.
  EMOTIONAL dimension (6.04): feeling-reflection / coping-inquiry / feeling-exploration logic. Score this dimension on its own merits — do NOT cap it yourself for Gate 3; the engine caps it.
  COGNITIVE/STRUCTURAL dimension (6.01, 6.02, 6.03, 6.05, 6.06): scored independently. Reflecting content accurately, catching patterns, using the client's OWN metaphors and examples back to them, surfacing cross-session themes. NOT gated by Gate 3. Strong cognitive/structural listening CAN raise the final C6 composite even when feeling_explorations = 0.
  Top-level C6 "score": your best estimate of the raw composite before any gate. The engine will override this with the deterministic composite formula (which favors cognitive_structural when it is the stronger dimension). You do not need to match the composite precisely — focus on accurate sub-scores.
  Include evidence for the cognitive/structural dimension. The dimensions field is REQUIRED for C6.

CONSULTANT MOVE vs. EVOCATIVE REFRAME (the who-synthesises test):
  - Evocative reframe: coach offers a frame or observation and the CLIENT performs the final synthesis. Counts toward C7, NOT as a consultant move.
  - Consultant move: coach delivers advice, framework, or conclusion without the client synthesising. Direct advice with no signaling = unsignaled consultant move.
  - Co-thinking (see taxonomy): not a consultant move when "without attachment" holds.

C8 OFFER vs. RECOMMENDATION (v0.5 B5 — the "without attachment" test):
  - Recommendation: coach authors the forward action, hands it over, client receives. Coach is invested in adoption. Caps at band 3 (does not meet authorship hinge).
  - Offer of the client's own insight: the client has already touched the action/insight; the coach crystallizes it into concrete form and hands it BACK for the client to accept, reject, or reshape. Coach is NOT attached. Authorship stays with the client. Meets the band-4 hinge (8.02, 8.03).

C3 TWO FACES (v0.5.3):
  - SESSION-AGENDA face (3.06–3.08) — governs C3 in ALL sessions, unchanged: clean receipt of a clear client agenda = band 4; band 5 requires the coach to reflect the agenda back and partner on completeness.
  - ENGAGEMENT face (3.01–3.05) — assessed ONLY when in scope (sessions 1–2${sn.sessionNumber == null ? ', or session number unknown and the transcript reads as an onboarding session' : ''}). Band ladder: 3 Proficient = clearly explains what coaching is / is not, roles, confidentiality, and the engagement journey — focused, accurate, largely one-directional. 4 Strong = PARTNERED — checks understanding, invites the client's questions, co-creates the agreement rather than presenting it (attunement standard: focused explanation is a 3; attuned, partnered contracting is a 4). 5 Masterful = client CO-AUTHORS — articulates back what they want, partners on measures of success and on compatibility; the coach's framing is nearly invisible (enablement/invisibility standard).
  - When BOTH faces are in scope, they jointly inform the single C3 read; the WEAKER in-scope required face governs the ceiling. No arithmetic sub-weighting — a judgment read against the band definitions.
  - Return "faces" on competency 3 listing which face(s) you assessed, e.g. ["session_agenda","engagement"] (["session_agenda"] when the engagement face is out of scope).
  - Do NOT apply the session-1 absence cap yourself — the engine computes it from contracting_envelope.

AI / RECORDING DISCLOSURE — TWO-TIER STANDARD (spec §9 C1; drives Gate 1. v0.5.2 platform-boolean precedence):
  - ALWAYS scan the first ~5 minutes for explicit client consent to RECORD ("are you okay if I record our session?" → client affirms). ANY affirmative response = observed verbal consent. Set verbal_consent_to_record true if present, otherwise false — do this regardless of the platform booleans, because observed in-session consent PASSES the disclosure gate even when recording_authorized is unset or false (v0.5.2: observed evidence outranks an unset/false flag for the purpose of passing the gate).
  - The two-tier gate FAILS only when BOTH: (i) no signed agreement on file AND (ii) no verbal consent observed in-session. If either holds, the gate passes. The engine computes the Gate 1 decision — do not apply it yourself.
  - CEILING (v0.5.2): passing the gate confirms only the FLOOR. It does NOT certify that the fuller ethical infrastructure (signed agreement + recorded authorization) is complete. Band 4+ requires that infrastructure confirmed on file; when the platform booleans are unset/false the engine caps C1 below band 4 even though the gate passes. So a session that passes on verbal consent alone should land around band 3 (Proficient), not band 4 — score C1 on its merits and let the engine apply the ceiling.
  - You are NOT required to find AI scoring disclosure anywhere. The signed agreement carries those obligations.

COACHING / COUNSELING BOUNDARY (§9 C1.06): crossed ONLY when the coach attempts to repair psychological wounds. NOT a violation: psychological analysis of third parties as context; exploring the client's emotional patterns/triggers; emotional-wellbeing regulation; relational dynamics where the client is the focal point; extended exploration of the client's internal experience. Flag ONLY on: diagnosing a psychological condition, therapeutic intervention aimed at resolving trauma, or a sustained therapeutic frame. When in doubt, do NOT flag.

GATE RULES (hard ceilings — enforced in code; report each gate boolean and list the gate id on the affected competency):
  - Gate 1 → C1 capped at band 2: ONLY when NO agreement on file AND no verbal consent to record (agreement_on_file false AND verbal_consent_to_record false). v0.5.2: observed verbal consent passes this gate regardless of the recording_authorized boolean. SEPARATELY, when the on-file infrastructure is not confirmed (no signed agreement on file, or recording_authorized not true), the engine caps C1 below band 4 — this is a ceiling, not the gate.
  - Gate 2 → C3 capped at band 2: no client-named insight at close AND no standing engagement. If standing engagement present, Gate 2 does NOT trigger. NOTE (v0.5.1 Patch 2): a client-generated recap or summary at close satisfies the close for C3 band 4 — explicit coach-named closure is a band-5 signal only, not a band-4 requirement.
  - Gate 3 → C6 EMOTIONAL DIMENSION capped at band 3 (score 3.0): zero qualifying feeling explorations. The cognitive/structural dimension is NOT capped. IMPORTANT: do NOT apply this cap to the top-level C6 score or to the emotional sub-score yourself — report raw sub-scores in "dimensions" and let the engine enforce Gate 3 and compute the composite. The composite formula (cognitive-favoring weighted blend with emotional floor) can lift the final C6 above 3.0 when cognitive/structural listening is strong.

SET session.standing_engagement to true when the transcript shows an ongoing engagement (prior sessions referenced, session number > 1, continuing relationship), otherwise false.

TRANSCRIPT REQUIREMENT
  You need a speaker-separated verbatim transcript to compute metrics. If NOT speaker-separated, set every metric field to null and set metrics.source to "unavailable". Otherwise set metrics.source to "parsed".

Return EXACTLY this JSON shape (v0.5.3):
{
  "session": { "coach": "${ctx.coachName}", "client_initials": "${ctx.clientInitials}", "type": "${ctx.sessionType || ''}", "session_number": ${ctx.sessionNumber ?? 'null'}, "engagement_total": ${ctx.engagementTotal ?? 'null'}, "session_number_confidence": "${sn.confidence}", "is_onboarding": ${sn.isOnboarding}, "date": "${ctx.sessionDate}", "standing_engagement": false },
  "overall_score": 0.0,
  "band": "Proficient",
  "integrity": { "speaker_reassignments": [ { "from": "Speaker 3", "to": "coach", "turns": ["48:45"], "confirmed": false } ] },
  "attribution": { "method": "role-mapped", "source": "plaud-diarization", "confidence": "high", "likely_swap_flag": false },
  "competencies": [
    { "id": 1, "name": "Demonstrates ethical practice", "domain": "Foundation", "score": 3.0, "band": "Proficient", "evidence": "one line tied to a moment", "subcompetency_refs": ["1.01"], "gates_triggered": [] },
    { "id": 2, "name": "Embodies a coaching mindset", "domain": "Foundation", "score": 3.0, "band": "Proficient", "evidence": "...", "subcompetency_refs": ["2.04"], "gates_triggered": [] },
    { "id": 3, "name": "Establishes and maintains agreements", "domain": "Co-creating the relationship", "score": 3.0, "band": "Proficient", "evidence": "...", "subcompetency_refs": ["3.06"], "gates_triggered": [], "faces": ["session_agenda"] },
    { "id": 4, "name": "Cultivates trust and safety", "domain": "Co-creating the relationship", "score": 3.0, "band": "Proficient", "evidence": "...", "subcompetency_refs": ["4.04"], "gates_triggered": [] },
    { "id": 5, "name": "Maintains presence", "domain": "Co-creating the relationship", "score": 3.0, "band": "Proficient", "evidence": "...", "subcompetency_refs": ["5.01"], "gates_triggered": [] },
    { "id": 6, "name": "Listens actively", "domain": "Communicating effectively", "score": 3.5, "band": "Proficient", "evidence": "...", "subcompetency_refs": ["6.02", "6.06"], "gates_triggered": [],
      "dimensions": { "emotional": { "score": 3.0 }, "cognitive_structural": { "score": 4.0, "evidence": "cross-session callback (6.06); client's own metaphors (6.01)" } } },
    { "id": 7, "name": "Evokes awareness", "domain": "Communicating effectively", "score": 3.0, "band": "Proficient", "evidence": "...", "subcompetency_refs": ["7.03"], "gates_triggered": [] },
    { "id": 8, "name": "Facilitates client growth", "domain": "Cultivating learning and growth", "score": 3.0, "band": "Proficient", "evidence": "...", "subcompetency_refs": ["8.01"], "gates_triggered": [] }
  ],
  "metrics": {
    "coach_talk_time_pct_raw": 0,
    "coach_talk_time_pct_coaching_body": 0,
    "flagged_emotion_count": 0,
    "feeling_explorations": 0,
    "question_to_statement": "1:1",
    "question_to_statement_note": "telling_statements only; evocative_reflections and contracting excluded (L0.2, v0.5.3)",
    "utterance_taxonomy": { "questions": 0, "evocative_reflections": 0, "co_thinking": 0, "consultative_telling": 0, "process_logistics": 0, "contracting": 0 },
    "reflective_pauses": 0,
    "role_shifts_flagged": 0,
    "consultant_moves": {
      "count": 0,
      "unit": "envelope",
      "moves": [
        { "description": "...", "span": "50:40-53:21", "signaled": true, "permissioned": true, "brief": true, "floor_returned": true, "score": 4, "status": "green" }
      ]
    },
    "contracting_envelope": ${sn.contractingWindowOpen ? `{
      "active": true,
      "present": false,
      "substantial": false,
      "client_waiver_detected": false,
      "classification_uncertain": false,
      "quality": null,
      "envelopes": [
        { "opened_at": "00:01:40", "closed_at": "00:09:12", "covers": ["coaching_scope", "confidentiality", "journey"], "subcompetency_refs": ["3.01", "3.03"], "quality": "partnered" }
      ]
    }` : 'null'},
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
 * v0.5.3: parse the model's contracting_envelope block. The engine — never the
 * model — decides `active`: true only while the contracting window is open
 * (session 1–2, or unknown-with-observed-contracting); a confirmed session 3+
 * returns null (the bucket is inactive and the block is suppressed from the
 * scorecard entirely, spec §reporting).
 */
function parseContractingEnvelope(
  raw: any,
  sn: ReturnType<typeof sessionNumberState>
): ContractingEnvelopeBlock | null {
  if (!sn.contractingWindowOpen) return null
  if (!raw || typeof raw !== 'object') {
    // Window open but the model returned nothing (e.g. pre-v0.5.3 output): for a
    // known onboarding session report an explicit absent block; for an unknown
    // session number stay null (nothing observed, nothing to surface).
    return sn.isOnboarding
      ? {
          active: true,
          present: false,
          substantial: false,
          client_waiver_detected: false,
          quality: null,
          envelopes: [],
        }
      : null
  }
  const envelopes: ContractingEnvelope[] = (Array.isArray(raw.envelopes) ? raw.envelopes : []).map(
    (e: any) => ({
      opened_at: e?.opened_at ? String(e.opened_at) : undefined,
      closed_at: e?.closed_at ? String(e.closed_at) : undefined,
      covers: Array.isArray(e?.covers) ? e.covers.map(String) : [],
      subcompetency_refs: Array.isArray(e?.subcompetency_refs)
        ? e.subcompetency_refs.map(String)
        : [],
      quality: e?.quality === 'partnered' ? 'partnered' : 'one_directional',
    })
  )
  const present = !!raw.present || envelopes.length > 0
  // Unknown session number with no contracting observed: the window is only
  // nominally open — don't surface an empty QA block on what is most likely a
  // mid-engagement session.
  if (!sn.isOnboarding && !present) return null
  return {
    active: true,
    present,
    substantial: !!raw.substantial && present,
    client_waiver_detected: !!raw.client_waiver_detected,
    ...(raw.classification_uncertain ? { classification_uncertain: true } : {}),
    quality:
      raw.quality === 'partnered' || raw.quality === 'one_directional' ? raw.quality : null,
    envelopes,
  }
}

/**
 * Recompute the mechanical parts of the metrics block so the spec's rules are
 * guaranteed, not merely requested. Leaves judgment-only fields (q:s flag,
 * counts without thresholds) as the model returned them.
 */
function enforceMetrics(raw: any, sn: ReturnType<typeof sessionNumberState>): Metrics {
  const source = raw?.source === 'unavailable' || raw?.source === 'estimated' ? raw.source : 'parsed'

  if (source === 'unavailable') {
    return {
      coach_talk_time_pct: null,
      coach_talk_time_pct_raw: null,
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
      contracting_envelope: null,
      utterance_taxonomy: null,
      attribution: undefined,
      source: 'unavailable',
    }
  }

  const contracting = parseContractingEnvelope(raw?.contracting_envelope, sn)

  // v0.5.3 dual talk-time. Raw = all coach words (legacy coach_talk_time_pct is
  // the raw figure on pre-v0.5.3 model output). Coaching-body = contracting
  // envelope excluded — the figure the 40% flag evaluates. With no active
  // contracting the two collapse to one.
  const talkRaw =
    raw?.coach_talk_time_pct_raw != null
      ? Number(raw.coach_talk_time_pct_raw)
      : raw?.coach_talk_time_pct == null
      ? null
      : Number(raw.coach_talk_time_pct)
  const talkBody =
    contracting?.present && raw?.coach_talk_time_pct_coaching_body != null
      ? Number(raw.coach_talk_time_pct_coaching_body)
      : talkRaw
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
      // v0.5.2: the envelope's approximate transcript span, when the model reports it.
      span: m?.span ? String(m.span) : undefined,
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

  // v0.5 A2: utterance taxonomy (+ v0.5.3 contracting bucket)
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
        contracting: rawTaxonomy.contracting == null ? null : Number(rawTaxonomy.contracting),
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
    // v0.5.3 §7: coach_talk_time_pct is the coaching-body figure (contracting
    // excluded) — the 40% flag evaluates it; the raw figure rides alongside.
    coach_talk_time_pct: talkBody,
    coach_talk_time_pct_raw: talkRaw,
    coach_talk_time_flag: talkTimeFlag(talkBody),
    flagged_emotion_count: emotion,
    flagged_emotion_flag: emotionFlag(emotion),
    feeling_explorations: explorations,
    feeling_explorations_flag: explorationFlag(explorations),
    question_to_statement: raw?.question_to_statement ?? null,
    question_to_statement_flag: questionStatementFlag(raw?.question_to_statement),
    question_to_statement_note:
      typeof raw?.question_to_statement_note === 'string' && raw.question_to_statement_note.trim()
        ? raw.question_to_statement_note.trim()
        : 'telling_statements only; evocative_reflections and contracting excluded (L0.2, v0.5.3)',
    reflective_pauses: raw?.reflective_pauses == null ? null : Number(raw.reflective_pauses),
    role_shifts_flagged: raw?.role_shifts_flagged == null ? null : Number(raw.role_shifts_flagged),
    consultant_moves: {
      count,
      unit: 'envelope',
      count_flag: countFlag,
      execution_flag: executionFlag,
      caps_c2: false,
      note: count > 3 ? 'pattern to watch — count no longer scores C2 down' : '',
      moves,
    },
    contracting_envelope: contracting,
    utterance_taxonomy: utteranceTaxonomy,
    attribution,
    source,
  }
}

// v0.5.2 L0.3 — verbatim evidence verification.
// Normalize for whitespace and casing ONLY (the spec's allowed normalizations),
// so a quoted evidence string can be checked as a literal substring of the source.
function normalizeForVerbatim(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’“”]/g, "'") // curly quotes → straight (cosmetic, not content)
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Pull every quoted span out of a free-text note. Matches straight and curly
 * double quotes. Used to verify quotes embedded in competency evidence notes,
 * not just the dedicated evidence_moments quotes.
 */
function extractQuotedSpans(text: string): string[] {
  const out: string[] = []
  const re = /["“]([^"“”]{6,})["”]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.push(m[1])
  return out
}

/**
 * True when a quoted evidence string appears verbatim in the transcript
 * (whitespace/casing-normalized). Ellipsis-elided quotes ("a … b") pass when
 * each non-trivial fragment is itself a substring — coaches routinely elide.
 */
function isVerbatim(quote: string, normalizedTranscript: string): boolean {
  const fragments = quote
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map((f) => normalizeForVerbatim(f))
    .filter((f) => f.length >= 6)
  if (fragments.length === 0) return true // nothing substantive to verify
  return fragments.every((f) => normalizedTranscript.includes(f))
}

/**
 * v0.5.2 L0.3 validation gate. Verify every quoted string in the report's
 * evidence (evidence_moments quotes + quotes embedded in competency evidence
 * notes) against the transcript. Returns pass/fail and the offending quotes.
 * Fail-loud: a miss flags the scorecard for manual review (it does not discard
 * the report — the human decides).
 */
function verifyEvidenceVerbatim(
  raw: any,
  transcript: string | undefined
): { check: 'pass' | 'fail' | 'unchecked'; misses: string[] } {
  if (!transcript || !transcript.trim()) return { check: 'unchecked', misses: [] }
  const normalized = normalizeForVerbatim(transcript)
  const quotes: string[] = []
  for (const e of Array.isArray(raw?.evidence_moments) ? raw.evidence_moments : []) {
    if (e?.quote_short) quotes.push(String(e.quote_short))
  }
  for (const c of Array.isArray(raw?.competencies) ? raw.competencies : []) {
    if (c?.evidence) quotes.push(...extractQuotedSpans(String(c.evidence)))
  }
  const misses = quotes.filter((q) => q.trim() && !isVerbatim(q, normalized))
  return { check: misses.length > 0 ? 'fail' : 'pass', misses }
}

// v0.5.2 C1 ceiling — the top score C1 may reach when the on-file consent
// infrastructure is not confirmed (verbal consent passes the gate but does not,
// by itself, reach band 4). 3.4 keeps C1 in the Proficient band, below Strong.
const C1_INFRASTRUCTURE_CEILING = 3.4

// v0.5.3 — the top score C3 may reach when a CONFIRMED session 1 shows
// substantial absence of engagement contracting (no substantial presence, no
// client waiver). "Caps C3 at band 3" implemented as a ceiling at 3.4 — the top
// of the Proficient band, same semantics as the C1 infrastructure ceiling
// (cannot reach band 4), not a punitive reset to 3.0.
const C3_S1_CONTRACTING_CEILING = 3.4

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
export function enforceRules(
  raw: any,
  ctx: ScoringContext,
  transcript?: string
): SessionReportJson {
  // Build the canonical 8-competency array from the model output, keyed by id,
  // so a missing or mis-ordered entry can't corrupt the report.
  const byId = new Map<number, any>()
  for (const c of Array.isArray(raw?.competencies) ? raw.competencies : []) {
    if (c && typeof c.id === 'number') byId.set(c.id, c)
  }

  const sn = sessionNumberState(ctx)
  const metrics = enforceMetrics(raw?.metrics, sn)
  const explorations = metrics.feeling_explorations

  // v0.5.3 — the session-1 contracting absence cap. The absence bites ONLY in
  // session 1 and ONLY on C3: no substantial contracting presence AND no
  // observed client waiver. Fail-loud: an uncertain session number SUPPRESSES
  // the cap (an attribution guess never moves a score) and instead surfaces a
  // manual-review flag when the cap would otherwise have fired.
  const contracting = metrics.contracting_envelope ?? null
  const contractingAbsent = !contracting?.present || !contracting?.substantial
  const contractingWaived = !!contracting?.client_waiver_detected
  const c3S1Cap =
    sn.sessionNumber === 1 &&
    sn.confidence === 'confirmed' &&
    contracting?.active === true &&
    contractingAbsent &&
    !contractingWaived
  // The cap would have fired but the session number is only a derivation —
  // possibly session 1 (derived 1, or unknown with onboarding content observed).
  const c3S1CapSuppressed =
    !c3S1Cap &&
    sn.confidence === 'uncertain' &&
    (sn.sessionNumber === 1 || (sn.sessionNumber == null && contracting?.active === true)) &&
    contractingAbsent &&
    !contractingWaived

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
  // v0.5.2 C1 platform-boolean precedence: observed in-session verbal consent
  // PASSES the Tier-2 gate regardless of the recording_authorized boolean. The
  // two-tier gate therefore fails ONLY when BOTH (i) no signed agreement on file
  // AND (ii) no verbal consent observed. (This subsumes the v0.5 A3 carve-out:
  // an agreement on file passes clause (i) on its own.)
  const gate1 = !agreementOnFile && !verbalConsent
  // v0.5.2 C1 ceiling: passing the gate confirms only the FLOOR. Band 4+ requires
  // the fuller ethical infrastructure CONFIRMED ON FILE — a signed agreement AND
  // recorded authorization. When either platform boolean is unset/false, cap C1
  // below band 4 even though the gate passes on verbal consent.
  const c1InfrastructureConfirmed = agreementOnFile && recordingAuthorized === true
  // v0.5 A3: an agreement on file with recording_authorized = false may still be
  // a data-capture question worth a human's eye — surface it as a manual-review
  // flag (it no longer withholds the gate, which now passes on the agreement).
  const recordingConsentNeedsConfirmation = agreementOnFile && recordingAuthorized === false
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

    // v0.5.3 session-1 contracting absence cap: a CONFIRMED first session with
    // substantial absence of engagement contracting (and no observed client
    // waiver) caps C3 at band 3 — a ceiling below band 4, like c1_ceiling.
    // Skip when Gate 2 already capped harder at band 2.
    if (def.id === 3 && c3S1Cap && !gates.includes('gate_2') && score > C3_S1_CONTRACTING_CEILING) {
      score = C3_S1_CONTRACTING_CEILING
      gates.push('c3_contracting_cap')
    }

    // v0.5.2 C1 infrastructure ceiling: when the on-file consent infrastructure
    // is not confirmed (verbal consent may pass the gate, but the signed agreement
    // + recorded authorization are not both on file), cap C1 below band 4. Skip
    // when Gate 1 already capped harder at band 2.
    if (def.id === 1 && !gate1 && !c1InfrastructureConfirmed && score > C1_INFRASTRUCTURE_CEILING) {
      score = C1_INFRASTRUCTURE_CEILING
      gates.push('c1_ceiling')
    }

    // v0.5.1 Patch 1: Gate 3 caps C6 EMOTIONAL DIMENSION only — never the composite.
    // Model must return dimensions.{emotional.score, cognitive_structural.score} as
    // raw sub-scores (no gate applied by the model). Engine caps emotional and computes:
    //   composite = max(emotionalCapped, 0.4 × emotionalCapped + 0.6 × cogRaw)
    // This ensures a strong cognitive/structural dimension materially lifts the
    // composite above the gated emotional floor without floating it up artificially
    // when both dimensions are weak.
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
        // Composite: weighted blend (cognitive favored) with emotional as floor.
        const weighted = Math.round((0.4 * emotionalCapped + 0.6 * cogRaw) * 10) / 10
        score = Math.round(Math.max(emotionalCapped, weighted) * 10) / 10
      } else if (gate3 && score > 3) {
        // Fallback: model didn't return dimensions — cap the whole score.
        // This should not happen with a well-formed v0.5.1 response; log it.
        console.warn('C6 dimensions missing in engine response — falling back to whole-score gate cap.')
        score = 3
        gates.push('gate_3')
      }
    }

    // v0.5.3, C3 only: which face(s) informed the read (validated against the
    // two allowed values) so Phase 2 never benchmarks a first-session C3
    // against a mid-engagement C3. Defaults to session_agenda when the model
    // omitted it — that face governs in all sessions.
    let faces: ('session_agenda' | 'engagement')[] | undefined
    if (def.id === 3) {
      const rawFaces = (Array.isArray(c.faces) ? c.faces : []).filter(
        (f: any): f is 'session_agenda' | 'engagement' =>
          f === 'session_agenda' || f === 'engagement'
      )
      faces = rawFaces.length > 0 ? rawFaces : ['session_agenda']
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
      faces,
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

  // v0.5.2 Layer 0 — assemble the data-integrity block. L0.1 speaker
  // reassignments come from the model (provisional, confirmed=false); L0.3
  // verbatim check runs here against the transcript; both feed a fail-loud
  // manual-review flag list alongside low-confidence attribution and the
  // recording-consent question.
  const speakerReassignments: SpeakerReassignment[] = Array.isArray(raw?.integrity?.speaker_reassignments)
    ? raw.integrity.speaker_reassignments.map((r: any) => ({
        from: String(r?.from ?? 'unknown'),
        to: String(r?.to ?? 'unknown'),
        turns: Array.isArray(r?.turns) ? r.turns.map(String) : [],
        confirmed: !!r?.confirmed,
      }))
    : []
  const verbatim = verifyEvidenceVerbatim(raw, transcript)
  const manualReviewFlags: string[] = []
  if (speakerReassignments.some((r) => !r.confirmed)) manualReviewFlags.push('speaker_reassignment_unconfirmed')
  if (verbatim.check === 'fail') manualReviewFlags.push('evidence_verbatim_failed')
  if (metrics.attribution?.confidence === 'low') manualReviewFlags.push('low_attribution_confidence')
  if (metrics.attribution?.likely_swap_flag) manualReviewFlags.push('likely_speaker_swap')
  if (recordingConsentNeedsConfirmation) manualReviewFlags.push('recording_consent_needs_confirmation')
  // v0.5.3 fail-loud: the session-1 contracting cap would have fired but the
  // session number is only a derivation — a human confirms the position in the
  // engagement instead of a guess moving the score.
  if (c3S1CapSuppressed) manualReviewFlags.push('session_number_uncertain')
  // v0.5.3 fail-loud: the contracting vs process/logistics split was unclear.
  if (contracting?.classification_uncertain) manualReviewFlags.push('contracting_classification_unclear')
  if (verbatim.misses.length > 0) {
    console.warn(
      `v0.5.2 L0.3: ${verbatim.misses.length} quoted evidence string(s) not found verbatim in the transcript — flagged for manual review.`
    )
  }
  const integrity: IntegrityBlock = {
    speaker_reassignments: speakerReassignments,
    evidence_verbatim_check: verbatim.check,
    flags_for_manual_review: manualReviewFlags,
  }

  return {
    session: {
      coach: ctx.coachName,
      client_initials: ctx.clientInitials,
      type: ctx.sessionType || '',
      session_number: ctx.sessionNumber ?? null,
      engagement_total: ctx.engagementTotal ?? null,
      session_number_confidence: sn.confidence,
      is_onboarding: sn.isOnboarding,
      date: ctx.sessionDate,
      standing_engagement: standingEngagement,
      agreement_on_file: agreementOnFile,
      agreement_gap: agreementGap,
      recording_authorized: recordingAuthorized,
      recording_consent_flag: recordingConsentFlag,
    },
    overall_score: overall,
    band: bandForScore(overall),
    integrity,
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
  return enforceRules(parsed, ctx, transcript)
}

// re-export for callers that only need the type
export { ATTUNEMENT_COMPETENCIES }
