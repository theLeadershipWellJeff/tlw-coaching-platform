# theLeadershipWell · Coaching Session Report Spec

**Specification delta: v0.5.2 → v0.5.3**  |  Owner: Dr. Jeff Holmes  |  Status: approved, build from here

This document records only the changes introduced in v0.5.3. All other sections of the spec remain as locked through v0.5.2. Read this alongside the v0.4 baseline and the intervening deltas.

**Summary of v0.5.3:** Adds a fifth Layer 0 utterance bucket — *contracting / agreement-setting* — active only in engagement sessions 1–2. Contracting is enveloped and excluded from the drift denominators (talk-time flag, question:statement, consultant-move count) so that required onboarding behavior is never scored as drift. The engagement-contracting face of Competency 3 is codified as an explicit band ladder. Absence of contracting is upside-only across the board **except session 1**, where substantial absence caps C3 at band 3. Session-number dependence is tied into the existing fail-loud regime.

---

## §Layer 0 — new utterance bucket: contracting / agreement-setting

A fifth utterance bucket joins the four established through v0.5.2 (evocative reflection, consultative telling, process/logistics, co-thinking):

**5. Contracting / agreement-setting.** Coach speech that establishes or re-establishes the *coaching engagement* itself: defining what coaching is and is not, explaining the engagement journey, setting confidentiality, roles, responsibilities, logistics, fees, duration/termination, and determining coach–client compatibility.

**Distinction from process/logistics (a required classifier split, fail-loud):**

- *Process/logistics* = within-session housekeeping (time checks, "where do you want to start today," session-agenda mechanics). Routes to nothing special.
- *Contracting* = engagement-level agreement-setting. Routes to Competency 3 (engagement face, 3.01–3.05) and, where coaching-vs-consulting scope is drawn, to 1.06.
- When the split between these two is not clear, **flag for manual confirmation rather than guess** (Layer 0 fail-loud principle).

### Activation window

The contracting bucket is **active only in engagement sessions 1 and 2.** From session 3 onward it is inactive; any engagement-contracting content appearing in session 3+ is classified as normal content and may read as drift under the standing rules. (Re-contracting under 3.12 mid-engagement is handled as ordinary C3 content, not enveloped.)

### Contracting envelope

Mirrors the consultant-move envelope architecture (v0.5.2). An envelope **opens** when the coach shifts into engagement-agreement-setting and **closes** on a return to the client's agenda, a floor-returning coaching question, or a pause after which the client resumes reflection unprompted. Utterances inside the envelope are tagged `contracting`.

---

## §7 — denominator treatment

Contracting-enveloped utterances are removed from the drift metrics so onboarding behavior cannot score the session down:

| metric | prior behavior (penalizes) | v0.5.3 treatment |
|--------|----------------------------|------------------|
| coach talk-time | all coach words; flag if > 40% | report **two figures** — raw talk-time (all words) and coaching-body talk-time (contracting envelope excluded). The 40% flag evaluates **coaching-body** only. Raw figure is always displayed, never suppressed. |
| question : statement | contracting statements inflate the statement side | contracting-bucket utterances excluded from the statement denominator (same pattern as evocative reflection, v0.5.2) |
| consultant moves | contracting reads as teaching moves; can trip the > 3 drift flag | contracting is **not** a consultant move; excluded from the count |

**Guardrail:** the carve-out is *content-scoped* (the envelope), never *session-scoped*. Genuine consultant drift inside a first session still flags normally. The raw talk-time figure remains visible so the coaching-body exclusion is transparent, not hidden.

---

## §rubric — Competency 3, engagement-contracting face (new band ladder)

C3 now has two explicit faces:

- **Session-agenda face (3.06–3.08)** — unchanged; governs C3 in all sessions. (v0.5.2: clean receipt of a clear client agenda = band 4; band 5 requires the coach to reflect the agenda back and partner on completeness.)
- **Engagement face (3.01–3.05)** — assessed *only when in scope* (sessions 1–2). Band definitions:

| score | band | definition (engagement face) |
|------:|------|------------------------------|
| 3 | Proficient | Clearly explains what coaching is / is not, roles, confidentiality, and the engagement journey. Focused, accurate, largely one-directional. |
| 4 | Strong | Partnered. Checks understanding, invites the client's questions, co-creates the agreement rather than presenting it. **Attunement standard:** focused explanation is a 3; attuned, partnered contracting is a 4. |
| 5 | Masterful | Client co-authors. They articulate back what they want, partner on measures of success and on compatibility; the coach's framing is nearly invisible. **Enablement / invisibility standard.** |

When both faces are in scope (sessions 1–2), they jointly inform the single C3 read; the weaker in-scope required face governs the ceiling. No arithmetic sub-weighting — this is a judgment read against the band definitions.

---

## §rubric — the absence asymmetry (the load-bearing rule)

