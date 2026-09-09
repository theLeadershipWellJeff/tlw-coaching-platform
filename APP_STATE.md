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
