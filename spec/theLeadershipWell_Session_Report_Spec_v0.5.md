# theLeadershipWell — Coaching Session Report Spec
**Specification delta: v0.4 → v0.5**  ·  Owner: Dr. Jeff Holmes  ·  Status: approved, build from here  ·  June 2026

This document records only the changes introduced in v0.5. All other sections of the spec remain as locked in v0.4 (`spec/theLeadershipWell_Session_Report_Spec_v0.4.md` is the single source of truth). Read this alongside the v0.4 baseline.

v0.5 was calibrated against the **Kevin (CEO) session**, June 22 2026. That session exposed two engine defects, one metadata-capture defect, and three rubric refinements. The engine produced an overall of 2.8; blind reconciliation with the coach's self-scores landed the true session at **~3.7 (Strong, low band)**. Almost the entire gap was defect-driven, not rubric severity. This delta closes the defects and formalizes the refinements.

Changes are grouped into two parts so they route to the right files:

- **Part A — Engine fixes** (`lib/scoring/engine.ts`, pre-scoring pipeline, metrics block). These correct *how the session is read*, not how it is judged.
- **Part B — Rubric refinements** (`lib/scoring/rubric.ts`, `COMPETENCY_BANDS`). These adjust band definitions and scoring logic.

A defect is something the engine got *wrong*. A refinement is something the rubric should judge *differently*. Code should treat these categories differently: Part A is bug-fixing; Part B is intentional methodology change with version history.

---

# PART A — ENGINE FIXES

## A1 · Speaker-attribution integrity step (pre-scoring, fail-loud)

**Defect.** Plaud transcripts carry numbered diarization (`Speaker 1`, `Speaker 2`, …), not role-mapped diarization. The engine assumed the numbering mapped reliably to coach/client. In the Kevin session this inverted large stretches: the client spends much of the session coaching his own report (Dennis), so his strategic questions, diagnostic statements, and reframes were attributed to the coach. Every downstream metric corrupted:
- talk-time read **52%** vs. true **~30%** (a 22-point swing — the misattributed client lines)
- Q:S read **1:3** vs. true **~1:1.1**
- consultant moves read **6** vs. true **~4**

This single defect dragged C2 to a 2.0 whose own rationale cited the corrupted talk-time and move count.

**Fix.** Add a **role-mapping integrity step before any scoring runs.**

1. Map numbered speakers → roles (`coach` / `client`) using session-structure signals, not diarization order:
   - The coach is the speaker who opens and closes with the evaluation/agenda frame (the WIN loop: "what went well," "what would you improve," "what's the action," "what's your insight").
   - The coach is the speaker who manages session logistics (scheduling the next session, "let me save this").
2. **Sanity check — likely-swap flag.** If a single speaker holds *both* the session-open and session-close coaching frame **and** is credited with the majority of talk-time, raise a likely-swap flag (a coach normally holds the frame while talking *less*).
3. **Fail loud.** If role-mapping confidence is below threshold, **do not guess.** Emit `attribution_confidence: "low"` and flag the session for manual role confirmation before scores are trusted. This is the confirmed fail-loud-on-low-confidence design principle applied to attribution.
4. **Input preference.** Where a speaker-separated verbatim transcript exists (Zoom VTT), prefer it. Treat Plaud numbered diarization as *always* requiring this integrity step.

**Nested-coaching attribution test (regression case).** The Kevin session is the canonical test: a client who spends session time coaching a third party (Dennis). The matcher must not attribute the client's "what move would you make" / "let's define the culture" language to the coach. Add this transcript as a fixture; the integrity step passes only if the client's Dennis-directed coaching stays attributed to the client.

---

## A2 · Coach-utterance taxonomy — four buckets (replaces binary question-vs-statement)

**Defect.** A naive question-vs-statement counter treated every non-question coach utterance as a "statement," which (a) buckets evocative reflections and reframes as if they were telling, stripping C6/C7 credit, and (b) inflates both the statement side of Q:S and the consultant-move count. In the Kevin session, "so much of how he operates is around positional power — that's his baked-in operating system" is declarative in *form* but evocative in *function* (a 7.10/7.11 reframe); the counter scored it as telling.

