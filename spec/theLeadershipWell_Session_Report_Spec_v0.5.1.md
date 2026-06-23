# theLeadershipWell — Scoring Engine Patch
**Patch: v0.5 → v0.5.1**  ·  Owner: Dr. Jeff Holmes  ·  Status: approved, implement  ·  June 2026

Two changes surfaced during the Fernando/PDI (June 23 2026) calibration reconciliation against the v0.5 engine. Both are corrections to v0.5, not new methodology. Apply against `spec/theLeadershipWell_Session_Report_Spec_v0.4.md` + the v0.5 delta.

- **PATCH 1 — C6 composite bug (defect).** Engine file: `lib/scoring/engine.ts`. The B3 dimensional split is reasoned in the rationale but not wired into the score. This is a true bug; behavior is wrong.
- **PATCH 2 — C3 band-4 clarifying clause (rubric clarification).** Rubric file: `lib/scoring/rubric.ts` (`COMPETENCY_BANDS`, competency 3). The engine is reading B4 more strictly than the spec intends.

---

## PATCH 1 — C6 composite must combine both dimensions (defect)

### Symptom

On the Fernando session, C6 should land **~3.6** (strong cognitive/structural listening, gated emotional dimension). The v0.5 engine returned **3.0**. The engine's own rationale performed the B3 dimensional reasoning correctly ("caps emotional dimension at 3.0") but then returned the gated emotional value as the whole C6 score. The cognitive/structural dimension was computed and then ignored.

This is the same defect shape seen on the Kevin session: dimensional logic present, composite wiring incomplete.

### Root cause

The feeling-exploration gate (Gate 3) is capping the **C6 composite** instead of capping **only the emotional dimension**. B3 (v0.5) specifies that Gate 3 caps `dimensions.emotional` only; the cognitive/structural dimension (6.01, 6.02, 6.03, 6.05, 6.06) scores independently and contributes to the composite regardless of the emotional cap.

The model applies Gate 3 to the top-level C6 `score` itself (as instructed by an ambiguous prompt clause), then returns `score: 3.0` without a `dimensions` field. The engine's composite code never runs. Fix is two-pronged: (1) tell the model NOT to gate the top-level score — always return raw dimensional sub-scores and let the engine compute the composite; (2) use a composite formula where a strong cognitive/structural dimension materially lifts the result above the gated emotional floor.

### Fix

1. Score C6 as two separate dimensions:
   - `dimensions.emotional` — driven by 6.04 and the feeling-reflection / coping-inquiry / feeling-exploration logic. **Gate 3 caps this value only.** (Coping inquiry remains excluded from the exploration count.)
   - `dimensions.cognitive_structural` — driven by 6.01, 6.02, 6.03, 6.05, 6.06: reflecting/summarizing content, catching patterns, surfacing cross-session themes, and using the client's own metaphors/examples/language back to them. **Not capped by Gate 3.**

2. The **C6 composite must combine both dimensions** and must not return the gated emotional value as the whole score. A strong cognitive/structural read must be able to lift C6 above the emotional cap.

3. Composite formula (v0.5.1): `composite = max(emotionalCapped, 0.4 × emotionalCapped + 0.6 × cognitive_structural)`. This ensures the composite is never below the emotional floor, and a stronger cognitive dimension materially lifts it.

4. `feeling_explorations` remains a **visible sub-metric** in the report regardless of the composite (per B3 — the attunement edge must stay in view even though it no longer vetoes all of C6).

### Regression tests (both must pass)

- **Fernando/PDI (June 23 2026):** C6 composite ≈ **3.6** (emotional ≈ 3.3 gated to 3.0, cognitive/structural ≈ 4.0: `max(3.0, 0.4×3.0 + 0.6×4.0) = max(3.0, 3.6) = 3.6`). Must NOT return 3.0.
- **Kevin (June 22 2026):** C6 must reflect the dimensional split. Cognitive/structural dimension (cross-session callback, pattern catch) must contribute.
- **Gate-3 integrity check:** a session with zero feeling explorations AND weak cognitive/structural listening (e.g., both dimensions ≈ 2.5) must still land low — the fix must not float C6 up artificially when neither dimension is strong. `max(2.5, 0.4×2.5 + 0.6×2.5) = max(2.5, 2.5) = 2.5` ✓.

### Data model (already specified in v0.5, confirm it is emitted)

```json
{
  "id": 6,
  "name": "Listens actively",
  "score": 3.6,
  "band": "Proficient",
  "dimensions": {
    "emotional": { "score": 3.3, "gate": "feeling-exploration cap applied to this dimension only" },
    "cognitive_structural": { "score": 4.0, "evidence": "client's own words reused (6.02); cross-session callback (6.06)" }
  }
}
```

---

## PATCH 2 — C3 band-4 clarifying clause (rubric clarification)

### Symptom

On the Fernando session, the engine capped C3 at **3.0**, partly reasoning that the coach "does not consolidate into a named single session insight or formally close the agreement loop." Reconciled score is **3.8**. The engine is requiring explicit coach-named closure for band 4; the spec does not.

### Clarification (owner ruling)

Coach consolidation / explicit naming-and-closing of the agreement loop is a **band-5 texture** (coach-driven structure), **not** a band-4 requirement. Requiring it at band 4 penalizes the client autonomy the higher bands are meant to reward.

### Fix — update `COMPETENCY_BANDS` competency 3

| score | band | definition |
|---|---|---|
| 3 | Proficient | Client has an agenda; coach receives it cleanly and works it. A clear, self-evident agenda received well is a legitimate 3. |
| 4 | Strong | Coach helps refine the agenda when refinement adds value (asks around items, sharpens outcomes, tests completeness); if the agenda already has clear outcomes and needs no refinement, clean receipt is itself band 4. Coach tracks the agreement when the client shifts it mid-session. **A client-generated recap/close satisfies the close at band 4 — explicit coach consolidation or coach-named closure of the loop is NOT required at band 4 and is a band-5 signal only.** |
| 5 | Masterful | Client manages agenda and focus largely themselves; coach nearly invisible (Invisibility Standard). Explicit coach-named closure of the agreement loop, where it serves the client, appears here. |

### Regression test

- **Fernando/PDI:** C3 ≈ **3.8**. The mid-session client-initiated pivot (CRO topic) tracked without re-contracting, plus the multi-item client recap at close, satisfies band 4. Absence of an explicit coach-named close must NOT cap at 3.

---

## Calibration record

| session | competency | v0.5 engine | reconciled | cause |
|---|---|---|---|---|
| Fernando/PDI | C6 | 3.0 | **3.6** | Patch 1 — composite bug |
| Fernando/PDI | C3 | 3.0 | **3.8** | Patch 2 — band-4 over-read |

Fernando/PDI reconciled overall: app 3.4 → **~3.65 · Strong (low band)** after both patches.

---

## Version history

- **v0.5** — Engine fixes (attribution integrity, four-bucket taxonomy, metadata fail-loud, consultant-count as flag not cap) + rubric refinements (decimals, signaling-credit, C6 dimensional split, C3 band logic, C8 offer-vs-recommendation). Kevin session anchor.
- **v0.5.1** — Patch 1: C6 composite must combine both dimensions; Gate 3 caps emotional dimension only, not the composite (defect fix). Patch 2: C3 band-4 clarifying clause — client-generated recap satisfies the close; explicit coach-named closure is a band-5 signal only. Fernando/PDI session documented as calibration anchor for both.

*theLeadershipWell Scoring Engine Patch · v0.5 → v0.5.1 · Dr. Jeff Holmes · June 2026*
