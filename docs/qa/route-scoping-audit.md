# Route scoping audit — `app/api/**`

**Date:** 2026-09-09 · **Branch:** `claude/route-scoping-audit-40cezr` · **Scope:** every `route.ts` under `app/api` (196 handlers, enumerated by walking the filesystem — `find app/api -name route.ts`). Read-only audit; no route was modified.

Companion file: `docs/qa/route-scoping-allowlist.json` (the 48 routes that legitimately do not tenant-scope, each with a justification).

## 1. Headline

| Verdict | Routes |
|---|---|
| Scoped | 146 |
| Allowlisted exception | 48 |
| UNSCOPED — REVIEW | 2 |
| Blank / unclear | 0 |

- **No P0 portal boundary issue found.** All 28 `/api/portal/**` handlers either resolve the authenticated `clientId` from the signed portal cookie and filter every query on it, or are pre-session auth steps that only mint/consume a token for one client. None selects `clients.key_info`, none returns `coach_clients`, and none can address another client's row (details in §2).
- **Two UNSCOPED routes, both on the Zoom integration:** `/api/zoom-summaries` and `/api/zoom-test` expose the firm-wide Zoom account's AI Companion summaries to any signed-in Google session, with no roster or `coach_clients` check (§4).
- The list/aggregate surface (dashboard, practice, business-center, nudges, reports, transcripts, search, coaching hours, tasks, bookings, billing) is consistently scoped by an explicit `coach_id` filter or `accessibleClientIds` (§3).

## 2. Priority 1 — Client Portal (`/api/portal/**`)

**Result: no P0.** Method: every handler was read in full, plus every `lib/portal/*` and `lib/documents/*` helper the handlers delegate data access to (`server.ts`, `session.ts`, `chat.ts`, `assessments.ts`, `billing.ts`, `frameworks.ts`, `company.ts`, `weekly-plan.ts`, `goals.ts`, `notes.ts`, `coach.ts`, `tokens.ts`, `credentials.ts`, `access.ts`, `events.ts`, `pipeline.ts`).

What holds the boundary:

