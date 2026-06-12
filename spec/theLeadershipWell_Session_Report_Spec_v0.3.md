# theLeadershipWell — Coaching Session Report Spec
**Version:** v0.3 · **Status:** approved, build from here · **Owner:** Dr. Jeff Holmes

---

## version history

| version | summary |
|---------|---------|
| v0.1 | Baseline locked. Five conversation metrics, eight competencies, theLeadershipWell standards, WIN debrief, two-axis trend, design language, data model. |
| v0.2 | Added `feeling_explorations` as sixth conversation metric. Added §7.2 defining the reflection/exploration distinction and its scoring gate. Updated JSON data model. K.V. session documented as calibration anchor. |
| v0.3 | Added `consultant_moves` as seventh conversation metric with four-criteria sub-rubric and threshold logic. Added explicit band definitions (3/4/5) for Competency 2. Updated JSON data model. H.B. session documented as calibration anchor for consultant moves. Competency 2 diagnosis refined: pull toward frameworks attributed to bias (2.04) and process-curiosity (2.09) rather than impact awareness (2.10). |

---

## 1. purpose

The Session Report turns a recorded coaching session into structured, evidence-based developmental feedback for the coach. It scores the session against the ICF 2025 Core Competencies, refined by theLeadershipWell's own emerging standards, and surfaces a set of behavioral metrics drawn directly from the session transcript.

**Two goals:**

1. **Sharpen the coach.** Give every coach an objective, repeatable read on their craft and a single forward practice step.
2. **Build the asset.** Establish a calibrated, defensible evaluation methodology that is sharper than the generic ICF model — proprietary IP for theLeadershipWell.

---

## 2. scope and phases

- **Phase 1 (current).** Self-development only. The report is generated for and seen by the coach themselves. No manager or firm-level visibility.
- **Phase 2 (future).** A firm-facing dashboard per coach showing progress over time and against cohort context. Same scoring engine, same scale.

---

## 3. privacy and confidentiality

- **Clients are identified by initials only** (e.g. `M.W.`).
- Phase 1 reports are private to the coach.
- Handling of recordings, transcripts, and reports must respect ICF confidentiality obligations (ICF Code of Ethics 2.1–2.5).
- Client consent for recording and AI-assisted evaluation must be documented in the coaching agreement before this system runs on live client work. Per-session verbal consent check is the approved mechanism.

---

## 4. design language

The report is intentionally calm, flat, and document-like. It reads as a professional instrument, not a dashboard with visual noise.

### principles

- **Flat surfaces.** No gradients, drop shadows, glow, or decorative effects. Plain background, thin `0.5px` dividers between sections.
- **Generous whitespace.** Sections separated by a top border and vertical breathing room.
- **Restraint with color.** Color carries meaning only (status, scoring band). Never decorative.
- **Sentence case everywhere.** No Title Case, no ALL CAPS — including labels and headings.
- **Two type weights only.** Regular and medium. Numbers are the largest type on the page; labels are small and muted.
- **Scannable hierarchy.** Summary cards readable at a glance; competency detail available on demand.

### color tokens (semantic — implement with CSS variables)

| token | purpose |
|-------|---------|
| `--color-danger` | threshold breach, falling score, red flags |
| `--color-warning` | at threshold, amber execution |
| `--color-success` | threshold met or exceeded, green execution, rising score |
| `--color-info` | proficient band, neutral informational accent |
| `--color-muted` | baseline states, "no data yet" |
| `--color-surface` | metric card fill (muted, no border) |
| `--color-divider` | 0.5px section borders |

### band chip colors

| band | color family |
|------|-------------|
| Strong · Masterful | success (green) |
| Proficient | info (blue) |
| Developing · Emerging | warning (amber) |

### typography tokens

| element | spec |
|---------|------|
| Score numbers | largest size, medium weight |
| Section titles | ~16px, medium weight |
| Labels / captions | small, muted, regular weight |
| Body text | regular weight |

### layout

