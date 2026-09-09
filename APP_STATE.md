# APP_STATE.md — current state of the platform

_Factual snapshot first reconciled against the codebase on **2026-08-08** (Phase 0);
surface area, phase map, and isolation status **re-reconciled 2026-09-09**.
`CLAUDE.md` remains the deep architectural reference; this file is the quick,
current "what exists right now" ledger — hand it to any design chat as context._

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

## Surface area (as of 2026-09-09)

- **196 API route files** under `app/api/**` (123 at Phase 0; the Client Portal,
  assessment debrief, command center, and coach-task builds added the rest). Route-by-
  route isolation classification (Phase 0 snapshot): **`ISOLATION_AUDIT.md` §2**.
- **7 Vercel crons** (`vercel.json`): hourly `reminders` (+ the coach-task pass),
  `nudges`, `vault-sync`, `calendar-sync`, `billing-reminders`, `billing-retries`;
  daily `portal-reminders`. Every run logged to `cron_runs` (067). Audit: `ISOLATION_AUDIT.md` §3.
- **68 migrations**, strict `001`–`068`, every one with a paired `_down.sql`.
  **Applied by hand** in the Supabase SQL editor; **production is at `068`** (verify any
  "applied" claim with `scripts/sql/audit-migrations.sql`, never the ledger alone — the
  2026-08-24 confirmation of 051–055 was wrong, found 2026-09-09). `042` = the Phase 1
  §5.0 tenant foundation (`organizations` + `org_id` on every tenant table); `043` = the
  only RLS policies in the codebase (SELECT on `notes`/`actions`, **dormant** — nothing
  reads through them yet).
- **Staging Supabase project: PAUSED** (free tier, unused since 056). Every migration
  056–068 went straight to production under an additive-only exception. There is no
  two-org rehearsal environment live today.

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
- **Client Portal** (`app/portal/*`, migrations 044–055): magic-link + username/password
  auth, read-only cards, sent-notes-only gate, streaming retrieval chat, FTS search,
  frameworks + PDF, uploads, tour, rate limiting + access log, solo-only billing.
- **Assessment debrief add-on** (ZF 360 first, 059–066): deterministic PDF extraction,
  document pipeline, portal 360 card + grounded chat, weekly-plan mode, private notes,
  portal reminders, command-center admin (companies/cohorts/users/documents/support/briefs).
- **Multi-coach beta readiness** (046–048): supervisor role, coach-scoped ingest, per-coach
  signature/calendar/profile, sign-in allowlist, first-run checklist.
- **Admin Command Center** (057): firm pulse, coach plans, cross-tenant client drill-down,
  coach platform billing (schema in; Stripe go-live steps NOT done).
- **Coach attention queue** (067–068): `coach_tasks`, "Needs your attention" panel,
  claim-before-send note close-out, `cron_runs` failure log. Phase 4 (digest) pending.

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

### Phase 1 sub-phase status (verified against code 2026-09-09)

| § | Item | Status |
|---|---|---|
| 5.0 | `organizations` + `org_id` big-bang (042) | ✅ done (staging + prod) |
| 5.1 | JWT minting substrate | ⛔ superseded (ES256 keys) → Option A direct-Postgres (`withOrgClaim`) proven on staging |
| 5.2 | Pre-RLS correctness fixes (the 4 confirmed defects + `client-lookup`) | ✅ **all done** — ingest roster is coach-scoped (`accessibleClientIds`), `/api/coaches[/[id]]` is `requireSupervisor`, `/api/practice/revenue` is scoped, `/api/generate` gates on `coachCanAccessClient` |
| 5.3 | Strangler RLS rollout (5 groups) | ⏸ **parked** — 043 policies applied but dormant; group 1a routes reverted on the bad prod `SUPABASE_DB_URL` password. Groups 2–5 not started |
| 5.4 | Per-tenant BYO Anthropic key (`getAnthropic(tenant)`) | ❌ not started — 13 `new Anthropic(` sites |
| 5.5 | Singleton migration off `JEFF_*` env | ⚠️ partial — outbound identity is per-coach (beta work); 18 `JEFF_FROM_EMAIL`/`JEFF_CC_EMAIL` fallback refs remain |
| 5.6 | Sponsor = promoted `billing_accounts` + read-only aggregate | ❌ not started |
| 5.7 | TTL on `receipt`/`authorize`/`agenda` tokens | ❌ not started |
| 5.8 | Per-org ingest endpoint/secret | ❌ not started (single `INGEST_SECRET`, coach-scoped by the ingesting coach) |
| 5.9 | Per-coach Zoom + delete `/api/zoom-test` | ❌ not started — `app/api/zoom-test/route.ts` still exists |
| 5.10 | Vault-lite provider seam | ❌ not started |
| 5.11 | Stripe Connect for external tenants | ❌ not started |
| 5.12 | GDPR special-category hooks | ❌ not started |
| 5.13 | Tenant→DB lookup, not constant | ⚠️ seam only (`lib/tenant.ts`, `lib/supabase/pg.ts`); no per-org lookup |

**Phase 1 is not complete.** The defect fixes (5.2) closed the four confirmed
cross-tenant holes, so the app is safe for **one firm with several coaches**. The
DB backstop (5.3) and everything that makes a **second organization** safe (5.4,
5.6–5.11) remain. Natural trigger to resume: onboarding a second real organization.

## Phase map — where the product build stands (2026-09-09)

