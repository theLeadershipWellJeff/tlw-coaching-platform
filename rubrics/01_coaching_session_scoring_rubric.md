# theLeadershipWell · Coaching Session Scoring Rubric

**Current version: v0.5.4** (September 2026) · Owner: Dr. Jeff Holmes · Status: live in production

This is the consolidated, current statement of the rubric the scoring engine applies to every recorded coaching session. It folds the v0.4 base spec and every delta (v0.5 → v0.5.4) into one document. The version-by-version history lives in `spec/`; this file is what the rubric *is* today.

**Where it runs.** `lib/scoring/engine.ts` (the prompt + deterministic enforcement), `lib/scoring/rubric.ts` (band definitions + named principles, rendered into this file below), `lib/scoring/store.ts` (session number, agreement state). The report UI is `app/(authenticated)/practice/[id]/SessionReportView.tsx`.

**How to change it.** Refine the rule here first, then the code follows in the same commit (see `rubrics/README.md`). The band definitions and principles between the `GENERATED` markers are rendered from `rubric.ts` by `node scripts/rubrics/render-scoring-rubric.js`; `--check` fails the build-verification if the two disagree.

---

## 1. Scope and stance

- Scores a **single executive-coaching session** against the **ICF 2025 Core Competencies** (© International Coaching Federation — referenced, not reproduced), refined by theLeadershipWell's proprietary standards.
- **ICF is the floor.** theLeadershipWell standards are layered on top and are what make the methodology proprietary.
- The engine is **rigorous and honest, not generous**: a solid PCC-level coach lands around 3 on the 5-point scale. Every score is tied to evidence in the transcript.
- **Fail-loud over guess.** Anywhere the read is uncertain (speaker roles, session number, timing, classification), the engine flags for a human rather than moving a score on a guess.
- **Required input:** a speaker-separated verbatim transcript. Without one, every conversation metric is `unavailable` and competencies are scored on content alone.

## 2. The scale

| score | band | meaning |
|---:|---|---|
| 1 | Emerging | Below competent practice. The behavior is largely absent or applied inconsistently. |
| 2 | Developing | Approaching competent practice. Present in moments, missed in others. |
| 3 | Proficient | Competent practice (around the PCC range). Reliably present and well executed. |
| 4 | Strong | Consistently skilled. Attunement to the client is visible, not just focus. |
| 5 | Masterful | Mastery (around the MCC range). Fluid, client-led, adapts to what the moment calls for. |

**Decimals (v0.5 B1).** Scores carry one decimal as *position within a band* (3.4 = proficient; 3.8 = high-proficient reaching toward strong; 4.5 = strong-high). The **band word is the unit of meaning**; the decimal is for the coach's own trend sensitivity and never travels between coaches as a precise quantity.

**Banding a score:** ≥ 4.5 Masterful · ≥ 3.5 Strong · ≥ 2.5 Proficient · ≥ 1.5 Developing · else Emerging.

**Overall** = equal-weighted mean of the eight competency scores, one decimal, then banded. Each competency is one eighth of the overall.

## 3. The eight competencies and their band definitions

The definitions below are the exact text the engine scores against and the coach reads in the report's competency expander. Generated from `lib/scoring/rubric.ts#COMPETENCY_BANDS`.

<!-- BEGIN GENERATED: bands -->
### Competency 1 — Demonstrates ethical practice

*Domain: Foundation*

| score | band | definition |
|---:|---|---|
| 1 | Emerging | Ethical obligations not met; confidentiality or role distinctions breached. |
| 2 | Developing | Partial ethical practice; no signed agreement on file AND no verbal consent to record at session open (Gate 1 — band-2 ceiling). |
| 3 | Proficient | Ethical standards met; role distinctions generally maintained; recording consent obtained (signed agreement on file, or observed verbal consent at open). Verbal consent with unset/false platform booleans lands here — the gate passes but the on-file infrastructure is not confirmed (v0.5.2 ceiling: below band 4). |
| 4 | Strong | Recording/AI consent infrastructure CONFIRMED ON FILE — a signed coaching agreement AND recorded authorization on the client record, not verbal consent alone. Role distinctions maintained throughout (ICF 1.06, 2.5). v0.5.2: observed verbal consent passes the gate but does not, by itself, reach band 4 — the platform booleans must confirm the infrastructure. |
| 5 | Masterful | Ethics woven into the coaching relationship itself — proactive, transparent, client-empowering. The client experiences the ethical stance as care, not compliance. On-file consent infrastructure fully confirmed. |

