# theLeadershipWell — Coaching Session Report
**Specification v0.4** · Status: locked, build from here · Owner: Dr. Jeff Holmes  
_Consolidated from v0.1 baseline + v0.2, v0.3, and v0.4 deltas. This is the single source of truth for the scoring engine._

---

## 1. Purpose

The Session Report turns a recorded coaching session into structured, evidence-based developmental feedback for the coach. It scores the session against the ICF 2025 Core Competencies, refined by theLeadershipWell's own standards, and surfaces a set of behavioral metrics drawn directly from the session transcript.

The report serves two goals:

1. **Sharpen the coach.** Give every coach an objective, repeatable read on their craft and a single forward practice step.
2. **Build the asset.** Establish a calibrated, defensible evaluation methodology that is sharper than the generic ICF model — proprietary IP for theLeadershipWell.

---

## 2. Scope and phases

- **Phase 1 (current).** Self-development only. The report is generated for and seen by the coach themselves. No manager or firm-level visibility.
- **Phase 2 (future).** A firm-facing dashboard per coach, showing progress over time and against cohort context. Same scoring engine, same scale; the per-client toggle becomes a per-coach toggle.

This spec defines the Phase 1 single-session report and the scoring foundation both phases share.

---

## 3. Privacy and confidentiality

- **Clients are identified by initials only** (e.g. `M.W.`). Full names are never stored in the report.
- Phase 1 reports are private to the coach.
- Handling of recordings, transcripts, and reports must respect ICF confidentiality obligations (ICF Code of Ethics 2.1–2.5).
- Client consent for recording and AI evaluation is resolved via coaching agreements with per-session verbal check-ins.
- **Fail-loud matching principle:** when client name matching confidence is not clear from the transcript, flag for manual confirmation rather than guess. Never auto-assign client initials at low confidence.

---

## 4. Design language

The report is intentionally calm, flat, and document-like.

- **Flat surfaces.** No gradients, drop shadows, or decorative effects. Plain background, 0.5px dividers between sections.
- **Generous whitespace.** Sections separated by a top border and vertical breathing room.
- **Restraint with color.** Color carries meaning only (status, scoring band). Never decorative.
- **Sentence case everywhere.** No Title Case, no ALL CAPS.
- **Two type weights only** — regular and medium. Numbers are the largest type on the page; labels are small and muted.
- **Scannable hierarchy.** Summary cards readable at a glance; competency detail available on drill-down.

---

## 5. Report anatomy

Sections appear in this fixed order:

1. **Header** — report title; coach name; client initials; session type; session number within engagement; overall band pill (e.g. "Proficient · PCC range").
2. **Score summary** — three metric cards plus scale key: this session score (out of 5); strongest competency (with name); lowest competency (with name); one-line scale key beneath.
3. **Conversation metrics** — seven behavioral metric cards drawn from the transcript (see §7). Caption notes whether figures are estimated or parsed.
4. **ICF competency read** — eight competencies grouped under four domains, each with band-and-score chip and one-line evidence note tied to a sub-competency number.
5. **WIN debrief** — What went well · Improve (one) · Next step (see §11).
6. **Score trend** — overall and per-client trajectory (see §12).
7. **Actions** — lightweight buttons (e.g. "see evidence moments," "add my own scores").

---

## 6. Scoring model

### 6.1 The 5-point band scale

| Score | Band | Reference |
|------:|------|-----------|
| 1 | Emerging | Below competent practice |
| 2 | Developing | Approaching competent practice |
| 3 | Proficient | Competent practice (≈ PCC range) |
| 4 | Strong | Consistently skilled |
| 5 | Masterful | Mastery (≈ MCC range) |

A solid PCC-level coach is expected to land around a 3. This is honest, not generous, and leaves real headroom to show growth toward 4 and 5.

### 6.2 Competencies scored

All eight ICF 2025 Core Competencies, grouped by domain:

- **A · Foundation:** 1. Demonstrates ethical practice · 2. Embodies a coaching mindset
- **B · Co-creating the relationship:** 3. Establishes and maintains agreements · 4. Cultivates trust and safety · 5. Maintains presence
- **C · Communicating effectively:** 6. Listens actively · 7. Evokes awareness
- **D · Cultivating learning and growth:** 8. Facilitates client growth

> Competency names and numbering per ICF 2025 Core Competencies (© International Coaching Federation). Evidence notes cite specific sub-competency numbers (e.g. 6.04).

