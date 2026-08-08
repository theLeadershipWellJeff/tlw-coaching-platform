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
- **6 Vercel crons** (all hourly, `vercel.json`): `reminders`, `nudges`, `vault-sync`,
  `calendar-sync`, `billing-reminders`, `billing-retries`. Audit: `ISOLATION_AUDIT.md` §3.
- **41 migrations**, strict `001`–`041` (Phase 0 renumbered the old `026`/`034`
  duplicates — map in `docs/MIGRATION_PROCEDURE.md`). **Applied by hand** in the
  Supabase SQL editor; production is at `041`.

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