### Competency 2 — Embodies a coaching mindset

*Domain: Foundation*

| score | band | definition |
|---:|---|---|
| 1 | Emerging | Coach-centered; curiosity absent; client's choices not respected. |
| 2 | Developing | Approaching client-centeredness; frequent unsignaled consultant moves; framework-filling is the dominant mode. |
| 3 | Proficient | Generally client-centered. Signals role shifts when they occur (earns the floor). Curiosity present but process-curiosity (2.09) underdeveloped; bias toward action/frameworks (2.04) live. May supply centerpiece insight rather than evoking it. |
| 4 | Strong | Role shifts signaled, permissioned, brief, returned. Coach shows awareness of bias toward frameworks/content and actively nurtures the client's own curiosity rather than filling space. Consulting is the exception, not the back half — a SIGNALED coach's offer inside the closing window (final 20% of the session) is exempt from this read (v0.5.4). |
| 5 | Masterful | Deep mastery of 2.01, 2.04, 2.05, 2.09. Holds not-knowing with the client. Curiosity is contagious. Offers feel like the client's own discovery; consultant moves rare, surgical, indistinguishable from evocation. |

### Competency 3 — Establishes and maintains agreements

*Domain: Co-creating the relationship*

| score | band | definition |
|---:|---|---|
| 1 | Emerging | No session focus established; no engagement agreement referenced. |
| 2 | Developing | Session focus emerges without coach invitation; no named insight at close; no standing engagement agreement (Gate 2). |
| 3 | Proficient | Session-agenda face: client has an agenda; coach receives it cleanly and works it. A clear, self-evident agenda received well is a legitimate 3. Engagement face (sessions 1–2 only): clearly explains what coaching is / is not, roles, confidentiality, and the engagement journey — focused, accurate, largely one-directional. |
| 4 | Strong | Session-agenda face: coach helps refine the agenda when refinement adds value — asks around the items, sharpens outcomes, tests completeness. If the agenda already has clear outcomes and needs no refinement, clean receipt is itself band 4, not a capped 3. Coach tracks the agreement when the client shifts it mid-session. A client-generated recap/close satisfies the close at band 4 — explicit coach consolidation or coach-named closure of the loop is NOT required at band 4 and is a band-5 signal only. Engagement face (sessions 1–2 only): PARTNERED contracting — checks understanding, invites the client's questions, co-creates the agreement rather than presenting it (attunement standard: focused explanation is a 3; attuned, partnered contracting is a 4). |
| 5 | Masterful | Client manages agenda and focus largely themselves; coach nearly invisible (Invisibility Standard). Explicit coach-named closure of the agreement loop, where it serves the client, appears here (ICF 3.06, 3.08, 3.09). Engagement face (sessions 1–2 only): client CO-AUTHORS the agreement — articulates back what they want, partners on measures of success and on compatibility; the coach's framing is nearly invisible (enablement / invisibility standard). |

### Competency 4 — Cultivates trust and safety

*Domain: Co-creating the relationship*

| score | band | definition |
|---:|---|---|
| 1 | Emerging | Client does not feel safe; coach behavior undermines trust. |
| 2 | Developing | Some warmth present; trust fragile or inconsistent. |
| 3 | Proficient | Client feels safe to share; coach demonstrates consistent respect and empathy (ICF 4.04, 4.05). |
| 4 | Strong | Client shares freely and candidly, including emotionally raw content. Coach adapts to the client's style and identity. One clear qualifying trust-deepening move present (single-instance standard; ICF 4.01, 4.02, 4.05, 4.06). |
| 5 | Masterful | Client experiences the relationship itself as generative. Coach vulnerability and transparency deepen trust actively (ICF 4.06). |

### Competency 5 — Maintains presence

*Domain: Co-creating the relationship*

| score | band | definition |
|---:|---|---|
| 1 | Emerging | Coach distracted, agenda-driven, or disengaged. |
| 2 | Developing | Partial presence; coach moves away from the client's energy toward own plan. |
| 3 | Proficient | Coach is focused and tracks the conversation; picks up threads; responds to content (ICF 5.01, 5.02). |
| 4 | Strong | Coach is attuned — present to what is emerging beneath the content (emotion, energy, the unsaid). Creates space for silence. One clear qualifying attunement move present (single-instance standard; ICF 5.03, 5.06, 5.07). |
| 5 | Masterful | Coach's presence is generative. The client slows down and goes deeper because of the quality of attention in the room (ICF 5.03–5.07). |