- Metric cards: muted surface fill, no border, medium corner radius, responsive grid (`auto-fit`, ~140–150px min column).
- Section dividers: `0.5px` top border, generous vertical padding above and below.
- No decorative elements. Spacing is the only decoration.

---

## 5. report anatomy

Sections appear in this fixed order:

1. **Header** — report title; coach name; client initials; session type (e.g. "1:1 leadership, faith-integrated"); session number within the engagement (e.g. "session 3 of 12"); overall band pill (e.g. "Proficient · PCC range").
2. **Score summary** — three metric cards plus scale key: this session score (out of 5); strongest competency (name); lowest competency (name). One-line scale key beneath cards.
3. **Conversation metrics** — seven behavioral metric cards (see §7). Caption notes whether figures are estimated or parsed.
4. **ICF competency read** — eight competencies grouped under four domains, each with a band-and-score chip and one-line evidence note tied to a sub-competency number.
5. **WIN debrief** — what went well · improve (one) · next step (see §9).
6. **Score trend** — overall and per-client trajectory (see §10). First scored session shows a baseline note rather than a chart.
7. **Actions** — lightweight buttons (e.g. "see evidence moments," "add my own scores").

---

## 6. scoring model

### 6.1 the 5-point band scale

| score | band | reference |
|------:|------|-----------|
| 1 | Emerging | Below competent practice |
| 2 | Developing | Approaching competent practice |
| 3 | Proficient | Competent practice (≈ PCC range) |
| 4 | Strong | Consistently skilled |
| 5 | Masterful | Mastery (≈ MCC range) |

A solid PCC-level coach lands around 3. This is honest, not generous.

### 6.2 competencies scored

All eight ICF 2025 Core Competencies, grouped by domain:

- **A · Foundation:** 1. Demonstrates ethical practice · 2. Embodies a coaching mindset
- **B · Co-creating the relationship:** 3. Establishes and maintains agreements · 4. Cultivates trust and safety · 5. Maintains presence
- **C · Communicating effectively:** 6. Listens actively · 7. Evokes awareness
- **D · Cultivating learning and growth:** 8. Facilitates client growth

> Competency names and numbering per ICF 2025 Core Competencies (© International Coaching Federation). Evidence notes cite specific sub-competency numbers (e.g. `6.04`).

### 6.3 evidence-linked scoring

Every competency score carries a one-line evidence note tied to a specific moment in the session and a sub-competency number. The score is never a bare number.

### 6.4 overall session score

Equal-weighted average of the eight competency scores, rounded to one decimal. Equal weighting is the v0.3 default.

> **Open option (not enabled):** weight a coach's active development edges more heavily so the overall score moves when they work on them.

### 6.5 attunement standard

The hinge between band 3 (Proficient) and band 4 (Strong) for Competencies 5, 6, and 8:

- **Focus → band 3.** Coach is present and attentive.
- **Attunement → band 4.** Coach reads and responds to what is emerging in the client in real time; adjustments are visible in behavior, not just intention.

This is theLeadershipWell's proprietary standard layered on the ICF baseline.

---

## 7. conversation metrics

Seven behavioral metrics drawn from the transcript. Requires a speaker-separated verbatim transcript (see §12). Each threshold colors its card and shows a short status line. A caption notes whether figures are estimated or parsed.

### metric 1: coach talk-time

| field | value |
|-------|-------|
| definition | % of words spoken by the coach |
| threshold | 🔴 Red if > 40% |
| source | theLeadershipWell rule |

### metric 2: flagged emotion (6.04)

| field | value |
|-------|-------|
| definition | Count of coach moves that tune into client emotion |
| threshold | 🔴 Red if < 2 · 🟡 Amber if = 2 · 🟢 Green if > 2 |
| source | theLeadershipWell rule |

**What counts — four triggers:**

