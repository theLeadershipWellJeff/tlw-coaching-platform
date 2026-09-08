# theLeadershipWell · Coaching Session Report Spec

**Specification delta: v0.5.3 → v0.5.4**  |  Owner: Dr. Jeff Holmes  |  Status: approved, build from here  |  September 2026

This document records only the changes introduced in v0.5.4. All other sections of the spec remain as locked through v0.5.3. Read this alongside the v0.4 baseline and the intervening deltas.

**Summary of v0.5.4:** Two refinements to how consultant pull and coach questions are read.

1. **The coach's offer (closing window).** The end-of-session consulting container parked in v0.5 is now built. A **signaled** shift into advice inside the **closing window — the final 20% of the coaching session** — is a sanctioned container: the consultant envelope is still detected, still counted, and still scored on its four criteria, but from the signal to the end of the session **consulting is no longer read against Competency 2 (coaching mindset)**. Unsignaled consulting in the closing window gets no exemption.
2. **Accuracy soundings count as questions.** A restatement, summary, or fact check followed by a check on accuracy or direction ("is that right?", "did I get that right?", "like that?") is a **sounding** — a question in the Q:S numerator, never consultative telling, never a consultant-move opener, and never a "leading question."

---

## §7 — The coach's offer: the closing window (new)

### Definition

The **closing window** is the final **20%** of the coaching session by elapsed time, measured from the first to the last transcript timestamp. (A 55-minute session: the last 11 minutes. A 30-minute session: the last 6.)

A **coach's offer** is a consultant envelope (v0.5.2 unit — unchanged) whose **opening role-shift is explicitly signaled** by the coach inside the closing window. Qualifying signals are an explicit request or naming of the shift, e.g. *"may I give some advice?"*, *"can I change hats for a minute?"*, *"let me put my consultant hat on"*, *"I'd like to offer something — is that okay?"* An unsignaled slide into advice is **not** a coach's offer, wherever it falls.

### The exemption — what changes and what does not

From the signal to the end of the session, consulting is **exempt from the Competency 2 read**. Everything else stands.

| surface | v0.5.3 behavior | v0.5.4 |
|---|---|---|
| `consultant_moves.count` and the > 3 amber advisory | all envelopes | **unchanged** — coach's offers stay in the count (the quantity remains visible) |
| per-envelope four-criteria score (Signaled / Permissioned / Brief / Floor returned) | every envelope | **unchanged** — a coach's offer is still scored and displayed |
| `consultant_moves.execution_flag` | worst envelope status | computed over **non-exempt envelopes only**; a long, sanctioned closing offer failing *Brief* does not turn the session's execution flag red. Its own status still shows on the row. |
| **Competency 2 (coaching mindset)** | model reads every envelope; band text "consulting is the exception, not the back half" | **coach's offers are disregarded** in the C2 read. C2 is scored on the coaching body — everything before the signal, plus any *unsignaled* consulting anywhere. |
| question : statement | whole session | **unchanged** — consultative telling inside a coach's offer stays in the denominator (the mode read still lands on C7 and the overall, v0.5 A4) |
| coach talk-time | whole session | **unchanged** |
| C7 / C8 | — | unchanged; a coach's offer that hands authorship back is read under the v0.5 B5 offer-vs-recommendation rule as before |

**Guardrails.**

- **Signal required, not optional.** The exemption is *earned* by the signal. This keeps the container consistent with v0.5 B2 (signaling a role shift is evidence of a coaching mindset) and with the role-shift-flagging standard in §8. Unsignaled closing-window advice is scored exactly as it was in v0.5.3.
- **The window bites only from the signal.** An envelope signaled *before* the window opens is an ordinary consultant move even if it runs into the final 20%. The exemption runs from the signal to the session end, never backward.
- **Content-scoped inside a time bound.** This is the one time-scoped rule in the spec. It is still content-scoped in the sense that only *consultant envelopes* are affected — the coaching that happens in the closing window (a client-generated close, the WIN loop, action-setting) is scored as normal C3/C8 material.
- **Fail-loud on timing.** The engine — never the model — decides whether an envelope is inside the window, from the transcript timestamps. When the transcript carries no usable timestamps the model estimates position by proportion of the transcript and the report flags `closing_window_unverified` for manual confirmation whenever an exemption was applied on that estimate. When the model claims an exemption for an envelope whose signal the timestamps place *before* the window, the report flags `closing_window_timing_mismatch` — the C2 read is left as scored (it is a judgment, not arithmetic), and a human decides.

### Why the count stays

The v0.5.3 report already shows the count as a coach-facing pattern-to-watch rather than a score cap (v0.5 A4). Keeping coach's offers in the count preserves the longitudinal signal — how often the coach reaches for the advice container — while removing the penalty for using it well.

---

## §Layer 0 — accuracy soundings (new sub-type of the Question bucket)

### Definition

An **accuracy sounding** is a coach utterance that **restates, summarizes, or fact-checks the client's own material** and then **checks it back** for accuracy or direction. Typical tags: *"is that right?"*, *"did I get that right?"*, *"like that?"*, *"am I hearing that right?"*, *"is that where you want to go with this?"*, *"have I got the order right?"*

### Classification (v0.5.4 ruling)