### Competency 6 — Listens actively

*Domain: Communicating effectively*

| score | band | definition |
|---:|---|---|
| 1 | Emerging | Coach not tracking client; interrupting or redirecting without basis. |
| 2 | Developing | Surface listening; coach reflects content but misses subtext. |
| 3 | Proficient | Coach reflects and summarizes content accurately. Emotion named or mirrored at least twice. Stays focused on what the client is saying (ICF 6.02, 6.04). Scored on two dimensions: emotional (6.04) and cognitive/structural (6.01–6.03, 6.05–6.06). |
| 4 | Strong | Emotional dimension (6.04): attuned to what is beneath the content — emotion, energy, the unsaid. At least one qualifying feeling exploration present (Gate 3 caps this dimension at band 3 if absent). Cognitive/structural dimension (6.01, 6.02, 6.05, 6.06): reflects patterns, uses client's own metaphors, surfaces cross-session themes. One clear qualifying attunement move present (single-instance standard; ICF 6.03, 6.04, 6.05). |
| 5 | Masterful | Coach hears what the client cannot yet say. Reflects patterns across the session and engagement. Emotion exploration is deep, sustained, and transformative. Cross-session pattern recognition and metaphor use are second nature (ICF 6.03–6.06). |

### Competency 7 — Evokes awareness

*Domain: Communicating effectively*

| score | band | definition |
|---:|---|---|
| 1 | Emerging | Coach not evoking; advice-giving dominant. |
| 2 | Developing | Some questions present but coach-directed; insight not generated. |
| 3 | Proficient | Coach uses powerful questions; client generates awareness at process level. Coach may use reframes or metaphors (ICF 7.03, 7.04, 7.10). |
| 4 | Strong | Coach evokes awareness at system or identity level. Questions go beyond the situation to the client's patterns, values, or worldview. One clear qualifying insight present (single-instance standard; ICF 7.02, 7.03, 7.08). |
| 5 | Masterful | Any one clear instance of identity-, system-, or process-level insight that is deeply generative and fully client-owned. Coach nearly invisible (ICF 7.02, 7.08, 7.11). |

### Competency 8 — Facilitates client growth

*Domain: Cultivating learning and growth*

| score | band | definition |
|---:|---|---|
| 1 | Emerging | No closing or integration; session ends without learning consolidated. |
| 2 | Developing | Coach attempts close but insight or action is thin, coach-packaged, or absent. No return to agreed session actions (ICF 8.06 absent or weak). |
| 3 | Proficient | Coach consolidates learning at close; client names an insight. Actions may be coach-suggested (ICF 8.01, 8.06, 8.09). |
| 4 | Strong | Client generates their own insight and at least one self-authored action or commitment. An offer that crystallizes the client's own insight into concrete form — held without attachment (7.11), client free to reshape — also meets this standard. Coach partners on accountability (authorship hinge met; ICF 7.11, 8.02, 8.03). |
| 5 | Masterful | Client integrates insight into their worldview and self-generates a growth plan. Coach nearly invisible in the growth design (ICF 8.01, 8.02, 8.07). |
<!-- END GENERATED: bands -->

## 4. Named cross-competency principles (theLeadershipWell IP)

Applied across all eight competencies and cited in scoring rationale. Generated from `lib/scoring/rubric.ts#CROSS_COMPETENCY_PRINCIPLES`.