1. **Naming a feeling observed** — e.g. "you sound frustrated."
2. **Asking a feeling question** — e.g. "how are you feeling about that?"
3. **Reflecting an energy shift** — e.g. "something just changed when you said that."
4. **Mirroring the coach's own felt response** — e.g. "hearing that, I'd feel…" A mirror counts only when it hands the emotion back to the client (e.g. "…what's that like for you?"). A mirror that centers the coach's own experience does not count.

### metric 3: question : statement ratio

| field | value |
|-------|-------|
| definition | Ratio of coach questions to coach statements |
| threshold | 🟢 Green when questions exceed statements · 🔴 Red when statements exceed questions |
| parity case | Parity (roughly 1:1) is red in v0.3 (under review) |
| source | theLeadershipWell rule |

**Consultant pull signature:** when Jeff is intellectually engaged with business content, the ratio inverts — statements exceed questions. This inversion is the measurable behavioral signature of consultant pull.

### metric 4: reflective pauses

| field | value |
|-------|-------|
| definition | Count of deliberate pauses / silences the coach creates |
| threshold | Count only, no threshold yet |
| source | — |

### metric 5: role shifts flagged aloud

| field | value |
|-------|-------|
| definition | Count of times the coach explicitly named a shift out of the coaching role |
| threshold | Count only, no threshold yet |
| source | — |

### metric 6: feeling explorations

| field | value |
|-------|-------|
| definition | Count of times the coach stays with an emotion and asks deepening questions (origin, meaning, function, cost) — distinct from reflections |
| threshold | Zero explorations caps Competency 6 score at 3 regardless of emotion-flag count |
| source | theLeadershipWell rule (v0.2) |

**Reflection vs. exploration distinction:**

- **Reflection:** naming or mirroring a feeling — e.g. "you sound frustrated." Counts as a flagged emotion event.
- **Exploration:** staying with the feeling and asking into it — e.g. "where does that frustration come from?" / "what does it cost you?" Counts as both a flagged emotion event AND a feeling exploration.

Zero explorations in a session caps Competency 6 at a maximum of 3, regardless of how many emotion flags exist.

### metric 7: consultant moves

| field | value |
|-------|-------|
| definition | Count of times the coach steps into a consulting, teaching, mentoring, or framework-offering role within a session |
| source | theLeadershipWell rule (v0.3, calibrated H.B. session June 2026) |

**Four-criteria sub-rubric (each scores 0 or 1):**

| criterion | description |
|-----------|-------------|
| signaled | coach explicitly names the role shift before making the move |
| permissioned | client agrees (explicitly or clearly implicitly) before the move proceeds |
| brief | the move is terse; it does not crowd out the client's discovery time |
| floor returned | coach immediately invites the client to reflect after the move |

**Score per move: 0–4 criteria met.**

**Threshold logic:**

| condition | status | flag |
|-----------|--------|------|
| Any move scoring 0–2 on four criteria | Poor execution | 🔴 Red |
| Any move scoring 3 on four criteria | Acceptable — watch pattern | 🟡 Amber |
| Any move scoring 4 on four criteria | Well executed | 🟢 Green |
| Move count > 3 in a session | Drift from coaching mode | 🔴 Red |
| Move count ≤ 3, all well executed | Strong execution | 🟢 Green |

**Design note:** The consultant or teaching move is not inherently a mindset failure. It can be an expression of deep client knowledge and genuine investment in client growth. What matters is execution quality, not the mere presence of the move. The count threshold of 3 is an independent flag — more than three moves signals drift from coaching as the dominant mode, even if each individual move is well executed.

---

## 8. theLeadershipWell standards (refinements on ICF)

ICF is the floor; these are the proprietary refinements. v0.3 standards locked:

| standard | rule |
|----------|------|
| Coach talk-time | ≤ 40%. Flagged above 40%. |
| Flagged emotion | ≥ 2 per session minimum. < 2 = red; = 2 = amber; > 2 = green. |
| Questions vs. statements | Questions should outnumber statements. Inversion signals drift toward telling. |
| Teaching / consultant moves | Welcome only when signaled, permissioned, brief, and floor returned. > 3 moves per session = mode drift flag. |
| Role-shift flagging | When stepping out of coaching role, name it. Flagging is necessary but not sufficient — quality of execution determines the score. |
| Feeling exploration | Naming emotions is not enough. Staying with them and asking deepening questions is what moves Competency 6 to band 4. Zero explorations caps Competency 6 at 3. |
| Attunement standard | The hinge between band 3 and band 4 for Competencies 5, 6, and 8. Focus earns a 3; attunement earns a 4. |

