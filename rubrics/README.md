# theLeadershipWell · Rubric register

The rubrics are the practice's intellectual property. This folder is their canonical, human-readable home. Every rubric that runs in the platform has one file here, and the file is kept in step with whatever is actually running (code or database) — see **How changes flow** below.

| # | rubric | governs | runs as | live editing |
|---|---|---|---|---|
| 01 | [Coaching session scoring rubric](01_coaching_session_scoring_rubric.md) | How a recorded coaching session is scored (ICF 2025 + theLeadershipWell standards) | Code: `lib/scoring/engine.ts` + `lib/scoring/rubric.ts` (deterministic rules, gates, prompt) | Code change + deploy. The band definitions in the document are rendered from code (`scripts/rubrics/render-scoring-rubric.js`). |
| 02 | [Portal coaching chat rubric](02_portal_coaching_chat_rubric.md) | How the client-portal reflection chat coaches (general mode) | Code floor (`lib/portal/prompt.ts` preamble + voice standards) + the `portal_chat` prompt brief | Brief tab in the Command Center, or `node scripts/rubrics/publish-brief.js portal_chat`. No deploy. |
| 03 | [Goal-setting rubric](03_goal_setting_rubric.md) | The Plan-your-week conversation and goal hygiene (portal + coach side) | Code floor (`composeWeeklyPlanSystem`, goal write rules) + the `weekly_plan` prompt brief | Brief tab, or `publish-brief.js weekly_plan`. No deploy. |
| 04 | [ZF 360 report interpretation rubric](04_zf360_report_interpretation_rubric.md) | How the assistant reads a Zenger Folkman Extraordinary Leader 360 with a participant | Code floor (`ASSESSMENT_GROUNDING_RULES`, the extraction + development-target model) + the `assessment_360` prompt brief | Brief tab, or `publish-brief.js assessment_360`. No deploy. |

## Two layers in every rubric

Each rubric has a **floor** and a **brief**.

- The **floor** is enforced in code and cannot be talked out of by a brief: the scoring gates and thresholds; the portal voice standards; the assessment grounding rules (perception not ability, no rater attribution, no prescribing). Changing the floor is a code change.
- The **brief** is the editable judgment layer: how to read, what to lead with, what to ask, what to decline and how. For rubrics 02–04 it lives in the `prompt_briefs` table (one active version per slug), is versioned, takes effect on the next chat message, and is stamped onto every assistant turn (`portal_messages.metadata`) so engagement can be compared across versions. For rubric 01 the "brief" is the engine prompt itself, in code.

Each of 02–04 carries its brief verbatim between `<!-- BEGIN BRIEF BODY -->` / `<!-- END BRIEF BODY -->` markers and a `**Brief title:**` line. That block is exactly what is (or should be) active in the database.

## How changes flow

1. **Refine here first.** A rubric change starts as an edit to its file in this folder — in a session with Claude or by hand. The file is the record of intent.
2. **Then it goes live.**
   - Rubrics 02–04: publish the brief body — Command Center → Client Portal → Brief tab (paste, save = new active version), or from the repo with `node scripts/rubrics/publish-brief.js <slug>` (needs the Supabase env; `--dry-run` prints the body; `--sql` prints an idempotent block to paste into the Supabase SQL editor — the path used when a session has no database credentials, e.g. migration 065). Floor changes are code.
   - Rubric 01: the code change lands in the same commit as the document; after a rubric-text change run `node_modules/.bin/tsc -p scripts/spikes/tsconfig.spike.json && node scripts/rubrics/render-scoring-rubric.js` so the generated sections match, and `--check` before committing.
3. **Bump the version line** at the top of the file and add a one-line entry to its version history. Spec-level deltas for the scoring rubric still go in `spec/` as before; this folder holds the consolidated current state.
4. **Standing rule for Claude sessions** (also in `CLAUDE.md`): any change to a rubric's behavior — code or brief — updates the matching file here in the same commit, and the commit is pushed to the repo. A rubric change that is not reflected here is not done.

## Verification before publishing a brief

- `node scripts/spikes/verify-portal-360-golden.js` (needs `ANTHROPIC_API_KEY` + `fixtures/private/reference-360.pdf`) — the **golden set** in rubric 04 §9: ten canonical questions against the reference report with the brief body read straight from the rubric file; fact checks drawn from the extracted data, every reply printed beside its expectations. Run before every `assessment_360` version.
- `node scripts/spikes/verify-portal-chat-guardrails.js` (needs `ANTHROPIC_API_KEY`) — factual score/band questions, three rater-attribution framings, three escalating prescription asks against the live model + the seeded brief.
- `node scripts/spikes/verify-portal-phase3.js` — prompt layering, omissions, confidentiality (no rater names, no `key_info`).
- Rubric 01: `node scripts/spikes/verify-closing-window.js` and the calibration anchors listed in the rubric.

## Conventions

- Version lines are `vMAJOR.MINOR[.PATCH]` per rubric, independent of each other and of the app.
- Write rules as the model will read them: short imperative lines, one idea each, examples in quotes. Say what to do before what not to do; put the never-list last.
- Cite research where it exists and say plainly where a rule is practice judgment rather than evidence.
- Client-facing register follows `spec/theLeadershipWell_Writing_Standards_v1.0.md`, distilled in `lib/writing-standards.ts`.