### 6.3 Evidence-linked scoring

Each competency score carries a one-line evidence note tied to a specific moment in the session and a sub-competency number. The score is never a bare number — it always points to *why*.

### 6.4 Overall session score

**Equal-weighted average of the eight competency scores**, rounded to one decimal.

Open option (not yet enabled): weight a coach's active development edges more heavily so the overall score moves when they work on them.

### 6.5 Band chips

Each competency displays a chip combining band word and numeric score (e.g. "Strong · 4.0"). Chip color:

- Strong / Masterful → success color (green family)
- Proficient → info color (blue family)
- Developing / Emerging → warning color (amber family)

---

## 7. Conversation metrics and threshold logic

Seven behavioral metrics drawn from the transcript. Speaker-attributed verbatim transcript required (see §14).

| # | Metric | Definition | Threshold logic | Source |
|---|--------|------------|-----------------|--------|
| 1 | Coach talk-time | % of words spoken by the coach | 🔴 Red if > 40% | theLeadershipWell rule |
| 2 | Flagged emotion (6.04) | Count of coach moves that tune into client emotion (see §7.1) | 🔴 Red if < 2 · 🟡 Amber if = 2 · 🟢 Green if > 2 | theLeadershipWell rule |
| 3 | Feeling explorations | Count of coach moves that stay with an emotion and deepen into its origin, meaning, function, or cost (see §7.2) | 🔴 Red if 0 (triggers C6 gate) · 🟡 Amber if 1 · 🟢 Green if ≥ 2 | theLeadershipWell rule |
| 4 | Question : statement | Ratio of coach questions to coach statements | 🟢 Green when questions exceed statements · 🔴 Red when statements exceed or at parity | theLeadershipWell rule |
| 5 | Reflective pauses | Count of deliberate pauses / silences the coach creates | Count only, no threshold yet | — |
| 6 | Role shifts flagged | Count of times the coach explicitly named a shift out of the coaching role | Count only, no threshold yet | — |
| 7 | Consultant moves | Count of moves into consulting, teaching, mentoring, or framework-offering; each scored on four criteria (see §7.3) | See §7.3 threshold table | theLeadershipWell rule |

### 7.1 Flagged emotion — what counts (four triggers)

A flagged-emotion event is any of:

1. **Naming a feeling observed** — e.g. "you sound frustrated."
2. **Asking a feeling question** — e.g. "how are you feeling about that?"
3. **Reflecting an energy shift** — e.g. "something just changed when you said that."
4. **Mirroring the coach's own felt response** — counts only when it hands the emotion back to the client (e.g. "…what's that like for you?"). A mirror that centers the coach's own experience does not count.

> ICF ref: 6.04 — Notices, acknowledges and explores the client's emotions, energy shifts, non-verbal cues or other behaviors.

### 7.2 Feeling exploration — three-way classification

The engine must classify each coach emotion move into one of three types:

| Move type | Definition | Engine scoring |
|-----------|------------|----------------|
| **Feeling reflection** | Coach names, mirrors, or reflects the client's emotion. e.g. "I'm hearing frustration," "you sound angry." | Counts as flagged emotion event (metric 2). Does NOT count as exploration. |
| **Coping inquiry** | Coach asks how the client is managing or dealing with the emotion. e.g. "How are you coping with that?", "How do you deal with the frustration?" | Does NOT count as feeling exploration. Does NOT count as flagged emotion event. Redirects away from the emotion rather than deepening into it. |
| **Feeling exploration** | Coach stays with the emotion and asks about its origin, meaning, function, or cost. e.g. "What does that frustration feel like?", "Where does that come from?", "What is it costing you?", "What does the anger want you to know?" | Counts as qualifying exploration (metric 3). Also counts as flagged emotion event (metric 2). Required for C6 band 4+. |

**Gate 3:** zero feeling explorations caps Competency 6 at band 3 regardless of flagged emotion count.

> Calibration anchor (v0.4, June 2026): Coach named frustration and asked "how are you dealing with that?" — classified as reflection + coping inquiry, not exploration. Zero qualifying explorations. C6 band 3 ceiling confirmed.

### 7.3 Consultant moves — sub-rubric

**Definition:** count of times the coach steps into a consulting, teaching, mentoring, or framework-offering role within a session. Each move is scored individually on four binary criteria. The pattern across moves feeds the Competency 2 score.

**The four criteria (each scores 0 or 1):**