| | present, well-executed | present, poorly-executed | absent |
|--|------------------------|--------------------------|--------|
| **Session 1** | enveloped out of drift denominators; positive C3 engagement-face evidence | enveloped; C3 quality read (band 3, not 4) | **caps C3 at band 3** |
| **Session 2** | enveloped; upside-only lift to C3 (e.g. 3.12 re-contracting, compatibility recheck) | enveloped; neutral | **neutral — no penalty** |
| **Session 3+** | bucket inactive; engagement-contracting reads as normal content (possible drift) | — | — |

Session 1 is the **only** cell where absence bites, and it bites **C3 only** — not the whole session, not the overall band directly (the overall moves through the standing equal-weight average).

### What clears the session-1 penalty — *substantial presence*, not full coverage

Some meaningful engagement contracting occurred (coaching scope, confidentiality, **or** agreement-setting) → penalty cleared. Completeness across 3.01–3.05 is what separates band 3 from 4/5; it is not required to clear the cap. A first session that covers scope and confidentiality but omits, say, fees is **not** capped.

**Fail-loud waiver (C1-precedence pattern).** If the transcript shows the client already understood the coaching relationship or explicitly waived contracting (e.g. an experienced coaching client, or a continuing relationship mislabeled as session 1), absence does **not** cap. Observed evidence overrides the boolean, exactly as observed verbal consent satisfies the C1 Tier-2 gate.

### Session-number dependence → fail-loud tie-in

This rule keys entirely off session number within the engagement. A first session mislabeled as session-3 would skip the expectation; a session-4 mislabeled as session-1 would wrongly cap C3. Therefore: **if session number is uncertain (roster/fuzzy-match not confident), suppress the session-1 absence penalty and flag for manual confirmation.** An attribution guess never moves a score.

---

## §reporting — coach-facing / Phase-2 QA signal

Contracting is a monitoring signal, not a standard scorecard card.

- **Sessions 1–2:** surface a coach-facing QA line — contracting present/absent, plus a partnered-vs-one-directional quality note. This is the "are my coaches contracting well" view for Phase 2 firm QA.
- **Session 3+:** suppressed entirely from the per-session scorecard.

Same pattern as consultant-move count being a coach-facing flag rather than a C2 cap (v0.5.2).

---

## §12 — data model (updated)

Add a derived `is_onboarding` flag (true for `session_number` ∈ {1, 2}) and a `contracting_envelope` object mirroring `consultant_moves`. Talk-time gains a dual figure. `session_number_confidence` carries the fail-loud state.

```json
"session": {
  "session_number": 1,
  "engagement_total": 12,
  "session_number_confidence": "confirmed",   // confirmed | uncertain → suppresses S1 cap
  "is_onboarding": true                         // derived: session_number in {1,2}
},
"metrics": {
  "coach_talk_time_pct_raw": 65,
  "coach_talk_time_pct_coaching_body": 41,      // contracting envelope excluded; flag evaluates this
  "coach_talk_time_flag": "amber",
  "question_to_statement": "...",                // contracting excluded from statement denom
  "contracting_envelope": {
    "active": true,                              // false when session_number >= 3
    "present": true,
    "substantial": true,                         // clears the S1 absence cap
    "client_waiver_detected": false,             // true → cap suppressed regardless of present
    "quality": "partnered",                      // partnered | one_directional
    "envelopes": [
      {
        "opened_at": "00:01:40",
        "closed_at": "00:09:12",
        "covers": ["coaching_scope", "confidentiality", "journey", "compatibility"],
        "subcompetency_refs": ["3.01", "3.03", "3.05", "1.06"],
        "quality": "partnered"
      }
    ]
  },
  "consultant_moves": { "...": "unchanged; contracting excluded from count" }
}
```

C3 evidence object should carry which face(s) were assessed, e.g. `"faces": ["session_agenda", "engagement"]`, so Phase 2 never benchmarks a first-session C3 against a mid-engagement C3.

---

## §calibration anchor — [PENDING]

The first-session Jeff just ran is the designated calibration anchor for the contracting bucket (as H.B. anchored consultant moves and T.S. anchored the envelope). To be populated from the transcript: contracting envelopes pulled with verbatim evidence, engagement-face C3 scored against real evidence, and the substantial-presence / cap decisions stress-tested against an actual session.

---

## §15 — version history (updated)

- **v0.5.3** — Added contracting / agreement-setting as fifth Layer 0 utterance bucket, active only in sessions 1–2, enveloped and excluded from talk-time (dual figure), question:statement, and consultant-move denominators. Codified C3 engagement-contracting face (bands 3/4/5) distinct from the session-agenda face. Absence upside-only except session 1, where substantial absence caps C3 at band 3; "substantial presence" clears the cap; experienced-client waiver as fail-loud exception. Tied session-number dependence into fail-loud regime (uncertain session number suppresses the S1 cap). Contracting reported as coach-facing/Phase-2 QA signal, suppressed from scorecard session 3+. Updated JSON data model. Calibration anchor pending first-session transcript.

*theLeadershipWell Coaching Session Report Spec · delta v0.5.2 → v0.5.3 · Dr. Jeff Holmes*