| routes to | v0.5.4 |
|---|---|
| utterance taxonomy | **Question** (bucket 1). Counted in the Q:S **numerator**. Also recorded separately in `utterance_taxonomy.accuracy_soundings` (a sub-count of `questions`, for visibility). |
| Competency 6 | credits accurate reflection / summary (6.02, 6.03) — and, when the material checked is an emotion, it is also a **feeling reflection** for the flagged-emotion count (the v0.4 §14 example "am I hearing that right?" already reads this way) |
| Competency 3 | a sounding on *direction* ("is this where you want to go?") is agreement-tracking (3.07–3.08) |
| consultative telling / consultant moves | **never** — a sounding does not open an envelope and is not in the Q:S denominator |
| "leading question" | **not a category the rubric recognizes.** A sounding is not to be read as steering; it is the coach testing whether they heard correctly |

### The one guardrail — who is being checked?

The sounding label applies when the content being checked is **the client's** — their words, their sequence, their meaning. When the coach checks back **their own conclusion, interpretation, or advice** for ratification ("so you should probably talk to him first — does that feel right?"), the who-synthesises test (v0.4 §7.3) and the "without attachment" test (v0.5 A2) still govern: that utterance is **co-thinking or consulting**, not a sounding. The check tag must not become a laundering label for advice, exactly as co-thinking must not.

---

## §rubric — Competency 2 (text update)

Band 4 (Strong), last sentence, now reads: *"Consulting is the exception, not the back half — a **signaled coach's offer inside the closing window (final 20%) is exempt from this read** (v0.5.4)."*

New cross-competency principle, **The Coach's Offer**: *"A signaled shift into advice inside the closing window — the final 20% of the session — is a sanctioned container. The envelope is counted and scored on its four criteria, but from the signal to the session end consulting is not read against Competency 2. Unsignaled closing-window advice earns no exemption. The signal is the price of the container."*

---

## §12 — data model (updated)

```json
"metrics": {
  "utterance_taxonomy": {
    "questions": 24,
    "accuracy_soundings": 5,            // v0.5.4: sub-count of questions
    "evocative_reflections": 9,
    "co_thinking": 2,
    "consultative_telling": 11,
    "process_logistics": 3,
    "contracting": 0
  },
  "consultant_moves": {
    "count": 2,
    "unit": "envelope",
    "count_flag": "green",
    "execution_flag": "green",           // v0.5.4: non-exempt envelopes only
    "moves": [
      { "description": "...", "span": "31:10-33:02", "signaled": false, "score": 1, "status": "red", "closing_window_exempt": false },
      { "description": "...", "span": "48:30-53:21", "signaled": true, "permissioned": true, "brief": false, "floor_returned": true,
        "score": 3, "status": "amber", "closing_window_exempt": true, "signal_quote": "can I change hats for a minute?" }
    ]
  },
  "closing_window": {
    "window_pct": 20,
    "basis": "timestamps",               // timestamps | estimated | unknown
    "session_start": "00:00:12",
    "session_end": "55:02",
    "opens_at": "44:04",                 // start + 0.8 × (end − start)
    "signaled": true,
    "signal_at": "48:30",
    "signal_quote": "can I change hats for a minute?",
    "exempt_count": 1
  }
}
```

Manual-review flags added to `integrity.flags_for_manual_review`: `closing_window_unverified`, `closing_window_timing_mismatch`.

---

## §calibration — expected movement on the anchors

- **T.S. (July 2 2026).** Both envelopes sit at 50:40–53:21 of a ~55-minute session, inside the window. Both were **unsignaled**, so v0.5.4 changes nothing for T.S. — the count stays 2, execution stays red, C2 stays 3.3. This is the guardrail working: the container is earned by the signal.
- **Kevin (June 22 2026).** The closing hot-seat exercise was unflagged consulting; no exemption. Had it been signaled, C2 would have been read on the coaching body alone.
- **Sessions with a signaled closing offer.** C2 rises to whatever the coaching body earns; the count and the row are unchanged. Each competency is one eighth of the overall, so a one-band lift on C2 moves the overall by ~0.13.
- **Accuracy soundings.** Sessions where the coach's summary-plus-check was being read as telling see Q:S improve on both sides of the ratio. No band caps involved.

Anchor for the coach's-offer container: **pending** — the next session in which the coach signals a closing offer.

---

## §15 — version history (updated)

- **v0.5.4** — Built the closing-window "coach's offer" container parked in v0.5: a signaled consultant envelope inside the final 20% of the session is counted and scored but exempt from the Competency 2 read (execution flag computed over non-exempt envelopes; Q:S and talk-time unchanged). Signal required; unsignaled closing advice unchanged. Engine derives the window from transcript timestamps, fail-loud (`closing_window_unverified`, `closing_window_timing_mismatch`). Added accuracy soundings as a named sub-type of the Question bucket — counted in the Q:S numerator with a visible sub-count, never telling, never an envelope opener, never a "leading question"; the who-synthesises guardrail keeps the label off the coach's own conclusions. Updated C2 band-4 text, added The Coach's Offer principle, updated the data model.

*theLeadershipWell Coaching Session Report Spec · delta v0.5.3 → v0.5.4 · Dr. Jeff Holmes · September 2026*