| Criterion | Description |
|-----------|-------------|
| Signaled | Coach explicitly names the role shift before making the move |
| Permissioned | Client agrees (explicitly or clearly implicitly) before the move proceeds |
| Brief | The move is terse; does not crowd out the client's discovery time |
| Floor returned | Coach immediately invites the client to reflect after the move |

**Score per move: 0–4 criteria met.**

**Threshold logic:**

| Condition | Status | Flag |
|-----------|--------|------|
| Any move scoring 0–2 on four criteria | Poor execution | 🔴 Red |
| Any move scoring 3 on four criteria | Acceptable — watch pattern | 🟡 Amber |
| Any move scoring 4 on four criteria | Well executed | 🟢 Green |
| Move count > 3 in a session | Drift from coaching mode | 🔴 Red |
| Move count ≤ 3, all well executed | Strong execution | 🟢 Green |

**Evocative reframe vs. consultant move — engine classification rule:**

The engine must distinguish between a coach reframe offered evocatively and a direct consultant move:

- **Evocative reframe:** coach offers a frame, label, or observation and the *client* performs the final synthesis. The insight is client-owned. Counts toward evocation (C7), not as a consultant move.
- **Consultant move:** coach delivers advice, a framework, or a directive conclusion without the client doing the final synthesis. Counts as a consultant move regardless of relational warmth or positive outcome.
- **Direct advice without signaling or permission** = unsignaled consultant move, scores 1–2/4 criteria, flags red.

> Design note: the consultant or teaching move is not inherently a mindset failure. What matters is execution quality and the who-synthesises test, not the mere presence of the move. Count threshold of 3 is an independent flag — more than three moves signals drift from coaching as the dominant mode even if each individual move is well executed.

---

## 8. theLeadershipWell standards

ICF is the floor. These standards are layered on top and make the methodology proprietary.

- **Coach talk-time ≤ 40%.** Client should be doing most of the talking. To be re-anchored over time against the coach's own strongest sessions.
- **Flagged emotion ≥ 2 per session minimum.** Below 2 flags red; exactly 2 is the floor (amber); above 2 is green. Tracks the firm's emphasis on emotional attunement (ICF 6.04 / 4.05).
- **Feeling exploration ≥ 1 per session minimum.** Zero flags red and triggers C6 band 3 ceiling gate. Distinguishes between naming emotions (reflection) and genuinely staying with them (exploration).
- **Questions should outnumber statements.** Parity (1:1) is scored red.
- **Teaching / co-thinking standard.** Teaching is welcome only when terse and returned immediately to the client's reflection. Extended teaching = role drift even when relationally warm.
- **Role-shift flagging is expected.** When the coach steps out of the coaching role, they name it. Flagging is necessary but not sufficient.
- **Consultant moves ≤ 3 per session.** More than three moves signals drift from coaching as the dominant mode regardless of individual execution quality.

### theLeadershipWell named IP principles (cross-competency)

These named principles are theLeadershipWell proprietary standards. They appear in scoring rationale and calibration documentation.

| Principle | Definition | Applies to |
|-----------|------------|------------|
| **The Attunement Standard** | The hinge between Proficient (band 3) and Strong (band 4). Focus earns a 3; attunement earns a 4. | C5, C6, C8 |
| **The Exploration Gate** | Zero feeling explorations caps C6 at band 3 regardless of emotion-flag count. Named in scoring output when triggered. | C6 |
| **The Authorship Hinge** | Client-generated vs. coach-packaged actions is the hinge between bands 3 and 4. | C8 |
| **The Consultant Pull Signature** | When the coach perceives ~60% questions but the engine reads statements exceeding questions, this measurable gap is the signature of consultant pull under emotional or intellectual engagement. | C2, metric 4 |

---

## 9. Scoring rubric — band definitions by competency

### Competency 1 — Demonstrates ethical practice

| Score | Band | Definition | Key markers |
|------:|------|------------|-------------|
| 1 | Emerging | Ethical obligations not met; confidentiality or role distinctions breached. | — |
| 2 | Developing | Partial ethical practice; no signed agreement on file AND no verbal consent to record at session open. | Gate 1 triggered — band 2 ceiling. |
| 3 | Proficient | Ethical standards met; role distinctions generally maintained; recording consent in place (signed agreement on file or verbal consent at open). | No violations observed. |
| 4 | Strong | Recording/AI consent established — by a signed coaching agreement on file or explicit verbal consent at session open. Role distinctions maintained throughout. | Consent captured. ICF 1.06, 2.5 met. |
| 5 | Masterful | Ethics woven into the coaching relationship itself — proactive, transparent, client-empowering. Client experiences the ethical stance as care, not compliance. | — |