**Fix.** Classify every coach utterance into **four buckets** by function, not grammatical form:

| bucket | what it is | ICF anchor | counts where |
|---|---|---|---|
| **Question** | interrogative that evokes | C7 | numerator of Q:S |
| **Evocative reflection / observation** | reflects, summarizes, reframes, or shares an observation to create insight | 6.02, 7.10, 7.11 | credits C6/C7; **excluded** from Q:S denominator and from consultant-move count |
| **Co-thinking** | builds on the client's own material, offered tentatively for the client to react to/build on, **without attachment to adoption** | 7.11 | neutral-to-positive; **excluded** from consultant-move count; **flagged** for coach visibility (see A4) |
| **Consultative / telling** | advice, framework, or answer the coach supplies and is invested in | — | the **real** Q:S denominator; the input to consultant-move count |
| **Process / logistics** | scheduling, "let me save this," housekeeping | — | neutral; excluded everywhere |

**Q:S is redefined** as `questions : consultative-telling-statements` — not questions : all-non-questions. Evocative reflection, co-thinking, and process utterances are out of the denominator.

### The co-thinking / consulting boundary — the governing test

Co-thinking and consulting look similar on the surface. The line is **ICF 7.11's "without attachment."** Apply this test:
- Built on the client's own prior material (their words, metaphors, patterns surfaced in this or a prior session)? → toward co-thinking
- Offered tentatively, client explicitly invited to react, reshape, or reject? → toward co-thinking
- Coach signaled it ("now I'm thinking along with you")? → toward co-thinking
- **Coach attached to the client adopting it?** → that's **consulting**, regardless of how it's framed

If attachment is present or signaling/invitation is absent, classify as consultative/telling. **Co-thinking must not become a laundering label for advice.** When confidence between co-thinking and consulting is low, default to consulting (the more conservative read) and flag.

---

## A3 · Metadata fail-loud on recording consent

**Defect.** The Kevin session carried `recording_authorized = false`. Gate 1 (v0.4.1, two-tier disclosure) fired correctly *on that input* and capped C1 at band 2. But the input was wrong: recording **was** verbally authorized; the session was cut off before the consent was logged. A single false-default metadata field cost two full bands on C1 (true 4.5 vs. capped 2.0) — the largest single number in the engine-vs-coach gap.

**Critical:** Gate 1 itself is **working as designed.** The recording-consent branch of the C1 gate must **not** be reclassified as a defect or softened. The defect is upstream, in metadata capture and in the gate's silent application of a high-cost default.

**Fix.** When an **agreement is on file** but `recording_authorized = false`:
- Do **not** silently cap C1. Emit a **fail-loud flag** requesting confirmation: *"Agreement on file but recording not authorized — confirm whether recording consent was given verbally before applying the Gate 1 cap."*
- Only apply the band-2 cap after the flag is resolved as a true decline (no recording consent on file **and** none verbal — the genuine v0.4.1 condition).
- Rationale: a false-default on this field is catastrophic (−2 bands), so it warrants the same fail-loud treatment as low-confidence attribution and client matching. Guess loud, never silent.

---

## A4 · Consultant-move count → coach-facing flag, removed as a C2 cap

**Refinement that lives in the engine.** (Crosses into Part B logic but the count mechanics are engine-side, so it is documented here with a pointer.)

**Change.** The hard rule "move count > 3 → cap/drift that scores C2 down" is **removed as a score-down.** A binary count threshold is a false indicator: some clients, in their context, are genuinely well-served by thought-partnership, and a flat cap punishes a coach for serving them well.

**Retained.** The count is still computed and **surfaced as a coach-facing flag** in the report ("consultant moves: N — pattern to watch"), so the *quantity* remains visible as a development signal. It simply no longer mechanically lowers C2.

**Where the mode read now lands.** Consulting still has to surface somewhere honest. Every answer the coach supplies is an evocation they did not make — so the mode read lands on **C7 (Evokes awareness) and the overall**, via the taxonomy (A2): a session heavy in consultative/telling utterances will show a low Q:S and a correspondingly capped C7, without C2 being double-penalized. This keeps the methodology credentially defensible (an ICF assessor still will not pass a mostly-advice hour as strong coaching) while removing the blunt count-cap.

