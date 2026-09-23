# Calibration ledger — ZF 360 interpretation (Part B1)

Interpretation is calibrated by walking each report with Jeff, one report per
session, Jeff narrating as a coach speaking to a client. Claude Code is scribe
and interviewer, never interpreter. **Calibration is complete only when all
five reports have been walked AND new-rule saturation is reached.** Meeting
the battery's numeric bars while reports remain unwalked is not completion.

## Prerequisite (never schedule a walkthrough before this)

A1 automated checks pass clean on the report (`validate-extraction`), and the
verification sheet for it exists (`generate-verification-sheet`). A2 hand
verification is folded into the walkthrough: as Jeff reads a page, the scribe
compares live against the sheet and logs confirmations and discrepancies.

## Reports and status

| # | report | layout | A1 | walked | new rules | confirms existing | never_say added | open questions |
|---|---|---|---|---|---|---|---|---|
| 1 | J.H. (reference, Aug 2024) | initial 2024 | pass (62-check spike; not re-run here — PDF not in this container) | — | — | — | — | — |
| 2 | D.A. (first follow-up, Oct 2025) | follow-up | pass (spike; PDF not in this container) | — | — | — | — | — |
| 3 | J.J. (Mar 2025) | initial 2025 print | **pass 14/14 (2026-09-23)** | **2026-09-23 (async, Obsidian)** | 6 | 4 | 0 | 6 (rules file §Questions) |
| 4 | T.K. (Oct 2025) | follow-up | **pass 14/14 (2026-09-23)** | — | — | — | — | — |
| 5 | M.H. (Oct 2025) | follow-up | **pass 14/14 (2026-09-23)** | **2026-09-23 (async, Obsidian)** | 16 | 4 | 3 | 0 open — 10 rulings in the rules file |

Suggested order: 3 (initial layout, fatal-flaw band, both gap directions) →
1 (Jeff's own, the existing anchor) → 5 (a rise, folded Others) → 4 (the hard
one: almost everything in the fatal-flaw band, 18 meaningful declines) → 2.

## Saturation curve

| session | report | new rules | cumulative | notes |
|---|---|---|---|---|
| 1 | 5 (M.H.) | 16 | 16 | first report walked; 2 tensions with the code floor (asserting meaningful improvement; naming a target), 1 conflict with the brief (never quote fatal-flaw comments), 1 extractor gap (engagement items) |
| 2 | 3 (J.J.) | 6 | 22 | fatal-flaw band and gap-direction cases; the rater-group opening recurred; new vocabulary "CPO"; 4 report-5 rules confirmed on a very different report |

Report 1 should generate many; by reports 4 and 5 most of what Jeff says
should already be covered. If report 5 still produces substantial new rules,
calibration has not converged — say so, and the finding is that more reports
are needed.

## Standing `never_say` list

Seeded from rubrics/04 §7. Every line Jeff refuses in a session is appended
with its transcript reference.

- "you are strong at this" → say "your peers saw this as a standout"
- "you underrate / overrate yourself" → "others saw more here than you did"
- "closest to green", "the weighting puts this first"
- "your weakness is" / "you should be concerned"
- "your direct reports scored you…" when they were combined
- "your top three goals are…"
- any estimate of a number not in the report
- calling out a low score (L39, report 5) — strengths focus; a fatal-flaw band is the only exception, and later
- dwelling on the lowest tent pole (L69, report 5)
- quoting a potential-fatal-flaw comment (L160, report 5) — itemize and summarize, never quote

## Open questions carried between sessions

- Report 3: 6 questions in `report-3-rules.md` §Questions (rater-group opening as the general first move; the fatal-flaw definition the assistant gives; fatal flaws at the CPO; target choice below the 75th; "blind spot" / "reality check" wording; "CPO" with the client).
- Report 5: none open. `targets.ts` changed 2026-09-23 (Promising first, no 75th floor, equal weights + manager flag); golden fixtures re-frozen.
- Brief v2.2 candidate drafted (rubrics/04 §8c), unpublished pending Jeff's read, the golden set and the battery.
- Next walkthrough: report 4 (T.K.) — the fatal-flaw-dominated follow-up, 18 meaningful declines; then 1 (Jeff's own) and 2 (D.A.).
- Extractor gap: engagement items (61–66) with per-item scores and previous — Jeff reads them; the parser stores only the total.

## Files per session

- `calibration/report-N-transcript.md` — Jeff's narration, page-referenced, verbatim (template: `TEMPLATE-transcript.md`).
- `calibration/report-N-rules.md` — brief candidates, each `new` / `confirms existing`, with the transcript line (template: `TEMPLATE-rules.md`).
- The `prompt_briefs` version bump (`node scripts/rubrics/publish-brief.js assessment_360 --sql` after editing rubrics/04 §10).
- A2 results for the report (the filled sheet → discrepancies logged in `VALIDATION_RESULTS.md`).
- The §B3 battery re-run on that report, divergences from the narration fixed before the next session.