#### AI / recording disclosure — two-tier standard (v0.4)

The prior gate required verbal disclosure of the AI evaluation at session open and penalized incomplete description of the AI scoring function. That is replaced in full by a two-tier standard.

- **Tier 1 — agreement on file (preferred).** When `agreement_on_file: true` and the client did not decline recording (`recording_authorized` is not `false`), the disclosure obligation is fully satisfied by the signed coaching agreement, which is the controlling document for AI-evaluation permissions (consent, storage, review). No session-level verbal disclosure is required, and the engine does not evaluate the content or completeness of session-level disclosure. If the client explicitly declined recording in the agreement (`recording_authorized: false`), there is no recording consent on file and Tier 2 applies.
- **Tier 2 — no agreement on file.** When `agreement_on_file` is `false` or absent, the engine scans the first ~5 minutes for explicit client consent to **record**. Any affirmative client response to a recording request passes the gate. The coach is **not** required to describe the AI evaluation function, scoring process, or storage at the session level — those obligations are carried by the agreement.
- **Gate failure (band-2 ceiling)** applies only when **both** are absent: no agreement on file **and** no verbal consent to record at session open.
- **Administrative flag.** Absence of a signed agreement is recorded separately as `agreement_gap: true` for follow-up. The flag alone never applies the band ceiling.

> **Engine rule:** check `agreement_on_file` first — if `true`, pass the gate and do not evaluate session-level disclosure. If `false`/absent, any explicit verbal consent to record near session open passes (`verbal_consent_to_record: true`). Recording consent (agreement or verbal) = C1 band-4 marker; it need not be repeated mid-session.

#### Coaching / counseling boundary (1.06, v0.4)

The coaching/counseling boundary is crossed when the coach attempts to **repair psychological wounds** — not when the work has psychological depth. The following are explicitly within the coaching role and do **not** trigger a 1.06 boundary flag: psychological analysis of third parties as context; exploration of the client's emotional patterns, responses, or triggers; client emotional-wellbeing management and regulation strategies; relational-dynamics work where the client is the focal point of change; extended exploration of the client's internal experience, beliefs, or identity. The boundary **is** crossed when the coach: diagnoses a psychological condition (in the client or a third party); provides therapeutic intervention aimed at resolving trauma or repairing wounds; or sustains a therapeutic frame (e.g. repeated trauma processing, grief-therapy techniques) rather than a coaching frame.

> **Engine rule:** do not flag 1.06 unless the transcript shows clear wound-repair attempts or diagnostic language. Psychological depth, emotional exploration, and third-party analysis are coaching, not counseling. When in doubt, do not flag.
> ICF refs: 1.04, 1.05, 1.06, 2.5.

---

### Competency 2 — Embodies a coaching mindset

| Score | Band | Definition |
|------:|------|------------|
| 1 | Emerging | Coach-centered; curiosity absent; client's choices not respected. |
| 2 | Developing | Approaching client-centeredness; frequent unsignaled consultant moves; framework-filling is the dominant mode. |
| 3 | Proficient | Generally client-centered; names role shifts when they occur; curiosity present but process-curiosity underdeveloped. Consultant moves may occur without full signaling or permission. |
| 4 | Strong | Consultant moves are signaled, permissioned, brief, and returned to the client. Coach shows awareness of bias toward frameworks and content. Nurtures the client's own curiosity rather than filling space with frameworks. |
| 5 | Masterful | Deep mastery of 2.01, 2.04, 2.05, 2.09. Coach holds not-knowing with the client. Curiosity is contagious. Framework offers feel like the client's own discovery. Consultant moves are rare, surgical, and indistinguishable from evocation. |

**Sub-competencies driving the 3→4 transition:**

- 2.01 — Acknowledges that clients are responsible for their own choices
- 2.04 — Remains aware of and open to the influence of biases, context and culture on self and others (includes bias toward frameworks and content)
- 2.05 — Uses awareness of self and one's intuition to benefit clients
- 2.09 — Nurtures openness and curiosity in oneself, the client, and the coaching process

> Diagnosis note: pull toward consulting and frameworks attributed primarily to bias toward action (2.04) and insufficient process-curiosity (2.09), not failure of impact awareness (2.10). 2.10 is a documented strength.

---

