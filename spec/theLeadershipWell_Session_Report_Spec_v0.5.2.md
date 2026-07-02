# theLeadershipWell — Coaching Session Report Spec
**Specification delta: v0.5.1 → v0.5.2**  ·  Owner: Dr. Jeff Holmes  ·  Status: approved, build from here

This document records only the changes introduced in v0.5.2. All other sections of the spec remain as locked in v0.5.1. Read this alongside the v0.5.1 baseline.

The trigger for this delta was the **T.S. session (July 2, 2026)** calibration reconciliation, in which the app (3.1), the blind engine (3.4), and coach self-score (4.0) diverged. Root-cause analysis found that **almost the entire competency spread traced to a single undefined unit** (the consultant "move") plus two upstream data-integrity bugs. This delta fixes the unit, the bugs, and one C1 gate ambiguity.

> **Confirm-against-baseline flags (resolved during implementation).** (a) The consultant-moves metric is metric **7** in the current conversation-metrics grid (`lib/scoring/engine.ts#enforceMetrics`, rendered in `SessionReportView#ConversationMetrics`). (b) The C1 disclosure-gate language lives in `lib/scoring/rubric.ts` (`COMPETENCY_BANDS[1]`) and `lib/scoring/engine.ts` (the "AI / RECORDING DISCLOSURE" prompt block + the `gate1` computation in `enforceRules`).

---

## §Engine — Layer 0: data integrity (new, precedes all scoring)

Three integrity rules that run **before** any metric is computed or any competency is scored. All three are **fail-loud** (flag for manual confirmation rather than silently proceed). Implemented across the engine prompt (model-side detection) and `enforceRules` (code-side enforcement); results carried in the report's top-level `integrity` block.

### L0.1 — Speaker mis-attribution collapse
A speaker label appearing in fewer than **5% of turns** (or fewer than 3 turns total, whichever is larger) is a **candidate mis-attribution**. Each such turn is reassigned to the nearest primary speaker by content/role consistency (question cadence / reflective register → coach; narrative / self-disclosure → client). **Fail-loud:** every reassignment is recorded in `integrity.speaker_reassignments` with `confirmed:false` and surfaces `speaker_reassignment_unconfirmed` in `flags_for_manual_review` — never silently merged.

### L0.2 — Utterance classification precedes the ratio
Every coach utterance is classified into its bucket **before** `question_to_statement` is computed. Only **telling/consultative statements** count toward the denominator; **evocative reflections are excluded** (evocation, not telling). This was already the v0.5 A2 mechanism; v0.5.2 makes the ordering explicit and adds `metrics.question_to_statement_note` as the visible reminder.

### L0.3 — Evidence strings must be verbatim
Every string presented inside quotation marks in an evidence note MUST be a **literal substring of the source transcript** (normalized for whitespace and casing only). Unquoted characterization in the engine's own words is fine. **Validation gate:** `enforceRules` re-verifies every quoted string (`evidence_moments[].quote_short` + quotes embedded in competency `evidence`) against the transcript; on any miss it sets `integrity.evidence_verbatim_check = "fail"` and flags `evidence_verbatim_failed` for manual review (the report is not discarded — a human decides). Ellipsis-elided quotes pass when each non-trivial fragment is itself a substring.

---

## §7 — Consultant moves: the move is an *envelope*, not a statement (redefines the unit)

**Locked definition.** A **consultant move is a contiguous envelope**, not a single statement or advice-act.

- An envelope **opens** at a role-shift out of coaching mode (into consulting, teaching, mentoring, framework-offering, or spiritual direction) — signaled or unsignaled.
- An envelope **closes** at the coach's return to coaching mode, evidenced by **any** of: (a) explicit re-contract; (b) a floor-returning coaching question; (c) a pause after which the client returns to reflection unprompted.
- **Everything between open and close is ONE move.** The count increments **once per envelope**.

Each move carries a `span` (approximate transcript timespan). The four criteria (Signaled / Permissioned / Brief / Floor returned) are evaluated at **envelope scope** — envelopes tend to fail *Brief* even when they pass the other three.

**Threshold logic** (unchanged, now counting envelopes): envelope scoring 0–2 → 🔴; 3 → 🟡; 4 → 🟢. Per v0.5 A4 (preserved), envelope **count > 3 is an amber advisory flag** ("pattern to watch"), **not** a red cap on C2 — `caps_c2` stays `false`; the mode read lands on C7/overall via Q:S. Execution quality is scored per envelope regardless of the count, so the "consultant pull dominates the back half" finding survives via the red **execution** flag.