---

# PART B — RUBRIC REFINEMENTS (`COMPETENCY_BANDS`)

## B1 · Decimal scoring as within-band position

**Change.** Scores may now carry one decimal (e.g. 3.8, 4.5).

**Guardrail (non-negotiable).** The **band word remains the unit of meaning.** v0.1 §6.1 locked five bands deliberately to prevent inventing precision the evidence cannot support; that intent survives. The decimal expresses *position within a band* for the coach's personal trend sensitivity only — it is **not** a distinct grade.

- 3.0–3.4 ≈ proficient
- 3.5–3.9 ≈ high proficient, reaching toward strong
- 4.0–4.4 ≈ strong
- etc.

For Phase 2 cross-coach comparison, **the band word is what's compared**, never the decimal. "Strong" must still mean the same thing across coaches. The decimal does not travel between coaches as a precise quantity.

---

## B2 · Competency 2 — signaled role shift earns mindset credit (with a ceiling)

**Change.** Awareness of moving into another role — i.e. **signaling a role shift** — is itself evidence of a coaching *mindset* (2.04 bias-awareness, ethics 3.7 disclosure), not evidence of leaving one. Signaling moves the coach **off the floor** and is *required* for any consultant move to count as well-executed.

**Ceiling (non-negotiable).** Signaling is necessary but **not sufficient** (this preserves v0.1's existing standard). The **content of the mindset** — curiosity, client-responsibility (2.01), comfort with not-knowing, process-curiosity (2.09) — governs the band ceiling. A coach cannot signal their way through an entire consulting session and still score Strong on mindset. Signaling earns escape from band 2; mindset content determines whether the score reaches 3, 4, or 5.

**Updated band definitions for C2:**

| score | band | definition |
|---|---|---|
| 3 | Proficient | Generally client-centered. **Signals role shifts when they occur** (earns the floor). Curiosity present but process-curiosity (2.09) underdeveloped; bias toward action/frameworks (2.04) live. May supply centerpiece insight rather than evoking it. |
| 4 | Strong | Role shifts signaled, permissioned, brief, returned. Coach shows awareness of bias toward frameworks/content and actively nurtures the client's own curiosity rather than filling space. Consulting is the exception, not the back half. |
| 5 | Masterful | Deep mastery of 2.01, 2.04, 2.05, 2.09. Holds not-knowing with the client. Curiosity is contagious. Offers feel like the client's own discovery; consultant moves rare, surgical, indistinguishable from evocation. |

---

## B3 · Competency 6 — dimensional split (feeling gate stops capping all of C6)

**Defect in the rubric.** C6 (Listens Actively) has six sub-competencies; only **one** (6.04) is emotional. The v0.4 feeling-exploration gate capped *all of C6* at band 3 on zero feeling-explorations — over-indexing the whole competency on its emotional dimension and ignoring the cognitive/structural sub-competencies. Pulling the client's own prior material, metaphors, and cross-session references back into the conversation is squarely **6.06** (trends/themes across sessions) and **6.01** (client's context), and was going uncredited.

**Change.** C6 is scored on **two dimensions**, combined for the final C6 score:

- **Emotional dimension** (6.04) — governed by the feeling-reflection / coping-inquiry / feeling-exploration logic. The feeling-exploration gate caps **this dimension only**, not all of C6. (Coping inquiry — "how are you dealing with that?" — remains excluded from the exploration count.)
- **Cognitive / structural dimension** (6.01, 6.02, 6.03, 6.05, 6.06) — scored independently. Reflecting content accurately, catching patterns, surfacing themes across sessions, and **using the client's own metaphors and examples back to them** are strong active-listening moves and score on their merits.

**Retained as a visible sub-metric (non-negotiable).** `feeling_explorations` remains tracked and displayed even though it no longer vetoes all of C6. This fix correctly makes the rubric more accurate *and* relaxes pressure on a known coach development edge (emotional attunement); keeping the sub-metric visible ensures the edge stays in view rather than disappearing into a higher C6 score.

---

## B4 · Competency 3 — agenda band logic rewritten