### Competency 3 — Establishes and maintains agreements

**Session agreement mechanics:**

The session agreement is established when the coach explicitly invites the client's agenda and the client responds. The client's response to "what would be most helpful today?" or equivalent = co-created session focus satisfying ICF 3.06. In established ongoing engagements, the standing engagement agreement provides the containing context.

| Score | Band | Definition | Key markers |
|------:|------|------------|-------------|
| 1 | Emerging | No session focus established; no engagement agreement referenced. | — |
| 2 | Developing | Session focus emerges without coach invitation; no named insight at close; no standing engagement agreement. | Gate 2 triggered. |
| 3 | Proficient | Session focus emerges organically; client's agenda received by coach. Standing engagement agreement present. | Client names what they want to discuss. |
| 4 | Strong | Coach explicitly invites the client's agenda and receives it. Client names at least one insight at close. | Explicit agenda invitation (ICF 3.06) + named insight at close. |
| 5 | Masterful | Coach reflects the agenda back and partners on its completeness or priority before proceeding. Close includes consolidated insight and forward movement. | "Here's what I heard — what's missing or how does this feel as our focus?" ICF 3.06, 3.08, 3.09. |

> **Gate 2 (revised v0.4):** applies only when no insight is named at close AND no standing engagement agreement exists. Established engagements where the client names a self-generated insight at close = band 3 floor minimum. Gate 2 not triggered.

---

### Competency 4 — Cultivates trust and safety

| Score | Band | Definition | Key markers |
|------:|------|------------|-------------|
| 1 | Emerging | Client does not feel safe; coach behavior undermines trust. | — |
| 2 | Developing | Some warmth present; trust fragile or inconsistent. | — |
| 3 | Proficient | Client feels safe to share; coach demonstrates consistent respect and empathy. | ICF 4.04, 4.05 met. |
| 4 | Strong | Client shares freely and candidly, including emotionally raw content. Coach adapts to client's style and identity. One clear qualifying trust-deepening move present. | ICF 4.01, 4.02, 4.05, 4.06. Single-instance standard. |
| 5 | Masterful | Client experiences the relationship itself as generative. Coach vulnerability and transparency deepen trust actively. | ICF 4.06. |

> **Single-instance standard:** one clear qualifying trust-deepening move is sufficient to reach band 4.

---

### Competency 5 — Maintains presence

**The Attunement Standard applies:** focus earns a 3; attunement earns a 4.

| Score | Band | Definition | Key markers |
|------:|------|------------|-------------|
| 1 | Emerging | Coach distracted, agenda-driven, or disengaged. | — |
| 2 | Developing | Partial presence; coach moves away from client's energy toward own plan. | — |
| 3 | Proficient | Coach is focused and tracks the conversation; picks up threads; responds to content. | ICF 5.01, 5.02. |
| 4 | Strong | Coach is attuned — present to what is emerging beneath the content (emotion, energy, the unsaid). Creates space for silence. One clear qualifying attunement move present. | ICF 5.03, 5.06, 5.07. Single-instance standard. |
| 5 | Masterful | Coach's presence is generative. The client slows down and goes deeper because of the quality of attention in the room. | ICF 5.03–5.07. |

> **Single-instance standard:** one clear qualifying attunement move is sufficient to reach band 4.

---

### Competency 6 — Listens actively

**The Attunement Standard applies:** focus earns a 3; attunement earns a 4.  
**The Exploration Gate applies:** zero feeling explorations caps at band 3.

| Score | Band | Definition | Key markers |
|------:|------|------------|-------------|
| 1 | Emerging | Coach not tracking client; interrupting or redirecting without basis. | — |
| 2 | Developing | Surface listening; coach reflects content but misses subtext. | — |
| 3 | Proficient | Coach reflects and summarizes content accurately. Emotion named or mirrored at least twice. Stays focused on what the client is saying. | ICF 6.02, 6.04. Reflection present; no exploration. |
| 4 | Strong | Coach is attuned to what is beneath the content — emotion, energy, the unsaid. At least one qualifying feeling exploration present (see §7.2). One clear qualifying attunement move present. | ICF 6.03, 6.04, 6.05. Single-instance standard. |
| 5 | Masterful | Coach hears what the client cannot yet say. Reflects patterns across the session and engagement. Emotion exploration is deep, sustained, and transformative. | ICF 6.03, 6.04, 6.05, 6.06. |