<!-- BEGIN GENERATED: principles -->
- **The Attunement Standard.** The hinge between Proficient (band 3) and Strong (band 4) for Competencies 5, 6, and 8. Focus earns a 3; attunement earns a 4.
- **The Exploration Gate.** v0.5: Zero feeling explorations caps the EMOTIONAL DIMENSION of Competency 6 at band 3 — not all of C6. The cognitive/structural dimension (6.01–6.03, 6.05–6.06) scores independently. feeling_explorations remains visible as a sub-metric. Named in the scoring output when triggered.
- **The Authorship Hinge.** For Competency 8, client-generated vs. coach-packaged actions is the hinge between bands 3 and 4. v0.5 B5: an offer that crystallizes the client's own insight — held without attachment (7.11), freely rephraseable — meets the hinge. A recommendation the coach is invested in does not.
- **The Consultant Pull Signature.** v0.5.2: a consultant move is a contiguous ENVELOPE (opened by a role-shift out of coaching mode, closed by re-contract, a floor-returning question, or a pause the client fills) — counted ONCE per envelope, not per advice-act. v0.5 A4: envelope count > 3 is a coach-facing advisory flag ("pattern to watch"), not a score-down on C2. The mode read lands on C7 and the overall via Q:S (redefined as questions:consultative-telling). When the coach perceives ~60% questions but the engine reads Q:S < 1:1, that gap is the signature of consultant pull under engagement. Execution quality (each envelope terse and floor-returned) is scored per envelope even when the count stays within coaching mode. v0.5.4: a signaled coach's offer in the closing window stays in the count and is scored, but is exempt from the C2 read (see The Coach's Offer).
- **The Coach's Offer.** v0.5.4: a SIGNALED shift into advice ("may I give some advice?", "can I change hats?") inside the closing window — the final 20% of the session by elapsed time — is a sanctioned container. The envelope is still counted and scored on its four criteria, but from the signal to the session end consulting is NOT read against Competency 2 (coaching mindset). Unsignaled closing-window advice earns no exemption; an envelope signaled BEFORE the window opens is an ordinary consultant move even if it runs to the end. The signal is the price of the container. Q:S and talk-time are unchanged — the mode read still lands on C7 and the overall.
- **The Accuracy Sounding.** v0.5.4: a restatement, summary, or fact-check of the CLIENT'S material followed by a check on accuracy or direction ("is that right?", "did I get that right?", "like that?", "is this where you want to go?") is a QUESTION — counted in the Q:S numerator (sub-count accuracy_soundings), credited to C6 (6.02/6.03) and, on emotion, to the flagged-emotion count. NEVER consultative telling, NEVER a consultant-move opener, and NOT a "leading question" (a category the rubric does not recognize). Guardrail: when the content checked is the coach's OWN conclusion or advice offered for ratification, the who-synthesises test governs — that is co-thinking or consulting, not a sounding. The check tag must not launder advice.
- **The Co-thinking / Consulting Boundary.** v0.5 A2: co-thinking builds on the client's own material, offered tentatively for the client to react to, WITHOUT attachment to adoption (7.11). It is excluded from consultant-move count and Q:S denominator. When attachment is present or signaling/invitation is absent, classify as consulting. Co-thinking must not become a laundering label for advice — when in doubt, default to consulting.
<!-- END GENERATED: principles -->

**Standards that sit alongside the principles**

- **Attunement Standard** (C5, C6, C8): focus earns a 3; attunement — visible responsiveness to what is emerging beneath the content — earns a 4.
- **Single-instance standard** (C4, C5, C6, C7): one clear qualifying band-4 move is sufficient to reach band 4.
- **Invisibility / enablement standard** (band 5 across C3, C7, C8): the coach becomes nearly invisible as the client does the deeper work.
- **Coaching / counseling boundary (1.06):** crossed only by wound-repair attempts, diagnostic language, or a sustained therapeutic frame. Psychological depth, emotional exploration, and third-party analysis are coaching. When in doubt, do not flag.

## 5. Layer 0 — data integrity (runs before any scoring; all fail-loud)

| rule | what it does | flag |
|---|---|---|
| **A1 · Speaker attribution** | Map numbered speakers to coach/client by session structure (the coach holds the open/close frame and manages logistics), never by diarization order. A single speaker holding the frame *and* the majority of talk-time raises a likely-swap flag. Low confidence → metrics are not trusted. | `low_attribution_confidence`, `likely_speaker_swap` |
| **L0.1 · Phantom-speaker collapse** | A label in < 5% of turns (or < 3 turns) is a candidate mis-attribution, reassigned to the nearest primary speaker by register — provisionally. | `speaker_reassignment_unconfirmed` |
| **L0.2 · Classification precedes the ratio** | Every coach utterance is bucketed (§6) *before* question:statement is computed. Only consultative/telling statements enter the denominator. | — |
| **L0.3 · Evidence is verbatim** | Every quoted evidence string (evidence moments, quotes inside competency evidence, the closing-window signal quote) must be a literal transcript substring (whitespace/case-normalized; elided quotes pass fragment by fragment). | `evidence_verbatim_failed` |

