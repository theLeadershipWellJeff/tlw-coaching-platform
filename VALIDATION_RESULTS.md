# ZF 360 validation results

Protocol: "Validation Protocol — ZF 360 Extraction Accuracy & Interpretation
Alignment" (Jeff, 2026-09-23). This file is the running record. Participants
appear as initials only; the reports themselves live in `fixtures/private`
(gitignored) and never enter git.

**Status at 2026-09-24:** Part A is built and passes on the three reports in
hand; the two earlier reports pass their own spikes but were not re-run under
the new harness (PDFs not in this container). **Part B: B1 walkthroughs done
for reports 5 and 3 (rulings filed); the battery runner is built and unrun.**
The portal is **not** signed off for live use.

## 0. Corpus survey

| # | Report | Report date | Template vintage (© year / layout) | Pages | M / P / DR / O / S received | Collapsed? | Engagement | Lowest band present |
|---|---|---|---|---|---|---|---|---|
| 1 | J.H. (Jeff, reference) | 2024-08-12 | 2024 / initial | ? (PDF not here) | 2 / 3 / 2 / 1 / 1 | DR → Others (reported 2 / 3 / — / 3 / 1) | not reported | Below Average (Solves Problems 3.96) |
| 2 | D.A. (first follow-up) | 2025-10-05 | 2025 / follow-up | ? (PDF not here) | 1 / 3 / 5 / 11 / 1 | no | 3.93 Below Average | Below Average (Makes Decisions 3.85) |
| 3 | J.J. | 2025-03-18 | 2025 / initial | 33 | 3 / 4 / 4 / 3 / 1 | no | 3.37 **Potential Fatal Flaw** | **Potential Fatal Flaw** (2 competencies) |
| 4 | T.K. | 2025-10-05 | 2025 / follow-up | 39 | 1 / 6 / 3 / 0 / 1 | no (prior: 2 Others dropped) | 3.89 Below Average | **Potential Fatal Flaw** (17 competencies, overall, all poles) |
| 5 | M.H. | 2025-10-05 | 2025 / follow-up | 39 | 1 / 2 / 8 / 4 / 1 | Others → Peers (reported 1 / 6 / 8 / — / 1), both administrations | 4.52 Promising | Below Average (Takes Risks 3.89) |

Rows 1–2 are from `scripts/spikes/verify-assessment-360.js` / `verify-followup-360.js` and rubrics/04 §8; rows 3–5 from this run.

### Coverage gaps (structural variants NOT represented)

- **A 2026 template vintage.** Every report is a 2024 or 2025 print. The
  fingerprint refuses an unknown layout (`unsupported`, never parsed), so a
  changed vendor template fails loud rather than wrong — but it fails.
- **Two uploads for the same client** (the platform's own `comparison`
  block). `compare.ts` has never run on a real pair; only the vendor's
  printed `reassessment` has been exercised (reports 2, 4, 5).
- **Peers folded into Direct Reports**, or **Others folded into Direct
  Reports** (seen: DR → Others, Others → Peers).
- **A section with zero verbatim responses** (closest: M.H. manager = one
  comment per section; T.K. self fatal-flaws = three).
- **A Profound Strength on an initial-layout report other than Jeff's**, and
  **a Promising-heavy initial report** (reports 3–5 are either fatal-flaw
  dominated or follow-ups).
- **A single-page rater table with more than ~9 raters on the initial
  layout** (overflow was seen on follow-ups only).
- **Non-Latin or accented participant names** against the name gate.
- **A report where the Manager group has 0 submissions** (a report with no
  manager row).

### Blocking question (not worked around)

**Is at least one of these the template vintage the November cohort will
produce?** Reports 2–5 are Zenger Folkman prints from March–October 2025;
the cohort administers in late 2026. If ZF has changed the print since,
extraction validation on these five proves nothing about the live run. The
protocol's rule stands: obtain one report from the cohort's actual
administration and run it through `validate-extraction` before any upload.
Until Jeff confirms the vintage, assume **not proven**.