The platform's phases were defined in Phase 0 (`ISOLATION_AUDIT.md`,
`docs/PHASE_1_BUILD_BRIEF.md` §7): **Phase 0** = decommission CA, renumber
migrations, staging artifacts, isolation audit (✅ done 2026-08). **Phase 1** =
multi-tenant enforcement (⏸ partially done, table above). **Phase 2** was never
written as its own brief — the Phase 1 brief simply names it as "the client-facing
portal, groups, SMS, and other roadmap features" and instructs "log it and stop —
no scope pull-forward."

In practice that rule was not followed: the Client Portal, the assessment debrief,
the command center, and the coach attention queue — all Phase 2 by that definition
— shipped on top of the parked Phase 1. So today:

- **Phase 2 work already built:** Client Portal (all 7 planned phases), assessment
  debrief (Phases 1–5), multi-coach beta readiness, Admin Command Center, coach
  attention queue Phases 1–3.
- **Phase 2 work still open (from `CLAUDE.md` Roadmap → Open):**
  - Coach attention queue **Phase 4** — daily digest email + settings (columns
    `coaches.digest_hour/digest_enabled/last_digest_sent_on` exist; nothing reads them).
  - **Groups** (major build, architecture TBD) — sidebar stub only.
  - **SMS** delivery for nudges/reminders (Twilio) — not started.
  - **Worksheets** (client fill-in) — folders exist with a "still being built" banner.
  - **Supervisor cross-coach roll-up** (Claude-vs-coach comparison) — schema ready, no page.
  - **Background prep-sheet generation** — old `/session/[id]` flow still blocks ~45 s.
  - **Billing run enterprise grouping**, **coaching map send-to-client graphical render**.
  - **Calendar push channel** (`events.watch`) — hourly poll stands in.
  - **Plaud/Zoom automated intake per coach** — post-beta (Tier 3 of the beta plan).
  - **Coach billing go-live** — Stripe price/webhooks/portal config (manual, Jeff).
  - Portal: private notes not yet in Quick search (own migration); ACH deliberately not built.

### Gate for new builds (the rule the parked builds are held to)

A proposed build is **"design now, log here, build after staging + RLS"** when it
(a) adds a cron or extends one — the platform's proven silent-failure mode, now
logged by `cron_runs` but still with no UI review panel; (b) sends client-facing
email on a new path — ranked risk, every client-facing send must go through an
existing audited transport (`sendCoachHtmlEmail` / `deliverPortalEmail` /
`sendSessionNoteEmail`) and log to `communications`; or (c) adds a tenant table
before the RLS group that would cover it exists — every new table today ships
with `ENABLE ROW LEVEL SECURITY` and **no policy**, isolation in app code only.
Accepting it sooner means accepting: no two-org rehearsal (staging paused), a
new unpoliced table, and a new send path reviewed by reading, not by test.

**Prerequisites to lift the gate:** (1) wake or recreate the staging project and
re-run the two-org seed (`docs/STAGING_SETUP.md`); (2) reset the prod DB password
and restore `SUPABASE_DB_URL`; (3) re-apply the group-1a `withOrgClaim` routes
(PR #180) and verify; (4) proceed through the 5.3 groups. Builds logged as
deferred under this gate: _(add entries here as design chats park them)_.

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

Enforcement is app-code only; service-role bypasses RLS (043's SELECT policies are
applied but nothing reads through them). Status of the Phase 0 findings:

1. ~~Ingest roster is global~~ — **fixed** (coach-scoped via `accessibleClientIds`).
2. ~~`/api/coaches[/[id]]` open to any coach~~ — **fixed** (`requireSupervisor`).
3. ~~`/api/practice/revenue` over all tenants~~ — **fixed** (scoped).
4. ~~`/api/generate` reads any client's goals~~ — **fixed** (`coachCanAccessClient`).
5. **No DB backstop** — still true. `organizations` exists (042) but no route reads
   under RLS. One forgotten `.eq('coach_id', …)` still leaks; there is no automated
   test suite to catch it. Every table added since 042 (044–068: portal, debrief,
   command center, coach tasks) carries `org_id` by default + RLS enabled + no policy.
6. **Deliberate cross-tenant window:** `GET /api/coaches/[id]/clients` (Command
   Center drill-down) — supervisor-only, never selects `key_info`.

## Pending manual steps (owner: Jeff)

- **Wake/recreate the staging Supabase project** + wire a Vercel Preview at it
  (`docs/STAGING_SETUP.md`). Paused since 056; the RLS rollout cannot resume without it.
- **Reset the production DB password** and set the prod `SUPABASE_DB_URL` (Phase 1 §5.3).
- Remove `COACH_ACCOUNTABLE_*` and `SUPABASE_JWT_SECRET` from Vercel env (dead).
- **Coach billing go-live** (Stripe price + 3 webhook events + customer portal) —
  checklist in `CLAUDE.md`.
- Coach attention queue: run the live cron check Jeff skipped on 067; confirm Phase 4.

## Where to look

| For | Read |
|---|---|
| Deep architecture, pipelines, data model | `CLAUDE.md` |
| Tenant-isolation posture, route inventory, Phase 1 plan | `ISOLATION_AUDIT.md` |
| How to make a schema change safely | `docs/MIGRATION_PROCEDURE.md` |
| Standing up staging | `docs/STAGING_SETUP.md` |
| Deploy / env setup | `README.md` |