> **Gate 3 (unchanged):** zero feeling explorations caps C6 at band 3 regardless of flagged emotion count.  
> **Single-instance standard:** one clear qualifying feeling exploration is sufficient to reach band 4.

---

### Competency 7 — Evokes awareness

**Insight depth levels:**

| Level | Definition |
|-------|------------|
| Process level | Client gains awareness of what is happening in a situation or pattern. |
| System level | Client gains awareness of how their context, relationships, or environment shape the pattern. |
| Identity level | Client gains awareness of how their sense of self, values, or core beliefs are implicated. |

Any one clear instance at any level qualifies for band 5 if the insight is genuinely generative and client-owned.

| Score | Band | Definition | Key markers |
|------:|------|------------|-------------|
| 1 | Emerging | Coach not evoking; advice-giving dominant. | — |
| 2 | Developing | Some questions present but coach-directed; insight not generated. | — |
| 3 | Proficient | Coach uses powerful questions; client generates awareness at process level. Coach may use reframes or metaphors. | ICF 7.03, 7.04, 7.10. |
| 4 | Strong | Coach evokes awareness at system or identity level. Questions go beyond the situation to the client's patterns, values, or worldview. One clear qualifying insight present. | ICF 7.02, 7.03, 7.08. Single-instance standard. |
| 5 | Masterful | Any one clear instance of identity-, system-, or process-level insight that is deeply generative and fully client-owned. Coach nearly invisible. | ICF 7.02, 7.08, 7.11. |

> **Single-instance standard:** one clear qualifying insight is sufficient to reach band 5 for C7.

---

### Competency 8 — Facilitates client growth

**The Authorship Hinge:** client-generated vs. coach-packaged actions is the hinge between bands 3 and 4.  
**Band 4 vs. 5:** band 4 = what the coach enables in the client; band 5 = the coach becomes nearly invisible as the client does the deeper work.

| Score | Band | Definition | Key markers |
|------:|------|------------|-------------|
| 1 | Emerging | No closing or integration; session ends without learning consolidated. | — |
| 2 | Developing | Coach attempts close but insight or action is thin, coach-packaged, or absent. No return to agreed session actions. | ICF 8.06 absent or weak. |
| 3 | Proficient | Coach consolidates learning at close; client names an insight. Actions may be coach-suggested. | ICF 8.01, 8.06, 8.09. |
| 4 | Strong | Client generates their own insight and at least one self-authored action or commitment. Coach partners on accountability. | ICF 8.02, 8.03. Authorship hinge met. |
| 5 | Masterful | Client integrates insight into their worldview and self-generates a growth plan. Coach nearly invisible in the growth design. | ICF 8.01, 8.02, 8.07. |

> **Engine rule:** "What is your insight or awareness?" is a valid close structure. Score on whether the client generates the insight (band 3+) and whether the coach consolidates, expands, and partners on forward action (band 4+). Absence of any consolidation or forward partnering = band 2.

---

## 10. Gate rules

Gates are hard ceilings. When triggered, the competency cannot score above the ceiling regardless of other evidence.

| Gate | Condition | Competency affected | Ceiling | Version |
|------|-----------|---------------------|---------|---------|
| Gate 1 | No signed agreement on file AND no verbal consent to record at session open | C1 | Band 2 | v0.4 revised |
| Gate 2 | No named insight at close AND no standing engagement agreement | C3 | Band 2 | v0.4 revised |
| Gate 3 | Zero feeling explorations in session | C6 | Band 3 | v0.2 |

---

## 11. WIN debrief

The WIN block is the human reflection layer, structurally separate from the machine-generated scores.

- **What went well** — genuine strengths of the session, stated specifically. Coach generates this list via "what else?" until ideas are exhausted.
- **Improve (one)** — a single most-important improvement, not a list.
- **Next step** — one concrete, behavioral practice step the coach will take in the next session. Connects to the coach's running development edges.

**Protocol:** coach scores themselves first (WIN self-assessment) before receiving machine-generated feedback. WIN is coach-owned, not machine-generated.

---

## 12. Trend mechanics

Two trend questions:

1. **Am I getting better overall?** A line across all the coach's scored sessions, all clients.
2. **Am I getting better with this client?** A line across only this client's sessions (by initials).

The per-client line is separate because a coach's edges often show up most with particular clients (e.g. business-rich clients that tempt consultant drift). Per-client line running below the overall line is a primary insight of the tool.