## Part A — extraction accuracy

### A1. Automated self-consistency (14 checks per report)

Run: `node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json && node .spike-build/scripts/validation/validate-extraction.js --golden`

| # | check | J.J. | T.K. | M.H. | notes |
|---|---|---|---|---|---|
| 1 | geometry vs printed score, every row, ≤ 0.03 | pass (0.00) | pass (0.00) | pass (0.00) | rankings / overall / tent charts |
| 2 | competency total ≈ mean of items ±0.02 | pass (0.01) | pass (0.00) | pass (0.01) | n-weighted — the vendor averages ratings, not item means |
| 3 | tent pole ≈ mean of items beneath ±0.02 | pass (0.01) | pass (0.01) | pass (0.00) | resolved the 0.04 "tent" deviation of 2026-09-22 (that was mean-of-competencies) |
| 4 | overall ≈ mean of all 60 items ±0.02 | pass (0.00) | pass (0.00) | pass (0.00) | |
| 5 | gap = total − self | pass | pass | pass | 19 rows each |
| 6 | rankings by band then score | pass | pass | pass | |
| 7 | band consistent with score vs norms | pass | pass | pass (2 rows within 0.05 flagged) | flags on the sheet |
| 8 | rater counts vs tables | pass | pass | pass | max item n = reported non-self raters (14 / 10 / 15); group columns match reported groups |
| 9 | highest / lowest are the extremes | pass | pass | pass | against all 60 item totals |
| 10 | ranges and nulls | pass | pass | pass | |
| 11 | zero rater names in text / data / prompt payload | pass (15) | pass (18) | pass (16) | invited raters checked |
| 12 | calibration residual < 0.05 | pass (0.00) | pass (0.00) | pass (0.00) | |
| 13 | six passions | pass | pass | pass | |
| 14 | importance totals = column sums | pass (60 votes) | pass (40) | pass (48) | |

**3/3 pass; 0 failures; 2 flags (M.H. rows near a threshold, both colour-correct).**
Reports 1–2: not re-run here. Their spikes (62 + 40 checks) pass as of
2026-09-22; run this harness on them the next time the PDFs are shared.

### A2. Stratified human verification

**M.H. — verified by Jeff 2026-09-23** (async, Obsidian): identity, overall, engagement, tent, all 19 rankings, reassessment, gaps ticked OK; discrepancies table empty. Highest / lowest behaviors and importance tables confirmed verified by Jeff the same day. **A2 for M.H.: 0 discrepancies, complete.**

**J.J. — verified by Jeff 2026-09-23** (async, Obsidian): every table ticked OK, discrepancies table empty. **A2 for J.J.: 0 discrepancies, complete.**


Sheets: `node .spike-build/scripts/validation/generate-verification-sheet.js`
→ `validation/sheets/<report>.md` (58 values each, PDF page order, blank
"PDF value" column). **Jeff's fill-in is pending** and is folded into the B1
walkthroughs per the protocol.

Scribe pre-check (2026-09-22, Claude Code, against rendered pages): rater
counts, overall and by-group, engagement, tent poles, all 19 rankings with
colours, all 19 importance rows and passions, gap directions, top/bottom
behaviors, one competency's score details, comment counts, and the full
reassessment tables were compared for all three reports. **0 discrepancies.**
This is not Jeff's verification and does not close A2.

### A3. Golden fixtures

`fixtures/zf-360/{johnson,koudsi,hindawi}-360.json` — frozen 2026-09-23 after
the scribe pre-check (comment text stored as hashes; every number verbatim).
`validate-extraction --golden` diffs each fresh extraction against them:
**3/3 match.** Reports 1–2 are not frozen (PDFs not here). Re-freeze only with
`--force`, only after a parser fix, never to make a diff go away.

### A4. Discrepancy log

| date | report | page | field | expected | actual | cause | fix |
|---|---|---|---|---|---|---|---|
| 2026-09-22 | T.K. | 3 | rater_counts.others | 0 (group absent from the counts line) | null | parser: omitted group read as unknown | `parse.ts#readCountsBlock` → 0 when the line parsed |
| 2026-09-22 | T.K. | 7 | Personal Capability tent check | 3.08 | flagged 3.12 by a mean-of-competencies check | harness, not parser | A1 #3 now n-weights items |