**Defect in the rubric.** C3 was over-indexing "partnering" to mean *co-construct the agenda from scratch*, silently penalizing a client who arrives with a clear, outcome-ready agenda. That is backwards: a client who walks in with a sharp agenda is a sign of a healthy engagement, not a missed coaching opportunity. "Partnering" means *helping the client get to an agenda* — and if they already have one, that help isn't needed.

**Change — updated C3 band logic:**

| score | band | definition |
|---|---|---|
| 3 | Proficient | Client has an agenda; coach receives it cleanly and works it. A clear, self-evident agenda received well is a legitimate 3. |
| 4 | Strong | Coach helps **refine** the agenda *when refinement adds value* — asks around the items, sharpens outcomes, tests completeness. **If the agenda already has clear outcomes and needs no refinement, clean receipt is itself band 4, not a capped 3.** Coach also tracks the agreement when the client shifts it mid-session. |
| 5 | Masterful | Client manages agenda and focus largely themselves; coach nearly invisible (Invisibility Standard). |

**The test for band 4 is not "did the coach refine"** — it is **"did the coach refine when refinement would have added value, or correctly receive a clear agenda when it would not."** Gate 2 logic is unchanged (fires only when no insight named at close AND no standing engagement).

---

## B5 · Competency 8 — offer vs. recommendation distinction

**Change.** C8 (Facilitates Client Growth) now distinguishes two surface-similar moves at the close:

- **Recommendation** — coach authors the forward action, hands it over, client receives. The action is the *coach's*. Caps lower; does not meet the authorship hinge for band 4.
- **Offer of the client's own insight, packaged for reaction** — the client has already touched the action/insight themselves; the coach crystallizes it into a clean, concrete form and **hands it back for the client to accept, reject, or reshape.** Authorship stays with the client; the coach supplies *form, not content*. Meets the band-4 facilitation hinge (8.01, 8.02) while preserving autonomy (8.03).

**Governing test — the same "without attachment" used in A2.** An offer the client can freely reshape preserves autonomy and counts toward band 4. A recommendation the coach is invested in does not. One principle (7.11 / "without attachment") now does consistent work in two places: the co-thinking bucket (A2) and the C8 offer/recommendation distinction.

---

# §12 — DATA MODEL (updated)

The `metrics` block adds attribution confidence, the taxonomy buckets, and the recording-consent flag. C6 carries its two-dimension breakdown. Indicative shape:

```json
"attribution": {
  "method": "role-mapped",
  "source": "plaud-diarization",
  "confidence": "high",
  "likely_swap_flag": false
},
"metrics": {
  "coach_talk_time_pct": 30,
  "flagged_emotion_count": 1,
  "feeling_explorations": 0,
  "question_to_statement": "1:1.1",
  "utterance_taxonomy": {
    "questions": 0,
    "evocative_reflections": 0,
    "co_thinking": 0,
    "consultative_telling": 0,
    "process_logistics": 0
  },
  "reflective_pauses": 1,
  "role_shifts_flagged": 3,
  "consultant_moves": {
    "count": 4,
    "count_flag": "amber",
    "caps_c2": false,
    "note": "pattern to watch — count no longer scores C2 down"
  },
  "recording_consent_flag": {
    "agreement_on_file": true,
    "recording_authorized": false,
    "status": "needs_confirmation"
  },
  "source": "estimated"
},
"competencies": [
  {
    "id": 6,
    "name": "Listens actively",
    "score": 3.8,
    "band": "Proficient",
    "dimensions": {
      "emotional": { "score": 3.0, "gate": "feeling-exploration cap applied to this dimension only" },
      "cognitive_structural": { "score": 4.0, "evidence": "cross-session callback (6.06); client's own metaphors reused (6.01)" }
    }
  }
]
```

`utterance_taxonomy.questions : utterance_taxonomy.consultative_telling` is the Q:S source. Evocative reflections, co-thinking, and process utterances are excluded from that denominator.

---

# Kevin session — calibration anchor (June 22 2026)

First calibration anchor for the attribution and taxonomy defects, and for the C3/C6/C8 refinements.

**Engine (v0.4) vs. reconciled:**