---

## 9. competency scoring rubric

### general band definitions (applies to all competencies unless overridden below)

| score | band | definition |
|------:|------|-----------|
| 1 | Emerging | Competency is absent or actively undermined |
| 2 | Developing | Competency attempted but inconsistent or partial |
| 3 | Proficient | Competency present and reliable; meets ICF PCC standard |
| 4 | Strong | Competency consistent and skilled; attunement visible |
| 5 | Masterful | Competency at mastery; feels effortless and generative for the client |

### competency 2 — embodies a coaching mindset (explicit band definitions)

These definitions replace the generic bands for Competency 2 only.

| score | band | definition |
|------:|------|-----------|
| 3 | Proficient | Coach is generally client-centered; names role shifts when they occur; curiosity present but process-curiosity underdeveloped. Consultant moves may occur without full signaling or permission. |
| 4 | Strong | Consultant moves are signaled, permissioned, brief, and returned to the client. Coach shows awareness of bias toward frameworks and content. Nurtures the client's own curiosity rather than filling space with frameworks. |
| 5 | Masterful | Deep mastery of 2.01, 2.04, 2.05, 2.09. Coach holds not-knowing with the client. Curiosity is contagious. Framework offers feel like the client's own discovery. Consultant moves are rare, surgical, and indistinguishable from evocation. |

**Sub-competencies driving the 3→4 transition:**

- `2.01` — Acknowledges that clients are responsible for their own choices
- `2.04` — Remains aware of and open to the influence of biases, context and culture on self and others *(includes bias toward frameworks and content)*
- `2.05` — Uses awareness of self and one's intuition to benefit clients
- `2.09` — Nurtures openness and curiosity in oneself, the client, and the coaching process

**Calibration note:** The identified pull toward consulting and frameworks is diagnosed primarily as a bias toward action (`2.04`) and insufficient process-curiosity (`2.09`), not as a failure of impact awareness (`2.10`). `2.10` is a documented strength.

### competencies 5, 6, 8 — attunement standard applies

For these three competencies, band 3 requires focus; band 4 requires attunement. The coach must demonstrate visible responsiveness to what is emerging in the client in real time to reach band 4.

---

## 10. WIN debrief

The WIN block is the human reflection layer, structurally separate from machine-generated scores.

| step | prompt | instruction |
|------|--------|-------------|
| **W** — What went well | "What went well?" | Generate a list. Ask "what else?" until ideas are exhausted. |
| **I** — Improve (one) | "What would you improve?" | One thing only. Generally the most important. Coach shares first; mentor coach may add perspective. |
| **N** — Next step | "What will you do next?" | One concrete, behavioral practice step for the next session. Connects to running development edges where relevant. |

---

## 11. score trend

Two trend questions:

1. **Am I getting better overall?** Line across all the coach's scored sessions, all clients.
2. **Am I getting better with this client?** Line across only this client's sessions (identified by initials).

The per-client line matters because a coach's edges often show up most with particular clients (e.g. business-rich clients that tempt consultant drift).

**Mechanics:**

- Trend baselines at the first scored session; chart populates as more sessions are scored.
- Score deltas display green when rising, red when falling, neutral (muted) when no prior data.
- Y-axis anchored to the band scale (developing / proficient / strong), not raw numbers.

---

## 12. required input

**Speaker-separated verbatim transcript required.** Preferred format: Zoom cloud-recording VTT. Speaker attribution is what enables talk-time calculation, question/statement counting, and emotion-flag detection. An AI summary is insufficient — summaries materially limit scoring of Competencies 5, 6, and 7.

