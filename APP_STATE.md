# APP_STATE.md — current state of the platform

_Factual snapshot reconciled against the actual codebase on **2026-08-08** (Phase 0).
No prior `APP_STATE.md` existed in the repo, so this was created fresh rather than
updated. `CLAUDE.md` remains the deep architectural reference; this file is the
quick, current "what exists right now" ledger._

---

## Stack

- **Next.js 14** (App Router) · TypeScript · Tailwind
- **Supabase** (Postgres, service-role key only — `getSupabaseAdmin()`)
- **NextAuth** (Google OAuth) — session carries `coachId`; tenancy is enforced in
  **application code**, not DB RLS
- **Anthropic SDK** (generation + scoring), **Stripe** (billing), **Gmail/Calendar**
  (Google APIs), **Zoom** (meeting summaries)
- Deployed on **Vercel** from `main`; domain `theleadershipwell.online`
- Commands: `npm run dev` · `npm run build` · `npm run lint` · `npx tsc --noEmit`
  (this env needs `--ignoreDeprecations 5.0` due to a newer local TS than the pin;
  build requires Supabase env vars set — a fresh clone build fails to *prerender* a
  few billing/business-center routes without them, though compilation succeeds)

## Surface area (as of 2026-08-08)

- **123 API route files** under `app/api/**` (down from 126 — Phase 0 removed 3 CA
  routes). Full route-by-route isolation classification: **`ISOLATION_AUDIT.md` §2**.
- **8 Vercel crons** (`vercel.json`): hourly `reminders` (+ the coach-task pass), `ai-budget` (stale reservations + spend alerts),
  `nudges`, `vault-sync`, `calendar-sync`, `billing-reminders`, `billing-retries`;
  daily `portal-reminders`. Every run logged to `cron_runs` (067). Audit: `ISOLATION_AUDIT.md` §3.