| # | competency | engine (v0.4) | reconciled | driver of the gap |
|---|---|---|---|---|
| 1 | Demonstrates ethical practice | 2.0 | **4.5** | metadata defect (A3) — recording was authorized; gate fired on bad input |
| 2 | Embodies a coaching mindset | 2.0 | **3.4** | engine defect (A1/A2) — corrupted talk-time/Q:S/move count + signaling credit (B2) |
| 3 | Establishes and maintains agreements | 3.0 | **4.0** | rubric refinement (B4) — clean receipt of clear agenda + agreement tracked on subject change |
| 4 | Cultivates trust and safety | 3.0 | **4.5** | reconciliation — deep reflective trust ("he knew what I was doing" aha) |
| 5 | Maintains presence | 3.0 | **3.4** | held — emotional awareness not pulled in; packaged-observation credit belongs to C6/C7, not presence |
| 6 | Listens actively | 3.0 | **3.8** | rubric refinement (B3) — cross-session callback + client's own metaphors (cognitive/structural dimension) |
| 7 | Evokes awareness | 3.0 | **3.8** | reconciliation — real client-generated insight ("the work only you can do"); ceiling held because centerpiece insight was coach-supplied |
| 8 | Facilitates client growth | 3.0 | **3.9** | rubric refinement (B5) — client self-generated the core action, captured as offer |

**Reconciled overall: ~3.7 · Strong (low band).**

**Calibration note.** The two competencies that landed lowest after reconciliation — **C2 (coaching mindset) and C5 (presence/attunement)** — are the coach's two tracked development edges (consultant pull; emotional attunement at the exploration level). The reconciliation did not flatter the edges: refinements that legitimately raised C3, C6, C7 were adopted, while C2 and C5 were held to the evidence. This is the trustworthy signature of a good reconciliation. `feeling_explorations` for this session = 0, and remains visible despite the B3 dimensional split.

**Parked (not in v0.5).** A flagged "coach's offer" / end-of-session consulting container — a named, time-boxed, separately-scored segment for high-value non-coaching contributions (e.g. the team hot-seat exercise at this session's close, which was pure unflagged consulting with real value). Held as a **v0.6 candidate**; owner sitting with whether it belongs in the session at all. Do not implement in v0.5.

---

# §15 — Version history (updated)

- **v0.1** — Baseline locked. Five conversation metrics, eight competencies, theLeadershipWell standards, WIN debrief, two-axis trend, design language, data model.
- **v0.2** — Added `feeling_explorations` as sixth conversation metric. Added §7.2 reflection/exploration distinction and scoring gate. K.V. session anchor.
- **v0.3** — Added consultant moves as seventh metric with four-criteria sub-rubric and threshold logic. Explicit C2 band definitions (3/4/5). H.B. session anchor. C2 diagnosis refined to bias (2.04) and process-curiosity (2.09).
- **v0.4 / v0.4.1** — Gate 1 two-tier disclosure (no recording consent on file AND no verbal consent → C1 ≤ band 2).
- **v0.5** — **Engine fixes:** (A1) speaker-attribution integrity step with fail-loud on low confidence and nested-coaching regression test; (A2) coach-utterance taxonomy — four buckets, Q:S redefined as questions:consultative-telling, co-thinking bucket governed by 7.11 "without attachment"; (A3) metadata fail-loud when agreement on file but `recording_authorized = false` (Gate 1 itself unchanged — working as designed); (A4) consultant-move count removed as C2 cap, retained as coach-facing flag, mode read relocated to C7/overall. **Rubric refinements:** (B1) decimal scoring as within-band position, band word retains meaning for Phase 2; (B2) signaled role shift earns C2 mindset credit off the floor, mindset content governs the ceiling; (B3) C6 dimensional split — feeling-exploration gate caps emotional dimension only, cognitive/structural scores independently, `feeling_explorations` retained as visible sub-metric; (B4) C3 agenda band logic rewritten — clean receipt of a clear agenda is band 3, refinement-when-valuable is band 4; (B5) C8 offer-vs-recommendation distinction governed by "without attachment." Kevin session documented as calibration anchor. End-of-session "coach's offer" container parked for v0.6.

*theLeadershipWell Coaching Session Report Spec · delta v0.4 → v0.5 · Dr. Jeff Holmes · June 2026*