---

## 13. calibration approach

1. The engine scores a session blind.
2. The coach self-scores the same session.
3. The two are reconciled; gaps refine the rubric.

After several rounds, the rubric becomes theLeadershipWell's documented standard, not a generic AI judgment. The 5-band scale is intentional — it makes "strong" mean the same thing across coaches.

**Calibration is ongoing, not a prerequisite gate.** Receiving auto-scored sessions accelerates rubric calibration over time; calibration runs alongside the build.

---

## 14. calibration anchors (sessions scored to date)

| session | key calibration output |
|---------|----------------------|
| K.H. | Anchor document pending |
| B.D. | — |
| L.F. | — |
| Michel W. | — |
| M.W. | — |
| K.V. | feeling_explorations metric (v0.2) |
| H.B. | consultant_moves metric and Competency 2 band definitions (v0.3) |

**H.B. session reconciled scores:**

| # | competency | self | machine | reconciled |
|---|-----------|------|---------|-----------|
| 1 | demonstrates ethical practice | 4 | 4 | 4 |
| 2 | embodies a coaching mindset | 4 | 3 | 4 |
| 3 | establishes and maintains agreements | 4 | 4 | 4 |
| 4 | cultivates trust and safety | 4 | 4 | 4 |
| 5 | maintains presence | 4 | 3 | 3 |
| 6 | listens actively | 4 | 3 | 3 |
| 7 | evokes awareness | 3 | 3 | 3 |
| 8 | facilitates client growth | 3 | 3 | 3 |

**H.B. reconciled overall: 3.5 · Strong**

**H.B. consultant moves detail:**

| move | score | criteria met |
|------|-------|-------------|
| WIN framework / three-question feedback offer | 3/4 · Amber | Signaled ✅ Permissioned ✅ Brief ⚠️ (ran long) Floor returned ✅ |
| Autonomy reframe near close | 3/4 · Amber | Signaled ✅ Brief ✅ Floor returned ✅ Permission implicit not explicit ⚠️ |

Session verdict: count 2 (🟢 green) · execution amber · pattern to watch.

---

## 15. active development edges (Jeff H.)

Tracked across sessions. These are the running edges used to anchor the next-step in the WIN debrief.

| edge | sub-competency | behavioral signature |
|------|---------------|---------------------|
| Consultant pull / role discipline | 2.04 | Bias toward action and frameworks; question-to-statement ratio inverts when intellectually engaged with business content |
| Emotional attunement — exploration level | 6.04 | Naming and mirroring feelings is present; staying with emotions and asking deepening questions (origin, meaning, function, cost) is the gap |
| Coach talk-time discipline | — | Talk-time exceeds 40% threshold on business-rich sessions |
| Question-to-statement ratio | — | Ratio inverts in consultant pull moments |

**Current practice commitment (updated H.B. session, June 2026):** deliberate slow breathing throughout the entire session as a physical anchor for slowing down — not only when urgency is felt. This commitment was identified in a prior session but was not implemented during the H.B. session.

---

## 16. data model

The evaluation engine outputs a structured JSON object. The report template renders from this. This decouples scoring from presentation and feeds both the report and the trend store.