- **Principal.** `getPortalClientId()` verifies the HMAC-signed `tlw_portal_session` cookie (`portal: true` claim, expiry) and returns only `clientId`. A coach NextAuth session is never consulted on this surface; `middleware.ts` guards the pages, the API routes self-guard (401).
- **Every read/write keyed on that id.** Conversations, messages, documents, notes, weekly plans, goals, profile, events, access log: the session `clientId` is in the `WHERE` of the statement itself (not only in a prior ownership read), e.g. `portal_conversations` PATCH/DELETE, `portal_notes`, `weekly_plans`, `client_documents` all carry `.eq('client_id', clientId)` on the UPDATE/DELETE.
- **`key_info` never reaches the portal.** The only `clients` selects on this surface are explicit column lists: `id, org_id, name, email, phone, timezone, portal_features, coaching_goals, company_id, client_type, preferred_name`. The string `key_info` appears in `lib/portal/chat.ts` and `lib/portal/data.ts` only inside comments stating the rule. Repo-wide, `key_info` is selected by exactly one API route, `/api/admin/portal-users/[id]` (supervisor-only, §5).
- **`coach_clients` on the portal side.** Read in two server-side helpers only, both filtered on the session client: `lib/portal/coach.ts#resolveClientCoach` (to pick which coach's Gmail sends the contact/upload notice — the coach row is used for transport and never returned to the client) and `lib/portal/chat.ts#buildChatContext` (a `hasCoach` boolean for prompt wording). Neither exposes coach ids or other clients.
- **Cross-client id probing.** `chat/[id]`, `documents/[id]`, `documents/[id]/download`, `documents/[id]/retry`, `notes/[id]`, `weekly-plan` (planId), `frameworks/[slug]/pdf` all 404 on a row that is not the session client's; billing 404s (never 403) when the client is not the payer.
- **Second-order sources are scoped too.** Chat retrieval uses `portal_chat_context(p_client_id)` / `portal_search(p_client_id)` SQL functions; company context is reached strictly through the client's own `company_id`; frameworks and their PDFs are authorized against this client's own nudge/mention history and re-checked `nudge_eligible`; the 360 in context is the most recent complete document for this `client_id` only.
- **Pre-session routes** (`auth/login`, `auth/request`, `auth/verify`, `auth/logout`) are allowlisted: anti-enumeration responses, hashed single-use tokens, per-client rate limits, and a cookie minted only for the client the credential resolved to.

Portal observations that are not scoping defects (recorded for completeness):

- `POST /api/portal/profile` lets a client change `clients.name`, which is the key the 360 name-gate compares on retry. This is the documented self-service path for a mismatch; it means a client holding someone else's report PDF could rename to match and attach it to their own record. No cross-tenant read results — the file was already in their hands — but it is the one place the gate can be satisfied by the client alone.
- `GET /api/portal/billing` returns the full tracked pay URL (`invoices.receipt_token`). The client is the payer on a solo account, so this is their own credential.

## 3. Priority 2 — list and aggregate endpoints

All read in full. Mechanism per route is in the table; summary:

| Area | Routes | Mechanism | Verdict |
|---|---|---|---|
| Dashboard | `accomplished`, `communications`, `nudges`, `todo`, `layout`, `calendar-load` | `.eq('coach_id', coach.id)` on every tenant table; calendar via the coach's own token | Scoped |
| Practice | `revenue`, `competency-focus` | `accessibleClientIds` (notes/clients) + `invoices.coach_id`; own coach row | Scoped |
| Business Center / workspace layouts | `business-center/layout`, `workspace/layout`, `dashboard/layout` | `dashboard_layouts (coach_id, surface)` | Scoped |
| Nudges | `nudges`, `nudges/suggested`, `nudges/[nudgeId]`, `dashboard/nudges` | `nudges.coach_id`; PDF attachment must be the coach's own `pdf_resources` row | Scoped |
| Reports / scorecard | `reports`, `reports/summary`, `reports/[id]/*` (6) | `session_reports.coach_id` + `transcripts.coach_id` on every read and write | Scoped |
| Transcripts | `transcripts`, `transcripts/[id]`, `transcripts/manual` | `transcripts.coach_id`; client assignment gated by `coachCanAccessClient`; manual ingest matches only `accessibleClientIds` | Scoped |
| Search | `search` | `accessibleClientIds` on clients and notes | Scoped |
| Coaching hours | 5 routes | `accessibleClientIds` for note-backed rows, `coach_id` for imported entries | Scoped |
| Attention queue | `tasks`, `tasks/[id]`, `tasks/[id]/note` | `lib/coach-tasks/queue.ts` filters `coach_id` on tasks and appointments | Scoped |
| Bookings | 3 routes | `appointments.coach_id`; assignment target gated by `coachCanAccessClient` | Scoped |
| Billing (coach side) | 26 routes | account / invoice / engagement loaded `.eq('coach_id')` before any read or write; `lib/billing/run.ts`, `charge.ts`, `adjustments.ts`, `engagement-progress.ts` all take and filter `coachId`; `billing/reminders` joins `invoices!inner(coach_id)` | Scoped |
| Roster | `clients`, `clients/timezones` | `accessibleClientIds` | Scoped |
| `/api/clients/[id]/**` | 37 routes | `requireClientCoach(params.id)` (404 on no link); two billing sub-routes use the equivalent `coachCanAccessClient` + `coach_id` filters | Scoped |

**Shared-client caveat (informational, not a finding).** `dashboard/todo`, `nudges/suggested`, and `lib/nudges/enrich.ts#loadAppointmentContext` look up `appointments` by `.in('client_id', ids)` where the ids come from the coach's own nudges, without an additional `coach_id` filter. For a client linked to two coaches (`role='shared'`), one coach's card can show the other coach's appointment times for that shared client. Both coaches already have full access to the client, so no boundary is crossed.

## 4. UNSCOPED — REVIEW

| Route | Methods | Why |
|---|---|---|
| `/api/zoom-summaries` | GET | Gated only by `getServerSession` (a `coaches` row is not required). Reads the **firm-wide** Zoom account via server-to-server `account_credentials` (`lib/zoom.ts`) and returns AI Companion summaries (overview, details, next steps) matched to a caller-supplied `clientName` / `clientEmail` / `sessionTimes` query string. There is no `coach_clients` / roster check, so any signed-in coach can pull meeting summaries for another coach's client — or any meeting on the account — by name or email. |
| `/api/zoom-test` | GET | Diagnostic endpoint, same session-only gate, dumps the account's recent summaries (topics, host emails, overview text, next steps, section samples). Not tenant-scoped; recommend deleting it or gating on `requireSupervisor`. |

Suggested direction for a follow-up (not applied — this audit is report-only): resolve the coach with `requireCoach`, resolve the client via `findClientByEmailOrName` + `coachCanAccessClient` (the pattern `/api/generate` already uses), and only then match Zoom summaries; or scope the Zoom lookup by the coach's own host email.

## 5. Other observations (not verdict-changing)

- **`/api/transcripts/ingest` — the secret holder picks the tenant.** The Zapier webhook trusts `body.coachEmail` (falling back to `DEFAULT_COACH_EMAIL`) and calls `getOrCreateCoach`, so a caller holding `INGEST_SECRET` can file a transcript onto any coach — and create a new `coaches` row for an unknown email. Matching inside `ingestMarkdown` is correctly limited to that coach's `accessibleClientIds`. Allowlisted as a shared-secret webhook; consider pinning `coachEmail` to an allowlist or existing rows only.
- **`/api/sessions`** reads the caller's own Google Calendar with the session access token (principal-owned, so Scoped) but hardcodes `calendarId: 'primary'` and detects the coach with `JEFF_FROM_EMAIL` / `JEFF_CC_EMAIL` — a drift from the `coachCalendarId` rule in CLAUDE.md and from "outbound identity is the acting coach's". Not a scoping defect.
- **`key_info` exposure map.** Selected by exactly two API routes: `GET /api/clients/[id]` (`select('*')` for the linked coach — the field's owner) and `GET/PATCH /api/admin/portal-users/[id]` (supervisor-only command-center page). No portal, cron, webhook, or aggregate route reads it. Server-side libraries that read it (`lib/scoring/store.ts`, `lib/growth-areas/score.ts`, `lib/client-csv.ts`) are coach-side; `lib/nudges/generate.ts` mentions it only to exclude it.
- **Supervisor surfaces are cross-tenant by design** (`/api/admin/**` = 20 routes via `adminContext()` → `requireSupervisor`; `/api/coaches/**` = 7 routes via `requireSupervisor`). All write `admin_audit_log`. They are listed as allowlisted exceptions rather than "Scoped" because they intentionally read across coaches; the boundary is the `role='supervisor'` check on the session coach.
- **`/api/vault/map` and `/api/vault/maps`** return firm-level content from the vault repo (the practice's shared coaching maps) to any signed-in coach; no tenant data is involved. Allowlisted as shared content.
- **`/api/cron/*`** all refuse to run when `CRON_SECRET` is unset (503) and compare the Bearer token exactly; all seven are wrapped in `cronHandler`.
- **Stripe webhook** verifies the signature before touching the database and returns 200 after verification regardless of handler outcome (by design, so Stripe stops retrying).

## 6. Allowlist summary (`docs/qa/route-scoping-allowlist.json`, 48 entries)

| Category | Count | Routes |
|---|---|---|
| Public token link | 5 | `actions/complete`, `agenda/[token]`, `agreements/sign`, `billing/authorize/[token]/session`, `billing/invoices/receipt/[token]` |
| Webhook / shared secret | 2 | `billing/webhooks/stripe`, `transcripts/ingest` |
| Cron entry point | 7 | `cron/{billing-reminders, billing-retries, calendar-sync, nudges, portal-reminders, reminders, vault-sync}` |
| Auth handler | 1 | `auth/[...nextauth]` |
| Portal pre-session auth | 4 | `portal/auth/{login, logout, request, verify}` |
| Supervisor cross-tenant | 27 | `admin/**` (20), `coaches/**` (7) |
| Firm-shared content | 2 | `vault/map`, `vault/maps` |

## 7. Validation

- `find app/api -name "route.ts" | wc -l` → **196**; table rows → **196**. Enumeration was by filesystem walk, not from any existing list.
- Every row carries one of the three verdicts; blank or "unclear" verdicts → **0**.
- Every allowlist entry carries a written justification → **48 / 48**.
- Verdict counts: Scoped 146 · Allowlisted exception 48 · UNSCOPED — REVIEW 2.
- Scoping-mechanism vocabulary used: `requireClientCoach` / `accessibleClientIds` / explicit `coach_id` filter / explicit `client_id` filter / none detected. Where a route reads no tenant data at all (a Google/Stripe call with the caller's own token, or body-only generation) the mechanism is recorded as "none detected (no tenant data read)" with the verdict Scoped and the reason in Notes.
- Supporting helpers read in full: `lib/api-handler.ts`, `lib/client-access.ts`, `lib/coach.ts`, `lib/admin/route.ts`, `lib/billing/access.ts`, `lib/cron-runs.ts`, `middleware.ts`, `lib/coach-tasks/queue.ts`, `lib/coaching-hours.ts`, and the portal/document libraries listed in §2; `lib/billing/{run,charge,adjustments,engagement-progress}.ts`, `lib/transcripts/ingest.ts`, `lib/booking-sync.ts`, `lib/nudges/enrich.ts`, `lib/zoom.ts`, `lib/billing/stripe.ts#constructWebhookEvent` were checked by targeted grep for their `coach_id` / `client_id` filters.

## 8. Full route table

Methods are the exported HTTP handlers. "Requires auth?" names the gate. Notes name the exact filter or helper that holds the boundary.

| Path | Methods | Requires auth? | Scoping mechanism | Principal | Verdict | Notes |
|---|---|---|---|---|---|---|
| `/api/actions/complete` | GET | No | none detected | public | Allowlisted exception | Token = credential: row looked up by `actions.complete_token`; idempotent status flip only, no cross-row read. |
| `/api/admin/briefs/[id]` | POST | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/briefs` | GET, POST | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/cohorts/[id]/invite` | POST | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/cohorts/[id]/roster` | GET | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/cohorts/[id]` | PATCH | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/cohorts` | POST | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/companies/[id]/documents/[docId]` | DELETE, PATCH | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/companies/[id]/documents` | GET, POST | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/companies/[id]` | PATCH | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/companies` | GET, POST | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/cron-runs` | GET | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/documents/[id]` | DELETE, POST | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/documents` | GET, POST | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/portal-stats` | GET | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/portal-users/[id]/documents` | POST | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/portal-users/[id]/invite` | POST | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/portal-users/[id]` | GET, PATCH | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor`; cross-tenant by design. The ONE admin route that reads/writes `clients.key_info` (coach-private, shown to the supervisor only; never a portal surface). |
| `/api/admin/portal-users` | GET, POST | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/support/[id]` | POST | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/admin/support` | GET | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `adminContext()` → `requireSupervisor` (401/403); cross-tenant by design (command center); actions write `admin_audit_log`. |
| `/api/agenda/[token]` | GET, POST | No | none detected | public | Allowlisted exception | Token = credential: `agenda_requests.token`; GET returns first name + prompts + own answers; POST writes that row only and notifies the linked coach. |
| `/api/agreements/issue` | POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(body.clientId)`; template get-or-create for the session coach; row inserted with `coach_id`; sent via the caller's Gmail. |
| `/api/agreements/sign` | POST | No | none detected | public | Allowlisted exception | Token = credential: `agreements.sign_token`, expiry + already-signed checks; update guarded on `status=sent`; promotes flags onto that agreement's client only. |
| `/api/agreements/template` | GET, PUT | Yes | explicit coach_id filter | coach | Scoped | `getOrCreateAgreementTemplate(coach)`; PUT filtered `.eq('id').eq('coach_id')`; `lastIssued` from `agreements.coach_id`. |
| `/api/auth/[...nextauth]` | GET, POST | No | none detected | public | Allowlisted exception | NextAuth handler (Google OAuth); `BETA_COACH_EMAILS` allowlist in `authOptions.signIn`. |
| `/api/billing/accounts/[id]/authorization/send` | POST | Yes | explicit coach_id filter | coach | Scoped | Account / invoice / engagement row loaded `.eq('coach_id', coach.id)` (404) before any read or write; money routes use `getBillingActor` (`canWrite` seam). |
| `/api/billing/accounts/[id]/coachees` | POST | Yes | explicit coach_id filter | coach | Scoped | Account `.eq('coach_id')`; target `client_id` must have a `coach_clients` link for this coach; coachee/engagement updates filtered on `coach_id`. |
| `/api/billing/accounts/[id]/engagements` | GET, POST | Yes | explicit coach_id filter | coach | Scoped | Account / invoice / engagement row loaded `.eq('coach_id', coach.id)` (404) before any read or write; money routes use `getBillingActor` (`canWrite` seam). |
| `/api/billing/accounts/[id]/payment-method/reconfirm` | POST | Yes | explicit coach_id filter | coach | Scoped | Account / invoice / engagement row loaded `.eq('coach_id', coach.id)` (404) before any read or write; money routes use `getBillingActor` (`canWrite` seam). |
| `/api/billing/accounts/[id]/payment-method/remove` | POST | Yes | explicit coach_id filter | coach | Scoped | Account / invoice / engagement row loaded `.eq('coach_id', coach.id)` (404) before any read or write; money routes use `getBillingActor` (`canWrite` seam). |
| `/api/billing/accounts/[id]` | DELETE, GET, PATCH | Yes | explicit coach_id filter | coach | Scoped | Account / invoice / engagement row loaded `.eq('coach_id', coach.id)` (404) before any read or write; money routes use `getBillingActor` (`canWrite` seam). |
| `/api/billing/accounts` | GET, POST | Yes | explicit coach_id filter | coach | Scoped | `billing_accounts.coach_id`; `?clientId` resolution additionally gated by `coachCanAccessClient`. |
| `/api/billing/accounts/setup-all` | POST | Yes | explicit coach_id filter | coach | Scoped | Iterates `coach_clients.coach_id = coach.id`; inserts accounts/coachees stamped with `coach_id`. |
| `/api/billing/authorize/[token]/session` | POST | No | none detected | public | Allowlisted exception | Token = credential: `billing_accounts.authorization_token` (UUID-shape checked); creates a Stripe setup Checkout for that account only. |
| `/api/billing/engagements/[id]` | GET, PATCH | Yes | explicit coach_id filter | coach | Scoped | Account / invoice / engagement row loaded `.eq('coach_id', coach.id)` (404) before any read or write; money routes use `getBillingActor` (`canWrite` seam). |
| `/api/billing/invoices/[id]/adjust` | POST | Yes | explicit coach_id filter | coach | Scoped | `createAdjustment(supabase, actor.coach.id, id, …)` — `lib/billing/adjustments.ts` loads the invoice `.eq('coach_id')`. |
| `/api/billing/invoices/[id]/approve` | POST | Yes | explicit coach_id filter | coach | Scoped | Account / invoice / engagement row loaded `.eq('coach_id', coach.id)` (404) before any read or write; money routes use `getBillingActor` (`canWrite` seam). |
| `/api/billing/invoices/[id]/charge` | POST | Yes | explicit coach_id filter | coach | Scoped | `chargeInvoice(supabase, actor.coach.id, id)` — `lib/billing/charge.ts` loads the invoice `.eq('coach_id')`; claim-before-charge idempotency. |
| `/api/billing/invoices/[id]/decline-note` | GET, POST | Yes | explicit coach_id filter | coach | Scoped | Account / invoice / engagement row loaded `.eq('coach_id', coach.id)` (404) before any read or write; money routes use `getBillingActor` (`canWrite` seam). |
| `/api/billing/invoices/[id]/lines/[lineId]` | DELETE, PATCH | Yes | explicit coach_id filter | coach | Scoped | Invoice `.eq('coach_id')` + draft check; line update/delete filtered `.eq('invoice_id', params.id)`. |
| `/api/billing/invoices/[id]/lines` | GET, POST | Yes | explicit coach_id filter | coach | Scoped | Invoice `.eq('coach_id')` (404) before lines are read/added; lines keyed on that `invoice_id`. |
| `/api/billing/invoices/[id]/mark-paid` | POST | Yes | explicit coach_id filter | coach | Scoped | Account / invoice / engagement row loaded `.eq('coach_id', coach.id)` (404) before any read or write; money routes use `getBillingActor` (`canWrite` seam). |
| `/api/billing/invoices/[id]/resend` | POST | Yes | explicit coach_id filter | coach | Scoped | Account / invoice / engagement row loaded `.eq('coach_id', coach.id)` (404) before any read or write; money routes use `getBillingActor` (`canWrite` seam). |
| `/api/billing/invoices/[id]/retry` | POST | Yes | explicit coach_id filter | coach | Scoped | Account / invoice / engagement row loaded `.eq('coach_id', coach.id)` (404) before any read or write; money routes use `getBillingActor` (`canWrite` seam). |
| `/api/billing/invoices/[id]` | DELETE, GET, PATCH | Yes | explicit coach_id filter | coach | Scoped | Account / invoice / engagement row loaded `.eq('coach_id', coach.id)` (404) before any read or write; money routes use `getBillingActor` (`canWrite` seam). |
| `/api/billing/invoices/[id]/send` | POST | Yes | explicit coach_id filter | coach | Scoped | Account / invoice / engagement row loaded `.eq('coach_id', coach.id)` (404) before any read or write; money routes use `getBillingActor` (`canWrite` seam). |
| `/api/billing/invoices/receipt/[token]` | GET | No | none detected | public | Allowlisted exception | Token = credential: `invoices.receipt_token`; stamps `received_at` once and 302s to Stripe hosted URL. |
| `/api/billing/invoices` | GET, POST | Yes | explicit coach_id filter | coach | Scoped | Account / invoice / engagement row loaded `.eq('coach_id', coach.id)` (404) before any read or write; money routes use `getBillingActor` (`canWrite` seam). |
| `/api/billing/reminders` | GET | Yes | explicit coach_id filter | coach | Scoped | Join filter `invoices!inner(coach_id)` with `.eq('invoices.coach_id', coach.id)`. |
| `/api/billing/run/approve-all` | POST | Yes | explicit coach_id filter | coach | Scoped | Batch update `.in('id', ids).eq('coach_id').eq('status','draft')`; foreign ids are silently skipped. |
| `/api/billing/run/assemble` | POST | Yes | explicit coach_id filter | coach | Scoped | `assembleRun(supabase, coach.id, …)` — every engagement/invoice query in `lib/billing/run.ts` filters `coach_id`. |
| `/api/billing/sessions` | GET | Yes | explicit coach_id filter | coach | Scoped | Engagement loaded `.eq('coach_id')`; sessions derived for its coachee's client only. |
| `/api/billing/webhooks/stripe` | POST | No (Stripe signature) | none detected | webhook | Allowlisted exception | `constructWebhookEvent` verifies `stripe-signature` with `STRIPE_WEBHOOK_SECRET` before any DB write; rows matched by Stripe ids / `tlw_*` metadata. |
| `/api/bookings/[id]` | PATCH | Yes | explicit coach_id filter | coach | Scoped | Booking loaded `.eq('coach_id')`; assignment target must pass `coachCanAccessClient`. |
| `/api/bookings/sync` | POST | Yes | explicit coach_id filter | coach | Scoped | `syncExternalBookings(coach)`: roster = `coach_clients.coach_id`, upserts keyed `(coach_id, google_event_id)`, own refresh token. |
| `/api/bookings/unmatched` | GET | Yes | explicit coach_id filter | coach | Scoped | `appointments.coach_id = coach.id`, `client_id IS NULL`. |
| `/api/business-center/layout` | GET, PUT | Yes | explicit coach_id filter | coach | Scoped | `dashboard_layouts` keyed `(coach_id, surface)`. |
| `/api/calendar/list` | GET | Yes | none detected (no tenant data read) | coach | Scoped | Google calendarList via the session coach's own refresh token. |
| `/api/clients/[id]/actions/[actionId]` | PATCH | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/actions` | GET | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/agenda` | GET | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/agreements` | GET | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/appointments/[appointmentId]` | DELETE | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/appointments` | GET | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/billing` | GET, POST | Yes | requireClientCoach | coach | Scoped | Equivalent gate: `coachCanAccessClient(coach.id, params.id)` → 404, plus every `coachees`/`billing_accounts`/`engagements` query carries `.eq('coach_id', coach.id)`. |
| `/api/clients/[id]/billing/sessions` | GET | Yes | requireClientCoach | coach | Scoped | Equivalent gate: `coachCanAccessClient` → 404; `getEngagementProgress(coach.id, [id])` filters `coach_id`. |
| `/api/clients/[id]/captures` | GET | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/communications` | GET | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/documents/[docId]/retry` | POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/documents/[docId]` | DELETE, GET | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/documents` | GET, POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach`; GET via `listCoachVisibleDocuments` (visible_to_coach=true, never personnel_review, text/structured stripped). |
| `/api/clients/[id]/goals/generate` | POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/history` | GET | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/import-file` | POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach`; `ingestMarkdown` forced onto `params.id` for this coach. |
| `/api/clients/[id]/notes/[noteId]/actions` | POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/notes/[noteId]/narrative` | GET, PATCH, POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/notes/[noteId]/reopen` | POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/notes/[noteId]` | DELETE, PATCH | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/notes/[noteId]/send` | POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach` + Gmail session token; note loaded with `client_id`; claim-before-send CAS. |
| `/api/clients/[id]/notes` | GET, POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/nudges/context` | GET | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/nudges/draft-one` | POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/nudges/generate` | POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/nudges` | GET, POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach`; nudges filtered on `client_id` AND `coach_id`. |
| `/api/clients/[id]/plan-session` | POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/plans/[planId]` | DELETE, GET, PATCH | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/plans` | GET, POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/portal-invite` | GET, POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach`; mints a magic link for this client only; GET reads portal state (`client_credentials`/`portal_access_log`) for this client. |
| `/api/clients/[id]/prep-sheets` | GET | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]` | DELETE, GET, PATCH | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(params.id)`; GET is `select('*')` (includes `key_info` — correct: the linked coach's own private field); PATCH allowlist incl. `key_info`, goals merged via `mergeCoachGoalSave`. |
| `/api/clients/[id]/schedule/check` | POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach`; free/busy on the coach's own calendar; reads this client's timezone. |
| `/api/clients/[id]/schedule` | POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach`; writes `appointments` with `coach_id` + this `client_id`; calendar via the coach's own token. |
| `/api/clients/[id]/send-note` | POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach` + Gmail session token; older send path, same transport. |
| `/api/clients/[id]/template-render` | POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients/[id]/transcripts` | GET | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(supabase, params.id)` (404 on no `coach_clients` link); sub-rows additionally filtered on `client_id`. |
| `/api/clients` | GET, POST | Yes | accessibleClientIds | coach | Scoped | GET `.in('id', accessibleClientIds)`; agreements/appointments/engagement-progress keyed to those ids (+ `coach_id` on appointments); POST inserts then `linkCoachToClient`. |
| `/api/clients/timezones` | GET | Yes | accessibleClientIds | coach | Scoped | `clients.timezone` for `accessibleClientIds` only. |
| `/api/coach/reminder-preview` | GET | Yes | none detected (no tenant data read) | coach | Scoped | Renders a sample reminder from the session coach's own settings; nothing stored or sent. |
| `/api/coach` | GET, PATCH | Yes | explicit coach_id filter | coach | Scoped | Reads/updates the session coach's own row (`.eq('id', coach.id)`). |
| `/api/coaches/[id]/billing/checkout` | POST | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `requireSupervisor` (401/403); cross-tenant by design; audit-logged. |
| `/api/coaches/[id]/billing/portal` | POST | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `requireSupervisor` (401/403); cross-tenant by design; audit-logged. |
| `/api/coaches/[id]/clients/[clientId]/portal-invite` | POST | Yes (supervisor) | explicit coach_id filter | coach (supervisor) | Allowlisted exception | `requireSupervisor`; verifies the `coach_clients` link between the URL coach and client before minting; per-client rate limit; audit-logged. |
| `/api/coaches/[id]/clients/[clientId]/portal-unlock` | POST | Yes (supervisor) | explicit coach_id filter | coach (supervisor) | Allowlisted exception | `requireSupervisor`; verifies the `coach_clients` link; clears lockout only (never the password); audit-logged. |
| `/api/coaches/[id]/clients` | GET | Yes (supervisor) | explicit coach_id filter | coach (supervisor) | Allowlisted exception | `requireSupervisor`; roster of the NAMED coach via `coach_clients.coach_id = params.id`; explicit column list, `key_info` not selected. |
| `/api/coaches/[id]` | DELETE, PATCH | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `requireSupervisor` (401/403); cross-tenant by design; audit-logged. |
| `/api/coaches` | GET, POST | Yes (supervisor) | none detected | coach (supervisor) | Allowlisted exception | `requireSupervisor` (401/403); cross-tenant by design; audit-logged. |
| `/api/coaching-hours/[id]` | DELETE, PATCH | Yes | accessibleClientIds | coach | Scoped | Note loaded by id, then `ids.includes(note.client_id)` gate before update/delete. |
| `/api/coaching-hours/export` | GET | Yes | accessibleClientIds | coach | Scoped | Same loader as GET /api/coaching-hours; PDF for the session coach. |
| `/api/coaching-hours/import` | POST | Yes | explicit coach_id filter | coach | Scoped | Inserts `coaching_hours_entries` stamped with `coach_id = coach.id`. |
| `/api/coaching-hours/imports/[id]` | DELETE, PATCH | Yes | explicit coach_id filter | coach | Scoped | Entry loaded/updated/deleted `.eq('id').eq('coach_id')`. |
| `/api/coaching-hours` | GET, POST | Yes | accessibleClientIds | coach | Scoped | GET via `loadCoachingHours` (notes `.in(client_id, accessibleClientIds)` + entries `.eq('coach_id')`); POST rejects a `client_id` outside the coach's roster (404). |
| `/api/cron/billing-reminders` | GET | No (CRON_SECRET Bearer) | none detected | cron | Allowlisted exception | Bearer must equal `CRON_SECRET` (503 if unset); iterates every coach/row by design; wrapped in `cronHandler` (cron_runs log). |
| `/api/cron/billing-retries` | GET | No (CRON_SECRET Bearer) | none detected | cron | Allowlisted exception | Bearer must equal `CRON_SECRET` (503 if unset); iterates every coach/row by design; wrapped in `cronHandler` (cron_runs log). |
| `/api/cron/calendar-sync` | GET | No (CRON_SECRET Bearer) | none detected | cron | Allowlisted exception | Bearer must equal `CRON_SECRET` (503 if unset); iterates every coach/row by design; wrapped in `cronHandler` (cron_runs log). |
| `/api/cron/nudges` | GET | No (CRON_SECRET Bearer) | none detected | cron | Allowlisted exception | Bearer must equal `CRON_SECRET` (503 if unset); iterates every coach/row by design; wrapped in `cronHandler` (cron_runs log). |
| `/api/cron/portal-reminders` | GET | No (CRON_SECRET Bearer) | none detected | cron | Allowlisted exception | Bearer must equal `CRON_SECRET` (503 if unset); iterates every coach/row by design; wrapped in `cronHandler` (cron_runs log). |
| `/api/cron/reminders` | GET | No (CRON_SECRET Bearer) | none detected | cron | Allowlisted exception | Bearer must equal `CRON_SECRET` (503 if unset); iterates every coach/row by design; wrapped in `cronHandler` (cron_runs log). |
| `/api/cron/vault-sync` | GET | No (CRON_SECRET Bearer) | none detected | cron | Allowlisted exception | Bearer must equal `CRON_SECRET` (503 if unset); iterates every coach/row by design; wrapped in `cronHandler` (cron_runs log). |
| `/api/dashboard/accomplished` | GET | Yes | explicit coach_id filter | coach | Scoped | communications / nudges / transcripts / session_reports all `.eq('coach_id', coach.id)`; client names resolved for those ids only. |
| `/api/dashboard/calendar-load` | GET | Yes | none detected (no tenant data read) | coach | Scoped | Google Calendar read with the session coach's own refresh token; no DB rows beyond the coach row. |
| `/api/dashboard/communications` | GET | Yes | explicit coach_id filter | coach | Scoped | `communications.coach_id = coach.id`; names for those client ids only; `key_info` never read. |
| `/api/dashboard/layout` | GET, PUT | Yes | explicit coach_id filter | coach | Scoped | `dashboard_layouts` keyed `(coach_id, surface)`. |
| `/api/dashboard/nudges` | GET | Yes | explicit coach_id filter | coach | Scoped | `nudges.coach_id = coach.id`, status sent. |
| `/api/dashboard/todo` | GET | Yes | explicit coach_id filter | coach | Scoped | nudges/transcripts `.eq('coach_id')`; appointments looked up `.in('client_id', <ids from own nudges>)` without `coach_id` — shared-client caveat only (see observations). |
| `/api/email/send` | POST | Yes | requireClientCoach | coach | Scoped | `requireClientCoach(clientId)` (404); signature resolved for the session coach; sent via the caller's own Gmail token; logged with `coach_id`. |
| `/api/email/signature` | DELETE, GET, PUT | Yes | explicit coach_id filter | coach | Scoped | `email_signatures.coach_id = coach.id` for GET/PUT/DELETE. |
| `/api/generate` | POST | Yes | requireClientCoach | coach | Scoped | Equivalent gate: explicit `clientId` must pass `coachCanAccessClient` (404); an email/name match is accepted only if the coach is linked; notes/actions/goals then filtered on that `client_id`. |
| `/api/growth-areas/[id]/generate-bands` | POST | Yes | explicit coach_id filter | coach | Scoped | `coach_growth_areas` filtered `.eq('coach_id', coach.id)` (generate-bands with `id=new` reads no rows). |
| `/api/growth-areas/[id]` | DELETE, GET, PATCH | Yes | explicit coach_id filter | coach | Scoped | `coach_growth_areas` filtered `.eq('coach_id', coach.id)` (generate-bands with `id=new` reads no rows). |
| `/api/growth-areas` | GET, POST | Yes | explicit coach_id filter | coach | Scoped | `coach_growth_areas` filtered `.eq('coach_id', coach.id)` (generate-bands with `id=new` reads no rows). |
| `/api/library/folders/[id]` | DELETE, PATCH | Yes | explicit coach_id filter | coach | Scoped | `library_folders` / `pdf_resources` filtered `.eq('coach_id', coach.id)`; Storage paths namespaced by `coach.id`. |
| `/api/library/folders` | GET, POST | Yes | explicit coach_id filter | coach | Scoped | `library_folders.coach_id`; per-folder counts `.in('folder_id', <own folder ids>)`. |
| `/api/library/pdfs/[id]` | DELETE, GET | Yes | explicit coach_id filter | coach | Scoped | `library_folders` / `pdf_resources` filtered `.eq('coach_id', coach.id)`; Storage paths namespaced by `coach.id`. |
| `/api/library/pdfs` | GET, POST | Yes | explicit coach_id filter | coach | Scoped | `library_folders` / `pdf_resources` filtered `.eq('coach_id', coach.id)`; Storage paths namespaced by `coach.id`. |
| `/api/notes/client-email` | POST | Yes | none detected (no tenant data read) | coach | Scoped | Drafts from the note HTML posted in the body; reads only the session coach's row for the sign-off name. |
| `/api/nudges/[nudgeId]` | PATCH | Yes | explicit coach_id filter | coach | Scoped | Nudge loaded `.eq('id').eq('coach_id')`; PDF attachment must be one of the coach's own `pdf_resources`; garden write-through filtered on `coach_id`. |
| `/api/nudges` | GET | Yes | explicit coach_id filter | coach | Scoped | Both lists `.eq('coach_id', coach.id)`; enrichment (`loadAppointmentContext`) by those client ids — shared-client caveat only. |
| `/api/nudges/suggested` | GET | Yes | explicit coach_id filter | coach | Scoped | `nudges.coach_id`; appointments by those client ids — shared-client caveat only. |
| `/api/portal/assessments` | GET | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | `loadPortalAssessments(clientId)` — `client_documents` filtered on `client_id`, kind, status; gated by `portal_features.assessments`. |
| `/api/portal/auth/login` | POST | No (credential exchange) | explicit client_id filter | public | Allowlisted exception | Username→`client_credentials` lookup; scrypt verify; generic 401 for every failure; per-client rate limit + 15-min lockout; issues cookie for the resolved `clientId` only. |
| `/api/portal/auth/logout` | POST | No | none detected | public | Allowlisted exception | Clears the portal cookie only; no data access. |
| `/api/portal/auth/password` | GET, POST | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | Own credentials only (`setPortalCredentials(clientId,…)` / `getPortalLoginStatus(clientId)`); hash lives in `client_credentials`, never on `clients`. |
| `/api/portal/auth/request` | POST | No | none detected | public | Allowlisted exception | Magic-link request: always generic `{ok:true}` (anti-enumeration); email→client lookup; 5/hour cap; token is minted for that client only. |
| `/api/portal/auth/verify` | POST | No (single-use token) | none detected | public | Allowlisted exception | POST-only; `consumeLoginToken` matches the sha256 hash, single-use, 24h TTL; cookie issued for the token's `clientId`. |
| `/api/portal/billing` | GET | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | `resolvePortalBillingAccount(clientId)`: coachees→billing_accounts, returns null unless `type=solo` (enterprise coachee sees nothing); invoices filtered by that account id. |
| `/api/portal/billing/setup-session` | POST | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | Same `resolvePortalBillingAccount` gate; 404 (never 403) on miss; card entry on Stripe hosted Checkout. |
| `/api/portal/chat/[id]` | DELETE, GET, PATCH | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | GET ownership check (`conv.client_id !== clientId` → 404); PATCH/DELETE filter `.eq('client_id', clientId)` in the write itself. |
| `/api/portal/chat` | GET, POST | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | GET filters `portal_conversations.client_id`; POST verifies conversation ownership (`conv.client_id === clientId`) before reading messages; context via `buildChatContext(clientId)` — every query keyed on the session clientId; never `key_info`/`notes` table. |
| `/api/portal/chat/upload` | POST | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | Extracts text from the uploaded file and returns it; nothing stored; rate-limited per client. |
| `/api/portal/contact` | POST | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | Reads own `clients` row; `resolveClientCoach(clientId)` reads `coach_clients` filtered on this client to pick the sender (server-side only, coach row never returned); logs inbound row for this client. |
| `/api/portal/documents/[id]/download` | GET | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | Row loaded with `.eq('client_id', clientId)`; 302 to a short-lived signed URL for that row's `storage_path`. |
| `/api/portal/documents/[id]/retry` | POST | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | Row loaded with `.eq('client_id', clientId)`; `retryExtraction` is called with the verified doc id; `confirmName` is never passed. |
| `/api/portal/documents/[id]` | DELETE, PATCH | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | Row loaded with `.eq('id').eq('client_id', clientId)` before PATCH/DELETE; personnel_review visibility cannot be changed. |
| `/api/portal/documents` | GET, POST | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | GET/POST on `client_documents` filtered by / inserted with the session `client_id`; raw `extraction_error` stripped (shaped `reason` only). |
| `/api/portal/events` | POST | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | Allowlisted event types only; writes `portal_events` for the session client. |
| `/api/portal/frameworks/[slug]/pdf` | GET | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | `resolveClientFrameworkPdf(clientId, slug)` authorizes against this client's nudge/mention history + `nudge_eligible` before signing a URL. |
| `/api/portal/frameworks` | GET | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | `loadPortalFrameworks(clientId)`: slugs come only from this client's `nudges` / `client_frameworks`; leaves re-checked `nudge_eligible`. |
| `/api/portal/goals` | DELETE, GET, PATCH, POST | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | Reads/writes `clients.coaching_goals` for the session client only; client may edit/delete only `author='client'` goals; progress on any goal. |
| `/api/portal/notes/[id]` | DELETE, PATCH | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | UPDATE/DELETE carry `.eq('client_id', clientId)` in the statement. |
| `/api/portal/notes` | GET, POST | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | `portal_notes` filtered/inserted on the session `client_id`; never read coach-side. |
| `/api/portal/onboarded` | POST | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | Updates `clients.portal_onboarded` for the session client only. |
| `/api/portal/profile` | GET, PATCH | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | Explicit column list (`id, name, email, phone, timezone, portal_features` + `preferred_name`); `key_info` never selected; PATCH filtered on `id = clientId`. |
| `/api/portal/search` | GET | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | `portal_search(p_client_id := clientId)` SQL function; ILIKE fallback filters `transcripts.client_id`; highlights via sentinels, no markup. |
| `/api/portal/support` | POST | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | Inserts `support_tickets` / `support_ticket_messages` for the session client; best-effort Resend notice. |
| `/api/portal/weekly-plan/extract` | POST | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | Conversation loaded with `.eq('client_id', clientId)` before its messages are read; nothing saved. |
| `/api/portal/weekly-plan` | GET, PATCH, POST | Yes (portal cookie) | explicit client_id filter | client (portal) | Scoped | `loadWeeklyPlans/saveWeeklyPlan/addTask/removeTask/setTaskDone` all filter `weekly_plans.client_id = clientId` (writes included); conversation id re-verified against the client. |
| `/api/practice/competency-focus` | GET, PUT | Yes | explicit coach_id filter | coach | Scoped | Reads/updates `coaches.competency_focus` on the session coach's own row. |
| `/api/practice/revenue` | GET | Yes | accessibleClientIds | coach | Scoped | clients + notes `.in(client_id, accessibleClientIds)`; invoices `.eq('coach_id')`; calendar via own token. |
| `/api/reports/[id]/email` | POST | Yes | explicit coach_id filter | coach | Scoped | `session_reports` (and any transcript read) filtered `.eq('coach_id', coach.id)`; writes carry the same filter. |
| `/api/reports/[id]/growth-assessments` | GET | Yes | explicit coach_id filter | coach | Scoped | `session_reports` (and any transcript read) filtered `.eq('coach_id', coach.id)`; writes carry the same filter. |
| `/api/reports/[id]/rescore` | POST | Yes | explicit coach_id filter | coach | Scoped | `session_reports` (and any transcript read) filtered `.eq('coach_id', coach.id)`; writes carry the same filter. |
| `/api/reports/[id]/resolve-flag` | POST | Yes | explicit coach_id filter | coach | Scoped | `session_reports` (and any transcript read) filtered `.eq('coach_id', coach.id)`; writes carry the same filter. |
| `/api/reports/[id]` | DELETE, GET, PATCH | Yes | explicit coach_id filter | coach | Scoped | `session_reports` (and any transcript read) filtered `.eq('coach_id', coach.id)`; writes carry the same filter. |
| `/api/reports/[id]/suggest` | POST | Yes | explicit coach_id filter | coach | Scoped | `session_reports` (and any transcript read) filtered `.eq('coach_id', coach.id)`; writes carry the same filter. |
| `/api/reports` | GET | Yes | explicit coach_id filter | coach | Scoped | `session_reports` (and any transcript read) filtered `.eq('coach_id', coach.id)`; writes carry the same filter. |
| `/api/reports/summary` | GET | Yes | explicit coach_id filter | coach | Scoped | `session_reports` (and any transcript read) filtered `.eq('coach_id', coach.id)`; writes carry the same filter. |
| `/api/search` | GET | Yes | accessibleClientIds | coach | Scoped | clients `.in('id', ids)`, notes `.in('client_id', ids)`; empty roster → empty result. |
| `/api/send` | POST | Yes | requireClientCoach | coach | Scoped | Sends the prep sheet through the caller's own Gmail token (any recipient); action links / agenda / prep snapshot are attached only when `coachCanAccessClient` passes for the matched client. |
| `/api/sessions` | GET | Yes | none detected (no tenant data read) | coach | Scoped | Google Calendar read with the caller's own OAuth access token — principal-owned resource. (Drift: hardcodes `calendarId: 'primary'` instead of `coachCalendarId`, and uses `JEFF_*` emails to detect the coach.) |
| `/api/tasks/[id]/note` | POST | Yes | explicit coach_id filter | coach | Scoped | `lib/coach-tasks/queue.ts`: every `coach_tasks`/`appointments` query `.eq('coach_id', coach.id)`; notes by the task's own `client_id`; resolve is a conditional update on `state=pending`. |
| `/api/tasks/[id]` | PATCH | Yes | explicit coach_id filter | coach | Scoped | `lib/coach-tasks/queue.ts`: every `coach_tasks`/`appointments` query `.eq('coach_id', coach.id)`; notes by the task's own `client_id`; resolve is a conditional update on `state=pending`. |
| `/api/tasks` | GET | Yes | explicit coach_id filter | coach | Scoped | `lib/coach-tasks/queue.ts`: every `coach_tasks`/`appointments` query `.eq('coach_id', coach.id)`; notes by the task's own `client_id`; resolve is a conditional update on `state=pending`. |
| `/api/templates/[id]` | DELETE, PATCH | Yes | explicit coach_id filter | coach | Scoped | `note_templates.coach_id = coach.id`; `?folderId=standard` returns code-defined firm standards (no tenant data). |
| `/api/templates` | GET, POST | Yes | explicit coach_id filter | coach | Scoped | `note_templates.coach_id = coach.id`; `?folderId=standard` returns code-defined firm standards (no tenant data). |
| `/api/transcripts/[id]` | DELETE, GET, PATCH | Yes | explicit coach_id filter | coach | Scoped | Row loaded `.eq('coach_id')`; assigning a client additionally requires `coachCanAccessClient` (400 on a foreign id); DELETE filtered on `coach_id`. |
| `/api/transcripts/ingest` | POST | No (shared secret) | accessibleClientIds | webhook | Allowlisted exception | `x-ingest-secret` must equal `INGEST_SECRET`. Tenant is chosen by the caller (`body.coachEmail`, else `DEFAULT_COACH_EMAIL`) and `getOrCreateCoach` will create a coach row — see observations. Matching inside `ingestMarkdown` is limited to that coach's `accessibleClientIds`. |
| `/api/transcripts/manual` | POST | Yes | accessibleClientIds | coach | Scoped | `ingestMarkdown` matches only against the session coach's `accessibleClientIds` and stamps `coach_id`. |
| `/api/transcripts` | GET | Yes | explicit coach_id filter | coach | Scoped | `transcripts.coach_id = coach.id`; `raw_md` reduced to a preview. |
| `/api/vault/garden` | GET | Yes | explicit coach_id filter | coach | Scoped | `garden_notes` / `garden_edges` `.eq('coach_id', coach.id)`. |
| `/api/vault/map` | GET | Yes | none detected | coach | Allowlisted exception | `requireCoach` gate; reads the firm-level vault repo Maps/ folder (shared practice IP, not tenant data) — keeps the vault PAT server-side. |
| `/api/vault/maps` | GET | Yes | none detected | coach | Allowlisted exception | `requireCoach` gate; firm-level map registry from the vault repo (shared practice IP, not tenant data). |
| `/api/vault/sync` | POST | Yes | explicit coach_id filter | coach | Scoped | `syncGarden(supabase, coach.id)` re-indexes the session coach's garden only. |
| `/api/workspace/layout` | GET, PUT | Yes | explicit coach_id filter | coach | Scoped | `dashboard_layouts` keyed `(coach_id, surface=client_workspace)`. |
| `/api/zoom-summaries` | GET | Yes (session only) | none detected | coach | UNSCOPED — REVIEW | Any signed-in Google session (a `coaches` row is not required) can query the FIRM-WIDE Zoom account (server-to-server `account_credentials` in `lib/zoom.ts`) for AI Companion summaries matched to an arbitrary `clientName`/`clientEmail` from the query string; no roster or `coach_clients` check. |
| `/api/zoom-test` | GET | Yes (session only) | none detected | coach | UNSCOPED — REVIEW | Diagnostic endpoint: any signed-in session receives the firm-wide Zoom account's recent summaries (topics, hosts, overview text, next steps). Not tenant-scoped; consider deleting or gating on `requireSupervisor`. |