- **42 migrations**, strict `001`–`042` (Phase 0 renumbered the old `026`/`034`
  duplicates — map in `docs/MIGRATION_PROCEDURE.md`). **Applied by hand** in the
  Supabase SQL editor; production is at `042`. `042` = the Phase 1 §5.0 tenant
  foundation (`organizations` + `org_id` on every tenant table, backfilled to
  org #1); applied to staging + production 2026-08-09.

## Feature areas shipped (all live)

- **Roster** (Active/Inactive/Archived toggle, bulk "Email all"), **client workspace**
  (notes, transcripts, goals, key info, coaching map, agreements, appointments,
  communications, nudges), **dashboard** + **business-center** (assembled block layouts).
- **Session prep** — `app/session/*` generator/sender (older flow, dashboard-linked)
  + the modern per-client "Plan next session" modal. Prep content is built from
  `clients.coaching_goals` + notes + Zoom summaries.
- **Coaching scorecard** — transcript → match → score against ICF 2025 competencies
  (consolidated rubric v0.4 + deltas v0.5→v0.5.3). Engine in `lib/scoring/*`.
- **Transcript pipeline** — Plaud → Zapier → `/api/transcripts/ingest` (+ manual paste,
  per-client file import). Background scoring with progress bar.
- **Scheduling** — appointments, Google Calendar sync, reminders, external-booking
  capture (Calendly/HubSpot via calendar watch).
- **Nudges** (draft → coach-review → send; action/insight/framework/goals types),
  **vault → garden index** (framework nudges from the mind-garden repo).
- **Agreements** (issue → e-sign → on-file), **Library** (template + PDF folders).
- **Business Center / Billing** — accounts, coachees, engagements, invoices, billing
  run, Stripe hosted invoices, Payment-on-File (charge-on-run), adjustments/refunds.
- **Branded email + communications log**, **coaching-hours / ICF log**, **growth areas**.

## Phase 0 changes (this pass, 2026-08)

- **Coach Accountable fully decommissioned** — 3 routes deleted; `/api/sessions` +
  `app/session/*` CA-stripped; env vars removed. Provenance (`clients.ca_client_id`,
  `notes.ca_session_id`) + imported history retained. Details: `ISOLATION_AUDIT.md`
  Appendix A.
- **Migrations renumbered** to strict `001`–`041` (duplicate `026`/`034` resolved).
  Convention: every new migration ships a paired `_down.sql`, authored first
  (`docs/MIGRATION_PROCEDURE.md`, templates in `supabase/migrations/_TEMPLATE_*.sql`).
- **Staging artifacts** created (`supabase/staging/*`, `docs/STAGING_SETUP.md`) — the
  staging Supabase project itself is Jeff's to create.
- **Isolation audit** produced (`ISOLATION_AUDIT.md`) — the checklist Phase 1 executes.
- **No schema change, no RLS enabled** — Phase 0 is infrastructure + reconnaissance.

## Phase 1 progress (multi-tenant enforcement — `docs/PHASE_1_BUILD_BRIEF.md`)

- **§5.0 — DONE.** `organizations` table + `org_id` on every tenant table, backfilled
  to org #1 (migration 042, applied staging + prod 2026-08-09). Schema only.
- **§5.1 — superseded.** The original plan minted a Supabase JWT (HS256) for a
  request-scoped PostgREST client. It **does not work on this project**: the
  Supabase projects use **asymmetric JWT signing keys** (ES256), and PostgREST v13
  rejects self-signed HS256 tokens → the client authenticates as an unprivileged
  role and RLS returns zero rows. Confirmed in prod (notes wouldn't open) and via
  a staging diagnostic (JWKS is EC/ES256 only). The JWT-mint code was removed;
  `SUPABASE_JWT_SECRET` in Vercel is now unused (safe to leave or delete).
- **§5.3 approach — replaced by "Option A" (direct Postgres).** Instead of a JWT,
  org-scoped reads use a pooled Postgres connection that sets the org claim per
  transaction (`SET LOCAL ROLE authenticated` + `request.jwt.claims`), so the
  `043` RLS policies apply. Helper: `lib/supabase/pg.ts#withOrgClaim` (uses
  `SUPABASE_DB_URL` = the Transaction-pooler string). **Proven on staging** via the
  synthetic two-org seed: an Org A request saw 8 notes / 0 leak, Org B saw 4 / 0.
- **§5.3 group 1a — PARKED (2026-08-10).** The three read routes
  (`clients/[id]/notes` GET, `.../actions` GET, `.../history` notes sub-query) were
  converted to `withOrgClaim`, but **reverted** because the **production**
  `SUPABASE_DB_URL` password is wrong (pooler reachable, credential rejected —
  "password authentication failed"; a diagnostic confirmed username/host/port/format
  all correct, only the password value is off). This is a **credential fix, not a
  code fix**. Production reads run on the service-role admin client (healthy);
  tenant isolation is enforced in app code as before.
  - **Live + dormant:** migration `043` SELECT policies on `notes`/`actions`
    (applied staging + prod; harmless — service-role bypasses RLS), `lib/supabase/pg.ts`,
    `lib/tenant.ts`, `supabase/staging/002_org_split.sql`.
  - **To resume (~15 min):** (1) reset the **prod** DB password (Supabase → Settings
    → Database → Reset database password), update the prod `SUPABASE_DB_URL` env var,
    redeploy; (2) re-apply the three route conversions to `withOrgClaim` (git history:
    PR #180); (3) verify on the staging preview, then prod-smoke. Natural trigger:
    onboarding a second real organization.
- Decisions driving Phase 1 are recorded in `ISOLATION_AUDIT.md` §8.

## Coach attention queue build (2026-09-09 → ; brief "Coach Attention Queue & Session Note Send/Close-Out")

- **Migration number truth.** Production probed 2026-09-09 (Jeff ran the check):
  schema at **064**, `coach_tasks` absent, 065 pending (data only), 066 applied
  (360 brief active as version 2). The brief believed docs tracked through 039 —
  that was pre-Phase-0; the folder is strict `001`–`066`. **This build = `067`.**
- **Staging-before-schema exception — GRANTED.** The staging Supabase project is
  paused (since 056). Jeff approved ("go", 2026-09-09) applying additive-only
  `067_coach_tasks.sql` (one new table + one log table + defaulted/nullable
  columns, no drops/type changes/backfill) directly to production, on the
  recommendation that the change's risk is in application logic staging would
  not exercise. Down-script authored first; up/down/re-up verified on Postgres 16.
- **`coach_tasks`** — generic per-coach task queue; v1 = session-note tasks
  (`write_note` / `send_note`), states pending|sent|filed|dismissed, no snooze.
  Open-text `subject_type`/`task_type` so later task kinds (unmatched bookings,
  billing review, nudge approvals) need no migration. Isolation = `coach_id`
  filter in app code on every query (no RLS policies).
- **`notes.status` = view-filter-only invariant.** All 23 `from('notes')`
  consumers audited unfiltered (list in `CLAUDE.md`); sent truth stays on the
  050 columns (`sent_to_client_at`), code reads sent as either signal.
- **Cron host** = the existing hourly `/api/cron/reminders` (pass 3), never the
  nudge cron — a coach reminder can never reach a client inbox. **`cron_runs`**
  failure queue: all seven crons now log every run (`lib/cron-runs.ts`);
  supervisor review at `GET /api/admin/cron-runs`. Stale `running` rows = killed
  mid-run.
- **Signal Orange — resolved as the accepted default:** navy final send button,
  2px Signal Orange top border on the send modal (one orange instance, rule
  intact). Revisit after two weeks of real use if the moment feels light.
- **Claim-before-send + idempotency key** (billing pattern) extends to note
  sending in Phase 3 — not yet built.
- **Claim-before-send + idempotency key — DONE (Phase 3, migration 068).**
  The billing charge-path pattern extended to note sending: a compare-and-set
  on `notes.send_attempt` (+ `send_claimed_at`, `send_idempotency_key`) is the
  claim; the Gmail send is awaited; only then the communications row, the
  note's sent stamps, and the coach_task resolve. One transport
  (`lib/notes/send.ts`) serves both the close-out route and the older
  `/send-note` route. The sent client narrative is read-only forever; the
  coach note has "Reopen and revise" (logged). 068 needs the same additive-only
  staging exception as 067.
- **Phase status:** Phase 1 shipped (#255, 067 applied in production
  2026-09-09; Jeff skipped the live cron check). Phase 2 shipped (#256) — the
  "Needs your attention" panel is a fixed element at the top of the dashboard
  (not an opt-in card), with Write note / Open note to send / File / Dismiss
  (confirm step, coach-scoped conditional resolve). **Phase 3 shipped** — send
  flow + close-out (`SendNoteFlow`, streamed + cached narrative, blank compose
  when there is no source, "Sent notes (n)" collapsed section, read-only sent
  message, reopen). Phase 4 (daily digest + settings) pending Jeff's
  confirmation.

## AI cost controls build (2026-09-18 → ; brief "AI Cost Controls, Model Routing & Context Budgeting")

### Phase 0 audit — findings (2026-09-18, no code changed)

**Blocking finding first: the Anthropic SDK pin is `^0.24.3` (July 2024).** The
tarball of 0.24.3 contains none of `countTokens`, `cache_control`,
`output_config`/`effort`, `thinking`, or `cache_read_input_tokens` — every
API parameter this brief depends on is absent from the SDK's types and
request builders. Latest published is **0.127.0** (2026-09-18). There is no
lockfile in the repo (no `package-lock.json`), so Vercel resolves the caret
fresh on every build — caret on a 0.x pin holds it to 0.24.x. **Phase 1 must
open with an SDK upgrade** (a breaking-change pass across 0.24 → 0.127: stream
helpers, error classes, `finalMessage()`) verified by `tsc` + build before the
gateway is written. Until then no call can pass effort, cache, or count tokens.

**1. Every Anthropic SDK call site (14 in app/lib, 2 in scripts).** All use
`new Anthropic({ apiKey })` per call (no shared client), all pass
`maxRetries: 1` (= one automatic retry, already the brief's ceiling), none
set `thinking`/`effort`/`cache_control`, none read `response.usage`.

| # | File | Feature (proposed `purpose`) | Principal | Model (env override → default) | max_tokens | timeout | Streams |
|---|---|---|---|---|---|---|---|
| 1 | `lib/portal/chat.ts#streamChatReply` | portal_chat (general + weekly_plan modes) | client | `PORTAL_CHAT_MODEL` → `claude-sonnet-4-6` | 4096 | 120 s | yes (`for await`, usage never read) |
| 2 | `lib/portal/chat.ts#generateChatReply` | portal_chat (non-stream, currently no caller in routes) | client | same | 4096 | 120 s | no |
| 3 | `lib/portal/weekly-plan.ts#extractWeeklyPlan` | portal_weekly_plan_extract | client | `PORTAL_CHAT_MODEL` → `claude-sonnet-4-6` | 800 | 60 s | no |
| 4 | `lib/scoring/engine.ts#scoreTranscript` | scoring | coach/system (webhook) | `SCORING_MODEL` → `claude-sonnet-4-6` (retired-id guard) | 10000 | 100 s + 240 s guard | yes (`finalMessage()`) |
| 5 | `lib/scoring/suggest.ts#suggestCompetencyMove` | scoring_suggest (on demand, `/api/reports/[id]/suggest`) | coach | `SUGGEST_MODEL` → `SCORING_MODEL` → sonnet-4-6 | 400 | 50 s | no |
| 6 | `lib/growth-areas/score.ts#runGrowthPass` | growth_pass (after every score, `store.ts`) | system | same chain | 2000 | 90 s | no |
| 7 | `lib/growth-areas/bands.ts#generateBandScale` | growth_bands (on demand) | coach | same chain | 800 | 50 s | no |
| 8 | `lib/nudges/llm.ts#complete` ← `extract.ts` | nudge_extract (after every score + on demand) | system/coach | `NUDGE_MODEL` → `claude-sonnet-4-6` (retired guard) | 1400 | 60 s | no |
| 9 | `lib/nudges/llm.ts#complete` ← `draft.ts` | nudge_draft (≤2 per window + draft-one) | system/coach | same | 700 | 60 s | no |
| 10 | `lib/transcripts/title.ts#proposeTranscriptTitle` | transcript_title (unmatched ingest only) | system | `TITLE_MODEL` → `claude-haiku-4-5-20251001` (retired guard) | 200 | 25 s | no |
| 11 | `lib/notes/narrative.ts#streamNarrative` | note_narrative (send-to-client draft, cached once) | coach | `GENERATE_MODEL` → `claude-sonnet-4-6` | 1500 | 60 s | yes |
| 12 | `app/api/notes/client-email/route.ts` | note_client_email (superseded, unused by UI) | coach | `GENERATE_MODEL` → sonnet-4-6 | 1500 | 50 s | no |
| 13 | `app/api/generate/route.ts` | session_prep | coach | `GENERATE_MODEL` → sonnet-4-6 | 2000 | 50 s | no |
| 14 | `app/api/clients/[id]/goals/generate/route.ts` | goals_generate (fire-and-forget) | coach | `GOALS_MODEL` → sonnet-4-6 | 1500 | 50 s | no |
| 15 | `app/api/clients/[id]/plan-session/route.ts` | plan_session | coach | `PLAN_SESSION_MODEL` → sonnet-4-6 | 1200 | 50 s | no |
| — | `scripts/spikes/verify-portal-360-golden.js`, `verify-portal-chat-guardrails.js` | manual verification scripts (need `ANTHROPIC_API_KEY`) | dev | `PORTAL_CHAT_MODEL` → sonnet-4-6 | 1200 / 900 | default | no |

Per scored session the pipeline fires **up to 4 calls** (engine → growth
pass → nudge extract → ≤2 nudge drafts); an unmatched ingest adds a title
call. Model ids live in **eight** env vars + per-file defaults; the retired-id
guard is copy-pasted in three files (`engine.ts`, `nudges/llm.ts`,
`title.ts`). No raw `fetch` to `api.anthropic.com` anywhere. No prompt
caching anywhere. No `count_tokens` anywhere.

**2. Portal chat — present, and its context is stuffed by character budgets,
not tokens.** `lib/portal/chat.ts#buildChatContext` → `lib/portal/prompt.ts#
composeChatSystem` (general) / `composeWeeklyPlanSystem` (week). Order
today: preamble + voice standards + grounding rules (~9k chars static) →
active `portal_chat` brief (~10k chars) or `assessment_360` brief (~20k+) →
company vision/values + **company docs 16k chars** → **client docs 16k** →
**my notes 8k** → 360 structured data + verbatims (size varies by report) →
goals → **sent notes 8k** → **4 recent transcripts × 6k = 24k** → **FTS
retrieved excerpts 24k** (`portal_chat_context`, migration 053). Then
`messages` = the **last 40 rows** of the thread verbatim (user turns ≤ 8000
chars each, assistant turns ≤ 4096 tokens each) with an optional **30k-char
attachment** spliced into the last user turn. Worst case ≈ 150k chars of
system + an unbounded-ish history → **well over 100k input tokens** is
reachable; a typical warm thread with a 360 is ~30–50k tokens. No hard
ceiling exists. The **volatile content sits inside the system prompt**
(retrieval results change with every question; the system string is
rebuilt per turn), so even with a `cache_control` breakpoint today nothing
would cache past the brief. Rate limits today: `chat` 60/hour (no per-minute,
no per-day), `upload` 20/h, `document_upload` 10/h (`lib/portal/access.ts`,
counted in `portal_access_log`, fails open). **Chat is on for every portal
client, ZF participants included** — nothing gates it on `portal_features`.
Scoping is already by session `clientId` at every loader; `key_info` and the
`notes` table are excluded at the query level (kept).

**3. Token usage is not logged anywhere.** No code reads `usage` off any
response (`grep` for `input_tokens|output_tokens|cache_read_input_tokens` →
zero hits outside node_modules). The streaming sites iterate deltas and never
call `finalMessage()` / read the final `message_delta` usage. `portal_events`
stamps brief version and conversation id only; `cron_runs` stores job
summaries only. There is **no cost record of any kind** — the ledger starts
at zero history.

**4. API parameter names — confirmed against platform.claude.com on
2026-09-18** (`docs.claude.com` paths redirect there):
- **Effort**: `output_config: { effort: "low"|"medium"|"high"|"xhigh"|"max" }`
  — nested in `output_config`, NOT top-level; no beta header; default `high`
  (= omitting it). Supported on `claude-opus-5`, `claude-sonnet-5`,
  `claude-sonnet-4-6` (and Opus 4.6–4.8, Fable); **not supported on Haiku
  4.5** (send no effort on `background_compact`). Changing top-level effort
  between requests invalidates the prompt cache → pick one level per
  conversation. (`/docs/en/build-with-claude/effort`)
- **Thinking**: current models are adaptive — `thinking: { type: "adaptive" }`
  or omit (Opus 5 / Sonnet 5 run adaptive when omitted); `budget_tokens` is
  removed on Opus 5 / Sonnet 5 (400) and deprecated on Sonnet 4.6; Haiku 4.5
  still uses `{type:"enabled", budget_tokens}` or no thinking. **Thinking
  tokens count inside `max_tokens`** and are billed as output; the breakdown
  is `usage.output_tokens_details.thinking_tokens` (final `message_delta`
  when streaming). (`/docs/en/build-with-claude/thinking-steering-and-cost`)
- **Prompt caching**: `cache_control: { type: "ephemeral", ttl?: "5m"|"1h" }`
  on a content block, or top-level `cache_control` for automatic placement;
  no beta header; max 4 breakpoints; prefix order `tools → system →
  messages`; minimum cacheable prefix **512 tokens on Opus 5, 1024 on
  Sonnet 5 / 4.6, 4096 on Haiku 4.5**. Usage fields:
  `cache_creation_input_tokens`, `cache_read_input_tokens`, `input_tokens`
  (= tokens after the last breakpoint), `cache_creation.{ephemeral_5m,
  ephemeral_1h}_input_tokens`. (`/docs/en/build-with-claude/prompt-caching`)
- **Token counting**: `POST /v1/messages/count_tokens`; TS
  `client.messages.countTokens({ model, system, messages, tools?, thinking? })`
  → `{ input_tokens }`; **free**, own RPM limit (5,000 at Start tier),
  estimate only, counts under the tokenizer of the `model` passed. Rejects
  `url`/`file` sources (send base64). (`/docs/en/build-with-claude/token-counting`)
- **Tokenizer**: Opus 5 and Sonnet 5 (everything 4.7+) use the newer
  tokenizer, **~30% more tokens for the same text** than Sonnet 4.6 / Haiku
  4.5. Every budget in Phase 3 must be counted with the target model id, and
  the 40k ceiling is ~30% fewer characters than today's Sonnet 4.6 budgets
  suggest.

**5. Per-model prices — confirmed at
`platform.claude.com/docs/en/about-claude/pricing` on 2026-09-18** (USD per
MTok; cache write 5m = 1.25×, 1h = 2×, read = 0.1× base input; Batch API =
50% off input and output; 1M context at standard pricing):

| Model id | Role in brief | Input | Output | Cache write 5m / 1h | Cache read | Notes |
|---|---|---|---|---|---|---|
| `claude-opus-5` | portal_chat | $5 | $25 | $6.25 / $10 | $0.50 | 1M ctx, 128K out, adaptive thinking, effort supported |
| `claude-sonnet-5` | portal_degraded | $2 | $10 | $2.50 / $4 | $0.20 | introductory price made permanent (was to rise to $3/$15 on 2026-09-01; will not) |
| `claude-haiku-4-5-20251001` (alias `claude-haiku-4-5`) | background_compact | $1 | $5 | $1.25 / $2 | $0.10 | 200K ctx, no effort param, **retirement "not sooner than 2026-10-15"** |
| `claude-sonnet-4-6` | today's default everywhere | $3 | $15 | $3.75 / $6 | $0.30 | legacy list; older tokenizer |
| `claude-opus-4-8` | (named in engine warning text only) | $5 | $25 | $6.25 / $10 | $0.50 | legacy list |

Two pricing facts that change the plan: **(a) Sonnet 5 is cheaper than the
Sonnet 4.6 every coach-side feature runs on today** ($2/$10 vs $3/$15) — the
"keep current models" rule stands for Phase 1, but a one-line swap in
`models.ts` later is a ~33% cut on scoring/nudges/prep; logged as a deferred
option, not pulled forward. **(b) Haiku 4.5 may retire within weeks** of this
build (commitment date 2026-10-15); `models.ts` must make the
`background_compact` id a single-line change and the gateway must fail loud
(not silently fall back) on a retired id.

**6. Rough current spend shape (estimate, no ledger to confirm).** A typical
portal turn today ≈ 30–50k input + ≤4k output on Sonnet 4.6 ≈ **$0.10–0.20**;
the same turn on uncached Opus 5 ≈ **$0.20–0.35**, dropping to ~$0.05–0.10
once the stable prefix caches. At today's 60 msgs/hour limit one client can
spend **>$10/hour** — the brief's per-client $10/month cap is ~50–100 turns
on cached Opus 5, which is a real product constraint to confirm with Jeff. A
scored session ≈ 4 calls ≈ $0.15–0.40 on Sonnet 4.6.

**7. Reserve/settle pattern to reuse.** `lib/notes/send.ts#claimNoteSend`
(compare-and-set on `send_attempt`, 3-min stale claim) and
`lib/billing/charge.ts` (`invoice_charge_attempts` claim row before any Stripe
call) are the templates; `lib/cron-runs.ts#cronHandler` is the template for
the stale-reservation release job. `lib/portal/access.ts#checkPortalRateLimit`
(Postgres-counted, fails open) is the template for the per-minute/per-day
limits — but the budget check must **fail closed**, so it is a new helper,
not a reuse of the limiter.

**8. Migration numbering.** Folder is strict `001`–`068`, no duplicates
(every number pairs an up with a `_down`); the "known duplicates" the brief
mentions were resolved in Phase 0 (`docs/MIGRATION_PROCEDURE.md`). **Phase 1
= `069_ai_cost_controls.sql`** (+ `_down`), additive only (three new tables +
seed prices), eligible for the same staging exception as 067/068.

**9. External backstop (Console).** Not verifiable from the repo. Anthropic
workspaces support their own API keys and per-workspace rate limits (Admin
API `/v1/organizations/workspaces`); whether a per-workspace **monthly spend
limit** is settable is a Console check for Jeff (Console → Settings → Limits,
per workspace). Recommended regardless: a second workspace + key
(`ANTHROPIC_API_KEY_PORTAL`) so the portal's spend is a separate line on the
invoice, which also makes the Phase 4 ±5% reconciliation trivial.

### Phase 1 — shipped 2026-09-18 (gateway + models + ledger; migration 069 APPLIED in production 2026-09-19)

- **SDK `^0.24.3` → `^0.127.0`.** `tsc` was clean after the upgrade with no
  call-site changes — the 0.24 shapes still type-check on 0.127. Lockfile
  remains gitignored (repo policy, not changed here).
- **`lib/ai/models.ts`** (purpose → model map, `AI_MODEL_<PURPOSE>` overrides,
  legacy env fallbacks with deprecation warnings, one retired-id guard,
  per-model tokenizer/effort/cache-prefix facts), **`lib/ai/pricing.ts`**
  (integer-micros cost math, price cache), **`lib/ai/client.ts`** (`aiCreate`
  / `aiStream` / `ledgerDone` / `aiCountTokens`; reserve → call → settle |
  release; fail closed on ledger errors).
- **All 14 call sites rewritten** onto the gateway; the three duplicated
  retired-model guards and eight per-file env reads are gone. Attribution
  threaded through: scoring (`ScoringContext.ledger`, feature
  `scoring` / `scoring:rescore`), growth pass, nudge extract/draft
  (`principal` = system after scoring, coach on demand; feature
  `nudge_draft:<type>` / `nudge_draft:draft-one`), transcript title, note
  narrative, client-email, session prep, goals, plan-session, portal chat
  (`ChatAttribution` from the client record — never the request body;
  feature `portal_chat:<mode>`), weekly-plan extraction.
- **Portal chat → Opus 5 at effort `medium`** (brief). Effort is set now, not
  in Phase 3, because Opus 5 thinks by default and thinking counts inside the
  unchanged `max_tokens` 4096 — without it the model switch could truncate
  replies. Context assembly untouched.
- **Build gate**: `prebuild` grep + ESLint `no-restricted-imports`; both
  proven to catch a stray import (the gate blocked a build during the run).
- **Migration 069** verified on Postgres 16 (up, CAS settle matches one row,
  duplicate request_id / bad principal / mid-month period refused, coach
  delete keeps the ledger row, idempotent re-up, down, re-up). **Not applied
  in production yet** — the gateway refuses every AI call until it is.
- **Verified**: `npx tsc --noEmit` clean; `next lint` clean; `next build`
  compiles + type-checks (the only failures are the documented prerender
  errors from a clone without Supabase env); `verify-ai-gateway.js` 45/45.
- **Not verified here**: a live Anthropic call through the gateway (no
  `ANTHROPIC_API_KEY` in this environment) — first production traffic after
  069 is the validation that every feature writes a `settled` row (Phase 1
  exit criterion; check `select purpose, status, count(*) from ai_usage group
  by 1,2` after a day).
- **Deferred to Phase 2** (recorded): budget check inside the reserve
  (`ai_budgets` rows are seeded but `enabled=false`), stale-reservation
  release cron, refusing calls whose model has no price row (Phase 1 settles
  them with `actual_usd_micros` NULL and logs), the per-minute/per-day chat
  limits, the kill switch, the ZF-participant chat-off default.

### Routing change (Jeff, 2026-09-19) — models chosen by cost, speed, and the nature of the task

Jeff: "as cost effective and as fast as possible… don't hard code a certain
model; choose based on speed, the nature of the problem, and cost." Done in
`lib/ai/models.ts`: a catalog with capability / cost rank / speed rank per
model and a `TaskProfile` per purpose; `routeModel` = cheapest routable model
meeting the capability, ties to the faster. **Consequences (recorded):**
- Every coach-side purpose moved **Sonnet 4.6 → Sonnet 5** ($3/$15 → $2/$10,
  documented as equal-or-better; effort `medium` = the 4.6-at-default
  equivalent, `high` for scoring + growth). Sonnet 4.6 and Opus 4.8 stay in
  the catalog as override-only (dominated).
- Three light tasks moved to **Haiku 4.5**: transcript titles (already),
  weekly-plan Top-5 extraction, background_compact.
- **Scoring now runs on Sonnet 5 at effort `high`** with `max_tokens` 10 000
  visible + 6 000 thinking headroom. The rubric text is unchanged, but the
  model IS the judge — **Jeff to rescore one known transcript and compare
  bands before trusting a batch** (rubrics/01 golden check). Override with
  `AI_MODEL_SCORING=claude-sonnet-4-6` to fall back instantly.
- Portal chat stays on Opus 5 by the profile's `quality: 'frontier'` (the
  brief's decision), not by a pinned id — flip that one field to re-route.
- Haiku 4.5's retirement (not before 2026-10-15): when it goes, mark it
  non-routable and light tasks fall to Sonnet 5 at `low` automatically.

### Phase 2 — shipped 2026-09-19 (budget enforcement; migration 070 APPLIED, confirmed by Jeff 2026-09-19)

- **Atomic reserve** in Postgres (`ai_reserve`, per-org advisory lock, every
  scope summed in the same transaction) — proven by
  `verify-ai-budget-concurrency.js`: 20 concurrent $1 reserves with $1.50
  left → exactly 1 passes. Caps: org $500 (client-principal only), client
  $10, portal participant $3 — the brief defaults, now `enabled=true`.
- **Portal**: kill switch env, 6/min + 30/day, per-client `portal_features.
  chat` (Command Center toggle), soft cap → Sonnet 5 + coach email, hard cap
  → 429 with the on-brand pause + coach email, fail closed on a status error.
- **Extend**: workspace "Assistant usage" card (`ws-ai-usage`) → dated
  `ai_budgets` row, audited.
- **Alerts** (50/80/100 % org; client soft/hard) via `ai_alerts` claims;
  hourly `/api/cron/ai-budget` releases stale reservations + sweeps alerts.
- **Decisions taken on the brief's defaults without a separate confirmation
  (Jeff said "go")**: $500 / $10 / $3 / 80 % soft / downgrade-to-Sonnet-5 on
  soft / pause-with-extend on hard. **One deliberate deviation:** the ZF
  participant chat is **ON** by default (flag exists, default off would have
  switched off the 360 debrief's main surface for the live cohort). Flip per
  user in the Command Center, or set `default:portal` cap to 0 to pause them
  all. Separate Anthropic workspace/key: still Jeff's Console decision.
- **Not verified here**: a live call through the reserve (no API key); the
  alert emails (no Gmail token); the workspace card in a browser (typecheck +
  build only). First production day after 070: check `select status,
  count(*) from ai_usage group by 1` (no lingering `reserved`) and that
  `ai_alerts` stays empty until the thresholds are real.
- **Deferred**: coach-side feature cap number (none enabled); per-coach
  budgets; the Console spend limit; Batch API for scoring/nudges (50 % off,
  fire-and-forget already — first post-Phase-4 option).

### Phase 3 — shipped 2026-09-19 (portal context budgeter; migration 071 APPLIED, confirmed by Jeff 2026-09-19)

- **Fixed slices under a 40k-token ceiling** (`lib/ai/context-budget.ts`,
  pure; `lib/portal/context.ts` loads + fits + verifies): system ≤ 12k
  (cached 1h, cross-client) · snapshot ≤ 6k (cached 5m, per client) · memory
  ≤ 2k (reserved, empty) · excerpts ≤ 10k · history ≤ 6k · current ≤ 6k.
  Drop order over the ceiling: excerpts → history → snapshot; system never.
  `max_tokens` 4,000 incl. thinking; effort `medium` (unchanged from the
  route). Slice figures + the `count_tokens` measurement on every ledger row
  (`ai_usage.metadata.slices`).
- **Deviation, recorded:** the brief's system slice was 3k. The preamble
  alone fits 3k, but the practice's briefs (rubrics/02 `portal_chat` ≈ 3–4k,
  the 360 interpretation brief ≈ 6k) are system material and the brief says
  nothing about shrinking them, so the slice is 12k. It is the cached prefix
  (0.1× after the first turn), so the cost effect is small; shrinking the
  briefs is Jeff's call, not the budgeter's.
- **Never a full transcript.** Excerpts = the newest 2 sessions' openings
  (2.5k chars each) + ≤ 12 ranked passages (`portal_chat_context`, `p_limit`
  12). Before: 4 sessions × 6k chars + 24k chars of passages + up to 40
  verbatim turns in the system string, re-sent uncached every message.
- **History:** last 6 turns verbatim; older turns summarised once per batch
  of ≥ 4 by `background_compact` (Haiku, client principal, feature
  `portal_chat:summary`, ≤ 600 output tokens) and persisted (071). Pre-071
  the summary is not attempted (a call whose result cannot be kept would
  repeat every message) — older turns fall off instead.
- **Cache layout:** the client's name moved out of the preamble into the
  snapshot ("WHO YOU ARE TALKING WITH") so the prefix is byte-identical for
  every client of the org; rubrics/02 v1.3 records the layer-order change.
  Known edge: with NO active `portal_chat` brief the plain prefix (~700
  tokens) is under Sonnet 5's 1024-token cache minimum, so on the degraded
  model only the snapshot breakpoint caches. Production has the brief active.
- **Upload trimming** is said to the client (`X-Context-Note` → a muted line
  under the reply) and to the model (a bracketed marker on the message).
- **Not built (deliberately):** the file plan's `client_snapshots` cache
  table — the snapshot is rebuilt from source each turn (the loaders are a
  handful of indexed reads) and cached at the API for 5 min, which is the
  cache that matters for cost; a stored snapshot would add invalidation for
  no token saving. The memory slice stays reserved. No per-message
  `ai_usage.slices` column — the figures ride in the existing `metadata`
  jsonb (no migration needed for them).
- **Validate after the first day of real traffic** (needs 071 + a warm cache):
  `select sum(cache_read_tokens)::float / nullif(sum(input_tokens +
  cache_read_tokens + cache_write_tokens), 0) from ai_usage where purpose =
  'portal_chat' and status = 'settled'` → expect > 0.6; and
  `select metadata->'slices'->>'total', metadata->'slices'->>'measured' from
  ai_usage where purpose = 'portal_chat' order by created_at desc limit 20`
  → measured ≤ 40000 on every row. If the measured count runs well above the
  estimate, the 3.1 chars/token figure in `lib/ai/models.ts` is what to tune.
- **Not verified here:** a live streamed reply through the block-typed
  system (no API key); the `count_tokens` call; the chat page's note line in
  a browser. Verified: 23 budgeter checks, the prompt-order assertions of
  `verify-portal-phase3.js` on a stub 360, `verify-weekly-plan.js`,
  `verify-ai-gateway.js` (51), tsc, lint, `next build`, 071 up/down/re-up.

### Phase 4 — shipped 2026-09-19 (cost cockpit; no migration)

- **Admin page `/command-center/ai-costs`** (+ pulse card and header link on
  the Command Center): month-to-date spend by feature / model / coach /
  client, % of every enabled cap (org ceiling, per-client, per-feature),
  top-10 clients with **invoiced revenue this month** beside assistant spend
  (and spend ÷ revenue), request counts with failed / open, the portal-chat
  cache-read ratio against the 60 % target, and a straight-line month-end
  projection. Month stepper for history. `GET /api/admin/ai-costs`.
- **Coach view** = the dashboard / Business Center card `ai-costs`
  ("Assistant usage"): their own clients' portal usage and cap state only,
  scoped by `coach_clients` (`GET /api/ai-costs`). Opt-in via "+ Add card".
- **Revenue join, as built:** invoiced income (issued invoices, income date =
  paid → sent → created, in the UTC month) attributed through
  `invoice_lines.coachee_id`. Not the session-fee estimate the dashboard
  revenue cards project, and account-level lines with no coachee are left
  out — so a retainer billed to an enterprise account without per-coachee
  lines shows no revenue against its coachees. Recorded, not fixed: the
  billing run already writes coachee lines for sessions, which is the common
  case.
- **Reconciliation** = `scripts/reconcile-ai-costs.js` (ledger by model;
  `--csv` a Console usage export matched by column name; `--invoice` the
  month's total; ±5 % → exit 0/1). **The ±5 % validation itself is Jeff's to
  run after a full billing cycle** — the first complete month on the ledger is
  October 2026 (069 landed 2026-09-19). What can legitimately differ is
  listed in the script header (open reservations, refused calls, price lag,
  the Console's timezone).
- **Legacy env vars retired** (the file plan's Phase 4 item): `SCORING_MODEL`,
  `SUGGEST_MODEL`, `GENERATE_MODEL`, `GOALS_MODEL`, `NUDGE_MODEL`,
  `PLAN_SESSION_MODEL`, `TITLE_MODEL`, `PORTAL_CHAT_MODEL` are ignored with
  one warning. **Action for Jeff:** delete them from Vercel; if any purpose
  must stay pinned, set `AI_MODEL_<PURPOSE>`.
- **Not built (deliberately, per the brief's non-goals):** per-coach budgets,
  a cost-vs-revenue chart over time, CSV export of the cockpit, the Admin
  API cost-report pull (the Console export + invoice total cover the ±5 %
  check without a second credential).
- **Not verified here:** the pages in a browser (typecheck + build only); a
  ledger with real rows (no database) — the arithmetic is covered by the
  36-check spike and the loaders mirror the SQL functions' scope rules.

### File plan (Phases 1–4; stop-and-confirm between each)

**Phase 1 — gateway + models + ledger.**
- `package.json`: `@anthropic-ai/sdk` → `^0.127.0` (+ add a lockfile so Vercel
  builds are reproducible); fix every call site that the upgrade breaks
  (stream/error/finalMessage API drift); `tsc` + `npm run build` gate.
- `lib/ai/models.ts` — the ONLY model-id map, keyed by purpose
  (`portal_chat` opus-5 / `portal_degraded` sonnet-5 / `background_compact`
  haiku-4-5-20251001 / `scoring`, `scoring_suggest`, `growth_pass`,
  `growth_bands`, `nudge_extract`, `nudge_draft`, `transcript_title`,
  `note_narrative`, `session_prep`, `goals_generate`, `plan_session`,
  `portal_weekly_plan_extract` keep today's models), one env override per
  purpose (`AI_MODEL_<PURPOSE>`), the retired-id guard consolidated here
  (fail loud on retired), tokenizer generation per model (for estimators).
- `lib/ai/client.ts` — the ONLY path to Anthropic: `aiCall({purpose, org_id,
  coach_id, client_id?, principal, feature, max_tokens, system, messages,
  effort?, stream?})` → shared client, `maxRetries: 1`, writes the
  `ai_usage` row (Phase 1: settle-only; Phase 2 adds reserve), reads usage
  from `finalMessage()` on streams. Exposes `aiStream()` for the three
  streaming sites. `countTokens()` wrapper with a calibrated char-based
  fallback (per tokenizer generation).
- `lib/ai/pricing.ts` — price lookup from `ai_model_prices` (in-memory
  cache, effective_from), `usdMicros(usage, model)`.
- `supabase/migrations/069_ai_cost_controls.sql` + `_down` —
  `ai_model_prices` (seeded with the table above), `ai_usage`, `ai_budgets`
  (seeded with the brief's defaults, `enabled=false` until Phase 2 flips
  them), RLS enabled, `org_id` default org #1 on all three.
- `lib/supabase/types.ts` — the three table types.
- Call-site rewrites (all 14): `lib/portal/chat.ts`, `lib/portal/weekly-plan.ts`,
  `lib/scoring/engine.ts`, `lib/scoring/suggest.ts`, `lib/growth-areas/score.ts`,
  `lib/growth-areas/bands.ts`, `lib/nudges/llm.ts`, `lib/transcripts/title.ts`,
  `lib/notes/narrative.ts`, `app/api/notes/client-email/route.ts`,
  `app/api/generate/route.ts`, `app/api/clients/[id]/goals/generate/route.ts`,
  `app/api/clients/[id]/plan-session/route.ts` — delete the three copies of
  the retired-id guard and the eight per-file env reads.
- `scripts/check-ai-imports.sh` (+ `"prebuild"` npm hook) — greps
  `@anthropic-ai/sdk` outside `lib/ai/**` and `scripts/spikes/**` and fails
  the build. `.eslintrc.json` gains `no-restricted-imports` for the same
  path (editor feedback); the grep is the enforced gate.
- `.env.example`: the `AI_MODEL_*` overrides; retire `SCORING_MODEL`,
  `GENERATE_MODEL`, `GOALS_MODEL`, `NUDGE_MODEL`, `PLAN_SESSION_MODEL`,
  `TITLE_MODEL`, `SUGGEST_MODEL`, `PORTAL_CHAT_MODEL` (read once more as
  legacy fallbacks in `models.ts` with a deprecation warning, removed in
  Phase 4).
- `scripts/spikes/verify-ai-gateway.js` — pure-rule checks: price math in
  micros, model resolution, retired-id refusal, usage → row shape.
- Validate: every feature exercised once; every call leaves a `settled` row.

**Phase 2 — enforcement.** `lib/ai/budget.ts` (`reserve()` in one Postgres
transaction via `lib/supabase/pg.ts`-style SQL function `ai_reserve()` — the
check-and-insert must be atomic, so it is a SQL function, not two PostgREST
calls; `settle()`, `release()`), `070_ai_budget_reserve_fn.sql`,
`app/api/cron/ai-release-stale/route.ts` (+ `vercel.json`, 15-min stale
release, `cronHandler`), `lib/ai/alerts.ts` (50/80/100% org emails via
`sendCoachHtmlEmail`, claimed in a `ai_alerts` ledger row before sending),
portal wiring in `app/api/portal/chat/route.ts` (kill switch
`AI_PORTAL_CHAT_ENABLED`, 6/min + 30/day limits added to `access.ts`, soft-cap
model switch, hard-cap on-brand pause message), coach "Extend" action
(`PATCH /api/clients/[id]/ai-budget`, audit row), `portal_features.chat`
default OFF for ZF participants (flag read in `page.tsx` + chat route),
`scripts/spikes/verify-ai-budget-concurrency.js` (N concurrent reserves at a
near-exhausted cap → exactly the affordable count succeed; real Postgres).

**Phase 3 — context budgeter (shipped; see the status above).**
`lib/ai/context-budget.ts` (slices, drop order, 40k ceiling, 4000 output),
`lib/portal/context.ts` (loaders + `buildChatRequest`: excerpts, history
summary, upload fit, `count_tokens` verify, cache-controlled blocks),
`lib/portal/prompt.ts` split into `{prefix, snapshot, tail}`,
`lib/portal/chat.ts` on the parts, the chat route + page, migration 071
(history summary), `scripts/spikes/verify-context-budget.js`. The
`client_snapshots` cache and an `ai_usage.slices` column were not needed
(reasoning above).

**Phase 4 — cockpit (shipped; see the status above).**
`lib/ai/costs-math.ts` + `lib/ai/costs.ts`, `app/(authenticated)/command-
center/ai-costs/page.tsx` + `AiCostsPulseCard.tsx`, `app/api/admin/ai-costs/
route.ts`, `app/api/ai-costs/route.ts`, `components/dashboard/cards/
AiCostsCard.tsx` + `lib/dashboard/useAiCostsData.ts` (registered on the
dashboard and Business Center), `scripts/reconcile-ai-costs.js`,
`scripts/spikes/verify-ai-costs.js`; legacy env fallbacks removed from
`lib/ai/models.ts`.

### Deferred / logged (with reasoning)
- **Batch API for existing features** — scoring, growth pass, nudge extract
  are all fire-and-forget already; 50% off is available with no product
  change. Not in this brief; log as the first post-Phase-4 option.
- **Sonnet 5 for coach-side features** — ~33% cheaper than Sonnet 4.6 at
  equal-or-better quality per the docs; needs a rubric/golden-set re-run
  (rubrics/01–04) before switching the scoring engine. Deferred by the
  brief's "keep current models" rule.
- **Haiku 4.5 successor** — no Haiku 5 listed today; when 4.5 retires, the
  `background_compact` slot moves to `claude-sonnet-5` at `low` effort (the
  effort page's stated fit for high-volume routes) unless a new Haiku ships.
- **Client memory layer** — slice 3 reserved, empty (per brief).
- **Second Anthropic workspace/key** — Jeff's Console decision (item 9).

## Security decisions

### 2026-09-09 — get-only coach sign-in; no coach creation from webhooks; Zoom routes scoped

Decision (Jeff, P0 fix, branch `claude/route-scoping-audit-40cezr`; audit evidence in
`docs/qa/route-scoping-audit.md`):

1. **The `coaches` table is the sign-in allowlist.** `lib/authOptions.ts#callbacks.signIn`
   admits a Google account only when a `coaches` row already exists for its email
   (`lib/coach.ts#getCoachByEmail`). Sign-in creates nothing; `events.signIn` only updates
   the refresh token on the existing row, so Jeff's stored Gmail/Calendar tokens are
   untouched. A lookup ERROR fails **closed** (deny + server log) — approved over the old
   fail-open promise. `getSessionCoach` is get-only too: a still-valid JWT whose coach row
   was removed now reads as signed out (API → 401, `(authenticated)` layout → redirect to
   `/auth/error?error=AccessDenied`), instead of silently re-creating the row. All 88
   `getSessionCoach` call sites were checked for null handling in the same pass.
   `getOrCreateCoach` is retained for a future explicit admin path only and has **zero
   callers** (no auth, webhook, or cron may call it). Refusal page: `app/auth/error/page.tsx`
   (`pages.error`), plain copy, no error detail echoed. `BETA_COACH_EMAILS` no longer grants
   entry; it stays in `.env.example` for now and is ignored by code.
2. **A webhook can never create a coach.** `POST /api/transcripts/ingest` resolves
   `coachEmail` get-only; no row → 403 `coach_not_found` and a reviewable record in
   `cron_runs` (`job='transcripts-ingest'`, `status='failed'`, summary = coach email,
   filename, title, source, driveFileId, 180-char preview — the full markdown is not stored;
   Zapier's Drive archive keeps it). Review at
   `GET /api/admin/cron-runs?job=transcripts-ingest&status=failed`. No migration.
3. **Zoom.** `/api/zoom-test` deleted. `/api/zoom-summaries` now requires a coach row
   (`requireCoach`) and resolves the requested client by email → exact name **only within
   the caller's `accessibleClientIds`**; no match → empty result and no Zoom call; the
   calendar/Zoom matching uses the stored client name/email, never the caller's strings.
   The Zoom account is firm-wide (server-to-server), so this route is the boundary.

Onboarding a coach from here on: supervisor adds the row (Command Center → Add coach), then
the coach signs in with that Google account.

## Known isolation gaps (do NOT rely on DB enforcement)

Enforcement is app-code only; service-role bypasses RLS. Confirmed defects, logged for
the single Phase 1 pass (full detail + line numbers in `ISOLATION_AUDIT.md`):

1. **Ingest roster is global** (`lib/transcripts/ingest.ts:167`) — can attach/score a
   transcript under another tenant's client. Highest severity.
2. **`/api/coaches[/[id]]`** — any coach can list/create/edit/delete/**promote** any
   coach (privilege escalation).
3. **`/api/practice/revenue`** — computes revenue over all tenants' clients/notes.
4. **`/api/generate`** — reads any client's goals by id/name, no ownership check.
5. **No `organizations` table; no DB backstop** — the structural reason for Phase 1.

## Pending manual steps (owner: Jeff)

- Create the **staging Supabase project** + wire a Vercel **Preview** at it
  (`docs/STAGING_SETUP.md`).
- Remove `COACH_ACCOUNTABLE_*` from **Vercel** env (all scopes) — code no longer reads
  them; the Vercel vars are now dead.
- Migrations `001`–`041` are all applied in production (per `CLAUDE.md` ledger); no new
  migration ships in Phase 0.

## Where to look

| For | Read |
|---|---|
| Deep architecture, pipelines, data model | `CLAUDE.md` |
| Tenant-isolation posture, route inventory, Phase 1 plan | `ISOLATION_AUDIT.md` |
| How to make a schema change safely | `docs/MIGRATION_PROCEDURE.md` |
| Standing up staging | `docs/STAGING_SETUP.md` |
| Deploy / env setup | `README.md` |