- Trend baselines at first scored session; chart populates as more sessions are scored.
- Score deltas display green when rising, red when falling. No prior data = neutral baseline.
- Y-axis is the band scale (developing / proficient / strong), not raw numbers.

---

## 13. Color and typography tokens

All colors must work in both light and dark mode (semantic theme variables; never hard-coded except categorical band ramps).

**Semantic status colors**

- Red / danger → threshold breach, falling score
- Amber / warning → at threshold, development band
- Green / success → threshold met or exceeded, strength band, rising score
- Blue / info → proficient band, neutral informational accent
- Tertiary / muted → baseline and "no comparison yet" states

**Typography**

- Numbers (scores, metrics): largest, medium weight.
- Section titles: medium weight, ~16px.
- Labels and captions: small, muted, regular weight.
- Sentence case throughout. Two weights only (regular, medium).

**Layout**

- Metric cards: muted surface fill, no border, medium corner radius, responsive grid (`auto-fit`, ~140–150px min column).
- Section dividers: 0.5px top border, generous vertical padding.

---

## 14. Data model

The evaluation engine outputs a structured object that the report template renders. This decouples scoring from presentation and feeds both the report and the trend store.

```json
{
  "session": {
    "coach": "Jeff H.",
    "client_initials": "M.W.",
    "type": "1:1 leadership",
    "session_number": 3,
    "engagement_total": 12,
    "date": "2026-06-19",
    "standing_engagement": true,
    "agreement_on_file": true,
    "agreement_gap": false
  },
  "overall_score": 3.3,
  "band": "Proficient",
  "competencies": [
    {
      "id": 6,
      "name": "Listens actively",
      "domain": "Communicating effectively",
      "score": 3.0,
      "band": "Proficient",
      "evidence": "Named frustration once; coping inquiry present but no feeling exploration; gate 3 triggered",
      "subcompetency_refs": ["6.04", "6.02"],
      "gates_triggered": ["gate_3"]
    }
  ],
  "metrics": {
    "coach_talk_time_pct": 38,
    "flagged_emotion_count": 2,
    "feeling_explorations": 0,
    "question_to_statement": "1:1.4",
    "reflective_pauses": 2,
    "role_shifts_flagged": 0,
    "consultant_moves": {
      "count": 4,
      "moves": [
        {
          "description": "Direct advice — less is more strategy",
          "signaled": false,
          "permissioned": false,
          "brief": true,
          "floor_returned": false,
          "score": 1,
          "status": "red"
        }
      ],
      "count_flag": "red",
      "execution_flag": "red"
    },
    "source": "estimated"
  },
  "verbal_consent_to_record": false,
  "gates_triggered": {
    "gate_1": false,
    "gate_2": false,
    "gate_3": true
  },
  "win": {
    "went_well": "",
    "improve": "",
    "next_step": ""
  },
  "evidence_moments": [
    {
      "competency": "6.04",
      "timestamp": "00:47:50",
      "quote_short": "I am hearing frustration and anger — am I hearing that right?",
      "note": "Feeling reflection present; followed by coping inquiry, not exploration"
    }
  ]
}
```

**Disclosure fields (v0.4):**

- `session.agreement_on_file` — boolean; set by the platform when a signed coaching agreement exists for this client. Drives the Competency 1 disclosure gate (Tier 1): when `true` and recording was not declined, the gate is satisfied outright and session-level disclosure is not evaluated.
- `session.recording_authorized` — boolean | null; the client's signed recording/AI decision (`true` = consented, `false` = declined, `null` = legacy/unknown). Recording consent counts as "on file" only when an agreement exists AND this is not `false`. An explicit decline also raises the platform's non-dismissible no-recording compliance flag.
- `session.agreement_gap` — boolean; administrative follow-up flag set by the engine when no signed agreement is on file (`agreement_on_file: false`). Surfaced as an administrative flag only — it carries no competency-score penalty beyond the Gate 1 ceiling, and a session can pass Gate 1 on verbal consent while still showing an agreement gap.
- `verbal_consent_to_record` — boolean; set by the engine (Tier 2) when, with no agreement on file, an explicit client consent to record is detected near session open. Any affirmative response to a recording request passes; describing the AI evaluation function is not required.

**Required input:** speaker-separated verbatim transcript (e.g. Zoom VTT). Speaker attribution enables talk-time, question/statement ratio, and emotion-flag counting. An AI summary alone is insufficient and will materially limit scoring on Competencies 5, 6, and 7.

---

## 15. Calibration approach

