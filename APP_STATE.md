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
- **7 Vercel crons** (`vercel.json`): hourly `reminders` (+ the coach-task pass),
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

**Phase 3 — context budgeter.** `lib/ai/context-budget.ts` (slices in the
brief's order with per-slice token caps, drop order excerpts → history →
snapshot, 40k hard ceiling, effort `medium`, `max_tokens` 4000 incl.
thinking), `lib/portal/chat.ts` rebuilt on it (stable prefix = system +
snapshot with `cache_control`; retrieval and history move OUT of the system
string into the messages array so the prefix caches), a
`client_snapshots`-style cache for slice 2 (rebuilt on source change —
column on `clients` or a small table, decided then), Haiku summarisation of
turns older than 6 (`background_compact`), upload truncation notice, slice
sizes logged to `ai_usage.slices` jsonb (added in the Phase 3 migration),
`scripts/spikes/verify-context-budget.js`.

**Phase 4 — cockpit.** `app/(authenticated)/command-center/ai-costs/page.tsx`
(supervisor), `app/api/admin/ai-costs/route.ts` (MTD by org/feature/client/
model, % of cap, cost vs `billing` revenue join, top 10), a coach-scoped
`app/api/ai-costs/route.ts` + dashboard card, reconciliation script against
the Console CSV export.

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