**Consequence for T.S.:** under the envelope rule the session is **2 moves, not 7**. The count-drift flag does not fire. Both envelopes score red on execution (the *Brief* criterion is the consistent failure).

---

## §rubric — Competency 1: platform-boolean precedence (new rule)

**Locked rule.**
- **Observed in-session verbal consent to record satisfies the Tier-2 disclosure gate regardless of the `recording_authorized` boolean value.** The two-tier gate **fails only when both** (i) no signed agreement on file **and** (ii) no verbal consent observed. Implemented as `gate1 = !agreementOnFile && !verbalConsent`.
- **However**, unset/false platform booleans **cap the C1 ceiling below band 4.** Band 4 requires the fuller ethical infrastructure **confirmed on file** — a signed agreement **and** recorded authorization (`c1InfrastructureConfirmed = agreementOnFile && recordingAuthorized === true`). When not confirmed, C1 is capped at **3.4** (top of Proficient), tagged `c1_ceiling` on the competency.

**Consequence for T.S.:** gate passes on verbal consent; ceiling capped by unset booleans → **C1 lands 3.0–3.2** (within the 3.4 ceiling), not 3.5–3.9.

---

## §12 — Data model (updated)

The report gains a top-level `integrity` block; `consultant_moves` carries `unit: "envelope"` and per-move `span`; `metrics` carries `question_to_statement_note`.

```json
"integrity": {
  "speaker_reassignments": [
    { "from": "Speaker 3", "to": "coach", "turns": ["48:45"], "confirmed": false }
  ],
  "evidence_verbatim_check": "pass",
  "flags_for_manual_review": ["speaker_reassignment_unconfirmed"]
},
"metrics": {
  "question_to_statement": "1:1",
  "question_to_statement_note": "telling_statements only; evocative_reflections excluded (L0.2)",
  "consultant_moves": {
    "count": 2,
    "unit": "envelope",
    "moves": [
      { "label": "negotiation / budget / board-access advice", "span": "50:40-53:21",
        "signaled": false, "permissioned": false, "brief": false, "floor_returned": true,
        "score": 1, "status": "red" }
    ],
    "count_flag": "green",
    "execution_flag": "red"
  }
}
```

---

## T.S. session — calibration anchor (July 2, 2026)

| # | competency | app | blind | self | **reconciled** | driver |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Demonstrates ethical practice | 3.0 | 3.5 | 3.9 | **3.2** | Verbal consent passes gate; unset booleans cap <4 |
| 2 | Embodies a coaching mindset | 2.8 | 3.0 | 4.2 | **3.3** | Envelope fix lifts app off the false drift flag |
| 3 | Establishes & maintains agreements | 3.2 | 3.0 | 3.0 | **3.1** | Convergence |
| 4 | Cultivates trust & safety | 3.4 | 4.0 | 4.5 | **4.0** | App over-docked for the anecdote |
| 5 | Maintains presence | 3.0 | 3.5 | 4.3 | **3.4** | Envelope fix helps; anecdote is a real lapse |
| 6 | Listens actively | 3.4 | 3.5 | 4.3 | **3.4** | Cognitive ~4; emotional gated at 3 |
| 7 | Evokes awareness | 3.0 | 3.5 | 4.3 | **3.5** | Trilemma is a true qualifying move |
| 8 | Facilitates client growth | 3.2 | 3.0 | 3.2 | **3.2** | Convergence |
| | **overall** | **3.1** | **3.4** | **4.0** | **~3.4** | |

**Calibration learning (carried into Phase 2):** self-scoring inflates on development edges — weight blind/machine scores more heavily on a coach's flagged edges in the multi-coach platform.

---

## §15 — Version history (updated)

- **v0.5.1** — [as previously locked]
- **v0.5.2** — Added §Engine Layer 0 data-integrity gates (L0.1 speaker mis-attribution collapse, L0.2 utterance classification precedes ratio, L0.3 verbatim-evidence requirement), all fail-loud. Redefined the consultant-move **unit as a contiguous envelope**; count increments once per envelope, each carries a span; count>3 stays an amber advisory (v0.5 A4), execution scored per envelope. Added C1 **platform-boolean precedence rule** (observed verbal consent passes the Tier-2 gate; unset/false booleans cap the ceiling at 3.4, below band 4). Updated §12 data model with the `integrity` block, envelope-scoped `consultant_moves`, and `question_to_statement_note`. T.S. session documented as calibration anchor.

*theLeadershipWell Coaching Session Report Spec · delta v0.5.1 → v0.5.2 · Dr. Jeff Holmes · July 2026*