1. The engine scores a session blind.
2. The coach scores the same session using the WIN framework first.
3. The two are reconciled; gaps refine the rubric.

Each reconciliation session is a calibration opportunity. After several rounds, the rubric becomes theLeadershipWell's documented standard rather than generic AI judgment. The coarse 5-band scale is intentional — it makes "strong" mean the same thing across coaches, which matters most in Phase 2.

**Calibration anchors on file:**

| Client | Delta version | Key anchor |
|--------|---------------|------------|
| K.H. | Outstanding | Draft pending |
| K.V. | v0.2 | Feeling exploration distinction; reflection/exploration gate (gate 3) |
| H.B. | v0.3 | Consultant moves sub-rubric; two moves at 3/4 amber; coaching mindset diagnosis |
| Unnamed | v0.4 | C1 disclosure rule; C3 gate 2 revision; C6 coping inquiry exclusion; C2 evocation vs. consultant move classification |

**Spec files:** `coaching-eval/spec/`  
**Calibration anchors:** `coaching-eval/calibration/`

---

## 16. Open items

- **Question : statement parity case.** Parity (1:1) currently treated as red. May be revised to amber as calibration data accumulates.
- **Talk-time threshold.** 40% is a working rule to be re-anchored against the coach's strongest sessions over time.
- **Edge weighting.** Whether to over-weight a coach's active development edges in the overall average. Not yet enabled.
- **Thresholds for pauses and role-shift flags.** Currently counts only; thresholds pending calibration data.
- **K.H. and K.V. calibration anchor documents.** Outstanding drafts from prior sessions; needed to complete the anchor library.
- **Automation pipeline.** Plaud.ai → Zapier → Google Drive → Claude Code daily routine → scored report by email. Client name matching (fail-loud logic) and email delivery remain to be completed.

---

## 17. Version history

- **v0.1** — Baseline. Report anatomy, 5-band scale, eight-competency model, five conversation metrics with threshold logic, theLeadershipWell standards, WIN debrief, two-axis trend, design language, data model.
- **v0.2** — Added `feeling_explorations` as sixth conversation metric. Added §7.2 defining the reflection/exploration distinction and its scoring gate (gate 3). Updated JSON data model. K.V. session documented as calibration anchor.
- **v0.3** — Added consultant moves as seventh conversation metric with four-criteria sub-rubric and threshold logic. Added explicit band definitions (3/4/5) for Competency 2. Updated JSON data model. H.B. session documented as calibration anchor for consultant moves metric. Competency 2 diagnosis: pull toward frameworks attributed to bias (2.04) and process-curiosity (2.09) rather than impact awareness (2.10).
- **v0.4** — Full consolidated spec. Added explicit band definitions for all eight competencies. C1 band 4: explicit recording/AI disclosure + client consent at session open satisfies ethical practice at band 4; engine no longer under-scores on this. C2 calibration note: evocative reframing vs. unsignaled consultant move determined by who performs the final synthesis — client = evocation, coach = consultant move. C3 band definitions (3/4/5) added; session agreement mechanics clarified (client response to open agenda invitation = co-created session focus, ICF 3.06); gate 2 revised — applies only when no insight named AND no standing engagement agreement exists. C4, C5, C7, C8 band definitions added. C6: coping inquiry formally excluded from feeling exploration definition; three-way classification table (reflection / coping inquiry / exploration) added to engine spec. Cross-competency principles named as theLeadershipWell IP: Attunement Standard, Exploration Gate, Authorship Hinge, Consultant Pull Signature. Gate rules consolidated into single reference table with `standing_engagement` field and `gates_triggered` object added to data model. Calibration anchor: unnamed client session, June 2026.
- **v0.4.1** — Revised Competency 1 disclosure gate to a two-tier standard: a signed agreement on file (`agreement_on_file: true`) satisfies the gate outright (Tier 1); with no agreement, explicit verbal consent to record at session open passes (Tier 2). Removed the requirement to describe the AI evaluation function at session level. Gate 1 now caps C1 at band 2 only when both an agreement and verbal consent are absent. Revised the coaching/counseling boundary (1.06): the threshold is wound-repair attempts, diagnostic language, or a sustained therapeutic frame — not psychological depth, emotional exploration, or third-party analysis. Added `agreement_on_file`, `agreement_gap` (session metadata) and `verbal_consent_to_record` (engine output) to the data model.

---

_theLeadershipWell Coaching Session Report Spec · v0.4 · Dr. Jeff Holmes · June 2026_