## 6. Coach-utterance taxonomy (v0.5 A2, extended v0.5.3 and v0.5.4)

Every coach utterance is classified into exactly one bucket **by function, not grammatical form**.

| bucket | what it is | counts where |
|---|---|---|
| **1. Question** | Interrogative that evokes client thinking (C7). **Includes accuracy soundings** (below). | Q:S numerator |
| **2. Evocative reflection / observation** | Reflects, summarizes, reframes, or shares an observation to create insight (6.02, 7.10, 7.11). | Credits C6/C7. Out of the Q:S denominator and the consultant-move count. |
| **3. Co-thinking** | Builds on the client's own material, offered tentatively, **without attachment** to adoption (7.11). | Excluded from the consultant-move count. Flagged for coach visibility. |
| **4. Consultative / telling** | Advice, framework, or answer the coach supplies and is invested in. | **The Q:S denominator.** Input to the consultant-move count. |
| **5. Process / logistics** | Within-session housekeeping: time checks, "where do you want to start," scheduling, tech. | Neutral; excluded everywhere. |
| **6. Contracting / agreement-setting** (sessions 1–2 only) | Engagement-level agreement-setting: what coaching is/isn't, roles, confidentiality, journey, fees, compatibility. | Routes to C3's engagement face and 1.06. Out of the Q:S denominator, never a consultant move. |

**Accuracy sounding (v0.5.4, a named sub-type of Question).** A restatement, summary, or fact-check of the **client's** material followed by a check on accuracy or direction — "is that right?", "did I get that right?", "like that?", "am I hearing that right?", "is this where you want to go?". Counted as a **question** (Q:S numerator; visible sub-count `accuracy_soundings`), credits C6 (6.02/6.03), and is a feeling reflection when the material checked is an emotion. Never consultative telling, never a consultant-move opener, and **not a "leading question"** — the rubric has no such category. *Guardrail:* when the content being checked is the coach's own conclusion or advice offered for ratification, the who-synthesises test governs: that is co-thinking or consulting.

**Co-thinking vs. consulting — the governing test (ICF 7.11 "without attachment").** Built on the client's own material → toward co-thinking. Offered tentatively, client invited to react/reshape/reject → toward co-thinking. Signaled ("I'm thinking alongside you") → toward co-thinking. Coach attached to adoption → **consulting**, regardless of framing. When in doubt, default to consulting and flag. Co-thinking must not become a laundering label for advice.

**Question : statement** = `questions : consultative_telling`. Evocative reflections, co-thinking, process, and contracting are out of the denominator.

## 7. Conversation metrics and thresholds

| # | metric | definition | threshold |
|---|---|---|---|
| 1 | Coach talk-time | % of words spoken by the coach. **Dual figure (v0.5.3):** raw (all words, always shown) and coaching-body (contracting envelope excluded — what the flag evaluates). | 🔴 red > 40% |
| 2 | Flagged emotion (6.04) | Coach moves that tune into client emotion (§8). | 🔴 < 2 · 🟡 = 2 · 🟢 > 2 |
| 3 | Feeling explorations | Moves that stay with an emotion and deepen into origin, meaning, function, or cost. | 🔴 0 (Gate 3) · 🟡 1 · 🟢 ≥ 2 |
| 4 | Question : statement | Questions : consultative-telling statements (§6). | 🟢 questions lead · 🔴 parity or statements lead |
| 5 | Reflective pauses | Deliberate silences the coach creates. | count only |
| 6 | Role shifts flagged | Times the coach explicitly named a shift out of the coaching role. | count only |
| 7 | Consultant moves | Envelopes (§9), each scored on four criteria. | see §9 |

## 8. Emotion-move classification (three-way; the most common scoring error)

| move | definition | scoring |
|---|---|---|
| **Feeling reflection** | Coach names, mirrors, or reflects the client's emotion ("I'm hearing frustration"; "am I hearing that right?"). | Flagged-emotion event. Not an exploration. |
| **Coping inquiry** | Coach asks how the client is managing the emotion ("how are you dealing with that?"). Redirects away from the feeling. | Neither an exploration nor a flagged-emotion event. |
| **Feeling exploration** | Coach stays with the emotion and asks into its origin, meaning, function, or cost ("what is that costing you?"). | Qualifying exploration and flagged-emotion event. Required for C6's emotional dimension at band 4+. |