| 2026-09-23 | all | — | development_candidates | ranked Promising-first, no 75th floor, equal weights, manager_votes / distance_to_75th carried (Jeff's report-5 rulings) | previous ordering + manager-weighted votes | parser (targets.ts) — a method change, not a misread | fixtures re-frozen with `--force`, reason in the commit |

No fixture was ever edited by hand.

## Part B — interpretation alignment

**B1 in progress; B3–B5 not started.** B1 walkthroughs complete for report 5 (M.H., 16 new rules, 10 rulings) and report 3 (J.J., 6 new rules + 1 from the rulings, all six questions ruled 2026-09-24); saturation curve in `calibration/LEDGER.md` (16 → 7). Brief v2.2 candidate in rubrics/04 §8c carries both; unpublished. What is in place:

- **B3 runner:** `scripts/validation/run-interpretation-battery.ts` —
  drives `POST /api/portal/chat` on a deployment as a portal client
  principal (cookie minted with the deployment's `NEXTAUTH_SECRET`), chains
  the escalation prompts in one conversation, fills the band-trap and
  manager-attribution prompts from the report's data, applies the automated
  critical checks (C1 pattern, C2 rater names, C3 numbers not in the data,
  C4 absent sections, C5 mechanics, C6 band trap, plus the Emotional
  Intelligence and cross-client declines), optionally scores C1–C6 and
  A1–A10 with a judge model (`--judge`, provisional), reads the brief version
  stamped on each stored assistant message, and writes
  `validation/results/battery-<label>-<date>.{json,md}` with critical
  failures first and in full. `--adversarial` runs B5 (ten generated prompts
  aimed at the two weakest criteria).
- **Battery:** `scripts/validation/battery.json` — the 23 prompts, sections,
  chains, expected behaviour, and the rubric text. Prompt 23 (company leak)
  is asserted by construction in `scripts/spikes/verify-portal-phase3.js`,
  not by asking.
- **Calibration scaffold:** `calibration/LEDGER.md` (status, suggested order,
  saturation curve, standing never_say list seeded from rubrics/04 §7),
  `TEMPLATE-transcript.md`, `TEMPLATE-rules.md`.

Constraints to plan around:

- The portal rate limit is **6/min and 30/day per client**. The 23-prompt
  battery fits one day; the adversarial pass needs a second day or a second
  test client. The runner paces at 11 s.
- Each report needs a **portal client with that report uploaded** and the
  assessments flag on. For reports 3–5 that means test participants in the
  Command Center (the dry-run kit), not the real people.
- The judge is provisional. The standard is Jeff's B1 narration for that
  report; divergences from it are brief defects (B4 step 2).

B4 exit criteria (none met): all five walked · saturation · zero critical
failures across all five · mean alignment ≥ 1.6 with no criterion < 1.0.

## What remains untested (explicit)

1. Extraction on reports 1–2 under the 14-check harness (spikes only).
2. Extraction on any 2026-vintage print — **the blocking question above.**
3. The platform `comparison` block on a real two-upload pair.
4. Every interpretation criterion, on every report: the battery has never run.
5. The B5 adversarial pass.
6. The judge's agreement with Jeff (no calibration of the judge itself).
7. The verification sheets for reports 1, 2 and 4 have not been filled in by Jeff (3 and 5 are complete).
8. Behaviour on a report with a Profound Strength AND a fatal-flaw band in the same report (none exists in the corpus).
9. **Engagement items are not extracted.** Jeff's walkthrough reads items 61–66 individually (nearest extraordinary, the one lower item, its change from last year); the parser stores only the engagement total and band. A brief rule depending on them cannot be honoured until the parser carries them.
10. Concurrent extraction (bulk upload) — the calibration diagnostics use a per-parse collector; sequential in the pipeline today.