```json
{
  "session": {
    "coach": "Jeff H.",
    "client_initials": "M.W.",
    "type": "1:1 leadership, faith-integrated",
    "session_number": 3,
    "engagement_total": 12,
    "date": "2026-05-26"
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
      "evidence": "Named frustration once; emotions often passed over for concepts",
      "subcompetency_refs": ["6.04", "6.02"]
    }
  ],
  "metrics": {
    "coach_talk_time_pct": 60,
    "coach_talk_time_flag": "red",
    "flagged_emotion_count": 2,
    "flagged_emotion_flag": "amber",
    "feeling_explorations": 1,
    "feeling_explorations_flag": "green",
    "question_to_statement": "1:1.8",
    "question_to_statement_flag": "red",
    "reflective_pauses": 3,
    "role_shifts_flagged": 2,
    "consultant_moves": {
      "count": 2,
      "count_flag": "green",
      "execution_flag": "amber",
      "moves": [
        {
          "description": "WIN framework / three-question feedback offer",
          "signaled": true,
          "permissioned": true,
          "brief": false,
          "floor_returned": true,
          "score": 3,
          "status": "amber"
        },
        {
          "description": "Autonomy reframe near close",
          "signaled": true,
          "permissioned": false,
          "brief": true,
          "floor_returned": true,
          "score": 3,
          "status": "amber"
        }
      ]
    },
    "source": "parsed"
  },
  "win": {
    "went_well": "...",
    "improve": "...",
    "next_step": "..."
  },
  "evidence_moments": [
    {
      "competency": "6.04",
      "timestamp": "00:20:27",
      "quote_short": "...",
      "note": "..."
    }
  ]
}
```

---

## 17. scoring engine rules

Rules the engine must apply before producing a score:

1. **Feeling explorations gate:** if `feeling_explorations === 0`, Competency 6 maximum score is 3, regardless of `flagged_emotion_count`.
2. **Consultant moves mode drift flag:** if `consultant_moves.count > 3`, flag mode drift (red) regardless of individual move execution quality.
3. **Attunement gate for Competencies 5, 6, 8:** a score of 4 requires evidence of attunement (visible real-time responsiveness to what is emerging), not just consistent focus.
4. **Competency 2 band 4 gate:** all four consultant move criteria (signaled, permissioned, brief, floor returned) must be consistently met across the session for a band 4 score.
5. **Overall score:** equal-weighted average of all eight competency scores, rounded to one decimal.
6. **Transcript requirement:** if no speaker-attributed verbatim transcript is present, metric fields should return `null` and `source` should be `"unavailable"`. Do not estimate from summaries.

---

## 18. open items (not yet locked in v0.3)

| item | status |
|------|--------|
| Scoring rubric — full band definitions for Competencies 1, 3, 4, 5, 6, 7, 8 | Not yet written; highest-priority next artifact |
| Question : statement parity case (1:1 ratio = amber or red?) | Under review; v0.3 treats parity as red |
| Talk-time threshold re-anchoring | 40% is a working rule; to be re-anchored against coach's strongest sessions |
| Edge weighting in overall average | Not enabled |
| Thresholds for reflective pauses and role-shift flags | Currently counts only |
| K.H. and K.V. anchor documents | Need to be drafted as markdown from prior session notes |
| Automated pipeline | Claude Code routine monitoring Google Drive folder of Plaud.ai transcripts; fuzzy client-name matching against canonical roster; auto-scoring; email delivery. Remaining build: client matching logic and email delivery. |

---

## 19. automation pipeline (design intent)

- **Transcript source:** Plaud.ai → Zapier → Google Drive folder
- **Preferred transcript format:** Zoom VTT (speaker-separated)
- **Matching:** fuzzy client-name matching against a canonical roster sheet; fail-loud principle — flag for manual confirmation when confidence is not clear rather than guessing
- **Scoring:** Claude Code routine runs the scoring engine against the Session Report Spec
- **Delivery:** email scorecard to coach
- **Consent:** built into coaching agreements with per-session verbal check (framework resolved)
- **Fail-loud principle:** flags teach the roster over time; never auto-assign an uncertain match

---

## 20. repo structure

```
coaching-eval/
  spec/
    theLeadershipWell_Session_Report_Spec_v0.1.md
    theLeadershipWell_Session_Report_Spec_v0.3.md
  calibration/
    anchor_KH.md          ← pending
    anchor_BD.md
    anchor_LF.md
    anchor_MichelW.md
    anchor_MW.md
    anchor_KV.md          ← pending full draft
    anchor_HB.md
```

---

*theLeadershipWell Coaching Session Report Spec · v0.3 · Dr. Jeff Holmes · June 2026*
*ICF 2025 Core Competencies © International Coaching Federation — referenced, not reproduced.*