Four flagged-emotion triggers: naming a feeling observed; asking a feeling question; reflecting an energy shift; mirroring the coach's own felt response *only when it hands the emotion back to the client*.

## 9. Consultant moves

**The unit is an envelope (v0.5.2).** A consultant move is a contiguous envelope, not a single statement. It **opens** at a role-shift out of coaching mode (consulting, teaching, mentoring, framework-offering, spiritual direction), signaled or not. It **closes** on any of: an explicit re-contract; a floor-returning coaching question; a pause after which the client returns to reflection unprompted. Everything between is **one** move; each carries a span.

**Four criteria, scored per envelope (0–4):** Signaled (the opening role-shift was named) · Permissioned (the client agreed before it proceeded) · Brief (the whole envelope is terse; long envelopes fail this even when they pass the other three) · Floor returned (a close signal actually occurred).

| condition | status |
|---|---|
| envelope scores 0–2 | 🔴 poor execution |
| envelope scores 3 | 🟡 acceptable — watch the pattern |
| envelope scores 4 | 🟢 well executed |
| envelope count > 3 | 🟡 **advisory** ("pattern to watch") — **not** a cap on C2 (v0.5 A4). The mode read lands on C7 and the overall through Q:S. |

**Evocative reframe vs. consultant move — the who-synthesises test.** If the client performs the final synthesis, it is evocation (C7). If the coach delivers advice, a framework, or a directive conclusion without the client synthesising, it is a consultant move regardless of warmth or outcome. Direct advice with no signal = unsignaled move, 1–2/4, red.

**The coach's offer — the closing window (v0.5.4).** The closing window is the final **20%** of the session by elapsed time (first transcript timestamp to last). A consultant envelope whose role-shift is **signaled** inside it ("may I give some advice?", "can I change hats for a minute?") is a sanctioned container:

- it **stays in the count** and is **still scored** on the four criteria and listed on the report;
- from the signal to the session end, consulting is **not read against Competency 2**;
- the session `execution_flag` reads non-exempt envelopes only (the offer's own row status still shows);
- Q:S and talk-time are **unchanged**;
- unsignaled closing advice earns nothing; a signal given *before* the window opens earns nothing; once a signal lands inside the window, later envelopes are covered by it.

The engine derives the window from the transcript's own timestamps and verifies every exemption: a claim the timestamps contradict is revoked on the row and flagged `closing_window_timing_mismatch`; with no usable timestamps the estimate is honored and flagged `closing_window_unverified`. The signal is the price of the container.

## 10. Contracting (engagement sessions 1–2 only; v0.5.3)

- **Envelope.** Mirrors the consultant-move envelope: opens when the coach shifts into engagement-agreement-setting, closes on a return to the client's agenda, a floor-returning question, or a client-filled pause.
- **Denominator treatment.** Contracting leaves the coaching-body talk-time, the Q:S denominator, and the consultant-move count. The carve-out is content-scoped (the envelope), never session-scoped — genuine consultant drift in a first session still flags.
- **C3 has two faces.** Session-agenda (3.06–3.08, all sessions) and engagement-contracting (3.01–3.05, sessions 1–2; bands 3/4/5 = focused one-directional / partnered / client co-authors). When both are in scope, the weaker governs the ceiling — a judgment read, no arithmetic sub-weighting.
- **The absence asymmetry.** Absence of contracting is upside-only in every cell except a **confirmed session 1**, where substantial absence caps C3 below band 4 (ceiling 3.4). *Substantial presence* (coaching scope, confidentiality, **or** agreement-setting — not full coverage) clears it. An observed client waiver or prior understanding waives it. An **uncertain session number suppresses it** and flags `session_number_uncertain`.
- Session 3+: the bucket is inactive; engagement-contracting content reads as normal content. Reported as a coach-facing QA line in sessions 1–2 only.

## 11. Gates and ceilings (enforced in code, authoritative over the model)

| gate / ceiling | condition | competency | ceiling |
|---|---|---|---|
| **Gate 1** | No signed agreement on file **and** no observed verbal consent to record at session open | C1 | band 2 |
| **C1 infrastructure ceiling** (v0.5.2) | Gate passes, but the on-file infrastructure is not confirmed (signed agreement **and** recorded authorization both on the client record) | C1 | 3.4 |
| **Gate 2** | No client-named insight at close **and** no standing engagement | C3 | band 2 |
| **C3 contracting cap** (v0.5.3) | Confirmed session 1, substantial absence of contracting, no client waiver | C3 | 3.4 |
| **Gate 3** | Zero feeling explorations | C6 **emotional dimension only** | band 3 |

**Gate 1 precedence (v0.5.2).** Observed in-session verbal consent passes the gate regardless of the platform booleans; the gate fails only when both an agreement and verbal consent are absent. An agreement on file with recording marked declined raises `recording_consent_needs_confirmation` for a human rather than silently capping. No agreement on file also surfaces `agreement_gap` as an administrative follow-up (no extra penalty).

**C6 composite (v0.5.1).** C6 is scored on two dimensions — emotional (6.04) and cognitive/structural (6.01, 6.02, 6.03, 6.05, 6.06). Gate 3 caps the emotional dimension only. `composite = max(emotionalCapped, 0.4 × emotionalCapped + 0.6 × cognitive_structural)`. `feeling_explorations` stays visible as a sub-metric even when the composite rises.

## 12. Fail-loud manual-review flags

`speaker_reassignment_unconfirmed` · `evidence_verbatim_failed` · `low_attribution_confidence` · `likely_speaker_swap` · `recording_consent_needs_confirmation` · `session_number_uncertain` · `contracting_classification_unclear` · `closing_window_unverified` · `closing_window_timing_mismatch`. Each is surfaced on the report with fix-it guidance and can be marked reviewed; a rescore resets them.

## 13. WIN debrief (coach-owned)

Structurally separate from the machine scores. **What went well** (generate via "what else?" until exhausted) · **Improve — one thing** · **Next step** — one concrete behavioral practice for the next session. The coach self-scores **before** seeing the machine report; the self-score never overwrites the machine score.

## 14. Calibration anchors

| session | version | what it anchored |
|---|---|---|
| K.V. | v0.2 | Feeling exploration vs. reflection; Gate 3 |
| H.B. | v0.3 | Consultant-move sub-rubric; two moves at 3/4 amber |
| Unnamed, June 2026 | v0.4 | C1 disclosure; Gate 2 revision; coping inquiry; evocation vs. consultant move |
| Kevin (CEO), June 22 2026 | v0.5 | Attribution integrity; four-bucket taxonomy; C3/C6/C8 refinements (engine 2.8 → reconciled ~3.7) |
| Fernando / PDI, June 23 2026 | v0.5.1 | C6 composite wiring; C3 band-4 clarifying clause |
| T.S., July 2 2026 | v0.5.2 | The envelope unit (7 → 2 moves); C1 platform-boolean precedence |
| Jeff's first session (pending) | v0.5.3 | Contracting bucket |
| First signaled closing offer (pending) | v0.5.4 | The coach's offer container |

Calibration learning carried into Phase 2: self-scoring inflates on development edges; weight blind/machine scores more heavily on a coach's flagged edges.

## 15. Version history (one line each; full deltas in `spec/`)

- **v0.1–v0.4** — Baseline; feeling explorations (Gate 3); consultant moves; consolidated band definitions for all eight competencies; two-tier disclosure gate (v0.4.1).
- **v0.5** — Attribution integrity; four-bucket taxonomy and Q:S redefinition; count > 3 becomes advisory; decimals; signaled role shift earns C2 credit; C6 dimensional split; C3 agenda logic; C8 offer vs. recommendation.
- **v0.5.1** — C6 composite formula; C3 band-4 clarifying clause.
- **v0.5.2** — Layer 0 integrity gates; the envelope unit; C1 platform-boolean precedence and 3.4 ceiling.
- **v0.5.3** — Contracting bucket and envelope; C3 two faces; session-1 absence cap; session-number fail-loud.
- **v0.5.4** — The coach's offer (closing window, signaled, exempt from C2); accuracy soundings count as questions.

## 16. Open questions (for future calibration)

- Question:statement parity currently red; may be revised to amber as data accumulates.
- Thresholds for reflective pauses and role-shift counts (counts only today).
- Whether the closing window should be a fixed proportion (20%) or scale with session length below 30 minutes.
- Talk-time threshold re-anchoring against the coach's own strongest sessions.
