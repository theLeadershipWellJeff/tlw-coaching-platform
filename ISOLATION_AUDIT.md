# theLeadershipWell — Tenant Isolation Audit

**Phase 0 deliverable · 2026-08-08**
_Reconnaissance only. This document reports **what is**, not what should be. Nothing
in §2–§8 was fixed — every gap is logged for the single deliberate Phase 1 pass._

---

## 1. Executive summary

The platform is moving from a single-coach app (Jeff / theLeadershipWell) to a
multi-tenant product holding other coaching firms' confidential client transcripts,
including EU-based coaches. **Today, tenant isolation is enforced entirely in
application code.** Every table is reached through the Supabase **service-role key**
(`getSupabaseAdmin()`), which bypasses all row-level security; there is no
database-layer backstop and no automated test suite. A missing `WHERE coach_id = …`
returns another tenant's data.

### Scope of review
- **123 API route files** currently in `app/api/**` (was 126; the Coach Accountable
  decommission in §0.3 removed 3). Every route file present at audit time was
  classified — see the full inventory in **§2**.
- **6 Vercel crons** + the background job libraries they call — **§3**.
- The **Plaud → Zapier ingest** pipeline and every name-based client resolver — **§4**.
- Every **singleton** that assumes "the coach is Jeff" — **§5**.
- The **billing_accounts / sponsor** model — **§6**.

### Tally
- Routes reviewed: **all 123** (plus the 3 removed CA routes, noted for completeness).
- **UNSCOPED** (queries cross-tenant data with no coach/client filter): **3**
  — `/api/practice/revenue`, `/api/generate`, `/api/transcripts/ingest`.
- **NEEDS REVIEW** (auth-gated but cross-tenant by design, or a product decision is
  required): **7 route surfaces** — `/api/coaches` (GET/POST), `/api/coaches/[id]`
  (PATCH/DELETE), `/api/vault/map`, `/api/zoom-summaries`, `/api/zoom-test`,
  `/api/billing/webhooks/stripe`, and `/api/clients/import` (already removed).
- Everything else is **SCOPED** in application code (but still has **no DB-level
  policy** — the uniform Phase 1 action is "policy needed").

### Top 5 risks, ranked by severity

| # | Risk | Where | Why it's severe |
|---|---|---|---|
| **1** | **Ingest matches against ALL coaches' clients, then auto-scores under a foreign client** | `lib/transcripts/ingest.ts:167` (roster query has no `coach_id` filter) | A webhook runs as service-role with **no signed-in user**. A global name/calendar match can attach another org's `client_id` to an incoming transcript and write a `session_reports` row against it — a confidential session delivered into a stranger's account. RLS cannot mitigate (service-role). **This is the single highest-severity multi-tenant defect.** |
| **2** | **Any coach can list / create / edit / delete / promote ANY coach** | `/api/coaches`, `/api/coaches/[id]` | Cross-tenant roster + billing-count exposure (GET), and **privilege escalation** — a coach can PATCH themselves or anyone to `role: 'supervisor'`, or delete another coach. No role gate today. |
| **3** | **Every coach sees every coach's revenue** | `/api/practice/revenue` (GET) | Reads `clients` (no coach filter) and `notes` (filtered only by date). Realized + by-client revenue totals are computed over all tenants. |
| **4** | **Any coach can read any client's coaching goals** | `/api/generate` (POST) | Uses `requireSession` (not `requireCoach`); `loadGoals` resolves a client by `id` **or name** with no ownership check. Also `lib/client-lookup.ts#findClientByEmailOrName` runs unscoped queries — safe only because `/api/send` re-checks `coachCanAccessClient`; `/api/generate` does **not**. |
| **5** | **No DB backstop anywhere; no `organizations` table** | Whole codebase (service-role everywhere) | All ~160 SCOPED verdicts rest on hand-written `.eq('coach_id', …)` checks. One forgotten filter leaks. There is no `organizations` entity, so firm-level identity/brand/keys have nowhere to live but hardcode or the `coaches` row (§5). This is the structural reason Phase 1 exists. |

---

## 2. Full route inventory (§0.4)

Legend — **Auth principal:** session coach / cron secret / public token / webhook /
unauthenticated. **Supabase:** service-role (`getSupabaseAdmin()`) unless noted.
**Verdict:** SCOPED / UNSCOPED / N-A / NEEDS REVIEW. **Phase 1 action:** policy
needed / refactor / no change. Every "service-role" route depends on app-code
scoping only — there is no DB policy today, hence "policy needed" is the baseline
Phase 1 action even for SCOPED routes.

### 2a. List / aggregate / top-level routes

| Path | Method | Auth | Scoping | Verdict | Phase 1 |
|---|---|---|---|---|---|
| /api/dashboard/accomplished | GET | session | explicit coach_id | SCOPED | no change |
| /api/dashboard/calendar-load | GET | session | own OAuth token | SCOPED | no change |
| /api/dashboard/communications | GET | session | explicit coach_id | SCOPED | no change |
| /api/dashboard/layout | GET/PUT | session | explicit coach_id | SCOPED | no change |
| /api/dashboard/nudges | GET | session | explicit coach_id | SCOPED | no change |
| /api/dashboard/todo | GET | session | explicit coach_id | SCOPED | no change |
| /api/practice/competency-focus | GET/PUT | session | own coach row | SCOPED | no change |
| **/api/practice/revenue** | GET | session | **NONE (all clients + all notes)** | **UNSCOPED** | refactor |
| /api/business-center/layout | GET/PUT | session | explicit coach_id | SCOPED | no change |
| /api/reports | GET | session | explicit coach_id | SCOPED | no change |
| /api/reports/summary | GET | session | explicit coach_id | SCOPED | no change |
| /api/reports/[id] | GET/DELETE/PATCH | session | explicit coach_id | SCOPED | no change |
| /api/reports/[id]/email | POST | session | explicit coach_id | SCOPED | no change |
| /api/reports/[id]/growth-assessments | GET | session | explicit coach_id | SCOPED | no change |
| /api/reports/[id]/rescore | POST | session | explicit coach_id | SCOPED | no change |
| /api/reports/[id]/resolve-flag | POST | session | explicit coach_id | SCOPED | no change |
| /api/reports/[id]/suggest | POST | session | explicit coach_id | SCOPED | no change |
| /api/search | GET | session | accessibleClientIds | SCOPED | no change |
| /api/sessions | GET | session | own OAuth token (CA removed §0.3) | SCOPED | no change |
| **/api/generate** | POST | session (requireSession only) | **NONE (client by id OR name)** | **UNSCOPED** | refactor |
| /api/send | POST | session | coachCanAccessClient | SCOPED | no change |
| /api/coach | GET/PATCH | session | own coach row | SCOPED | no change |
| **/api/coaches** | GET | session | **NONE (lists ALL coaches + counts)** | **NEEDS REVIEW** | refactor |
| **/api/coaches** | POST | session | **NONE (any coach may create)** | **NEEDS REVIEW** | refactor |
| **/api/coaches/[id]** | PATCH | session | **NONE (edits ANY coach; role escalation)** | **NEEDS REVIEW** | refactor |
| **/api/coaches/[id]** | DELETE | session | **NONE (deletes ANY coach)** | **NEEDS REVIEW** | refactor |
| /api/growth-areas | GET/POST | session | explicit coach_id | SCOPED | no change |
| /api/growth-areas/[id] | GET/PATCH/DELETE | session | explicit coach_id | SCOPED | no change |
| /api/growth-areas/[id]/generate-bands | POST | session | explicit coach_id (id≠'new') | SCOPED | no change |
| /api/nudges | GET | session | explicit coach_id | SCOPED | no change |
| /api/nudges/[nudgeId] | PATCH | session | explicit coach_id | SCOPED | no change |
| /api/nudges/suggested | GET | session | explicit coach_id | SCOPED | no change |
| /api/bookings/sync | POST | session | requireCoach → per-coach | SCOPED | no change |
| /api/bookings/unmatched | GET | session | explicit coach_id | SCOPED | no change |
| /api/bookings/[id] | PATCH | session | coach_id + coachCanAccessClient | SCOPED | no change |
| /api/vault/garden | GET | session | explicit coach_id | SCOPED | no change |
| **/api/vault/map** | GET | session | requireCoach; **firm-global repo** | **NEEDS REVIEW** | no change |
| /api/vault/sync | POST | session | syncGarden(coach.id) | SCOPED | no change |
| /api/transcripts | GET | session | explicit coach_id | SCOPED | no change |
| /api/transcripts/[id] | GET/PATCH/DELETE | session | coach_id + coachCanAccessClient | SCOPED | no change |
| /api/transcripts/manual | POST | session | requireCoach → per-coach | SCOPED | no change |
| /api/templates | GET/POST | session | explicit coach_id | SCOPED | no change |
| /api/templates/[id] | PATCH/DELETE | session | explicit coach_id | SCOPED | no change |
| /api/library/folders | GET/POST | session | explicit coach_id | SCOPED | no change |
| /api/library/folders/[id] | PATCH/DELETE | session | explicit coach_id | SCOPED | no change |
| /api/library/pdfs | GET/POST | session | explicit coach_id | SCOPED | no change |
| /api/library/pdfs/[id] | GET/DELETE | session | explicit coach_id | SCOPED | no change |
| /api/email/send | POST | session | requireClientCoach | SCOPED | no change |
| /api/email/signature | GET | session | own coach row | SCOPED | no change |
| /api/notes/client-email | POST | session (requireSession only) | none (caller body only; no DB) | N-A | no change |
| /api/workspace/layout | GET/PUT | session | explicit coach_id | SCOPED | no change |
| /api/coaching-hours | GET/POST | session | accessibleClientIds | SCOPED | no change |
| /api/coaching-hours/[id] | PATCH/DELETE | session | accessibleClientIds | SCOPED | no change |
| **/api/zoom-summaries** | GET | session (requireSession only) | **firm-wide Zoom account** | **NEEDS REVIEW** | no change |
| **/api/zoom-test** | GET | session (requireSession only) | **firm-wide Zoom; diagnostic** | **NEEDS REVIEW** | no change |

### 2b. `/api/clients/**` and `/api/billing/**`

All service-role. Gates verified: `requireClientCoach` (401/404), `coachCanAccessClient`,
`accessibleClientIds`, `getBillingActor` (canWrite). `charge.ts`/`adjustments.ts`
re-load the invoice `.eq('coach_id')` before any money movement.

| Path | Method | Scoping | Verdict | Phase 1 |
|---|---|---|---|---|
| clients | GET | accessibleClientIds → .in('id') | SCOPED | policy |
| clients | POST | insert + linkCoachToClient | SCOPED | policy |
| ~~clients/import~~ | ~~POST~~ | **removed in §0.3** (global dedupe read) | — | — |
| clients/timezones | GET | accessibleClientIds | SCOPED | policy |
| clients/[id] | GET/PATCH/DELETE | requireClientCoach | SCOPED | policy |
| clients/[id]/actions | GET | requireClientCoach + client_id | SCOPED | policy |
| clients/[id]/actions/[actionId] | PATCH | requireClientCoach + id/client_id | SCOPED | policy |
| clients/[id]/agenda | GET | requireClientCoach + client_id | SCOPED | policy |
| clients/[id]/agreements | GET | requireClientCoach + client_id | SCOPED | policy |
| clients/[id]/appointments | GET | requireClientCoach + client_id/coach_id | SCOPED | policy |
| clients/[id]/appointments/[appointmentId] | DELETE | requireClientCoach + id/client_id | SCOPED | policy |
| clients/[id]/billing | GET/POST | coachCanAccessClient + coach_id | SCOPED | policy |
| clients/[id]/billing/sessions | GET | coachCanAccessClient | SCOPED | policy |
| clients/[id]/communications | GET | requireClientCoach + client_id | SCOPED | policy |
| clients/[id]/goals/generate | POST | requireClientCoach + id/client_id | SCOPED | policy |
| clients/[id]/history | GET | requireClientCoach + client_id | SCOPED | policy |
| clients/[id]/import-file | POST | requireClientCoach; forceClient | SCOPED | policy |
| clients/[id]/notes | GET/POST | requireClientCoach | SCOPED | policy |
| clients/[id]/notes/[noteId] | PATCH/DELETE | requireClientCoach + id/client_id | SCOPED | policy |
| clients/[id]/notes/[noteId]/actions | POST | requireClientCoach + id/client_id | SCOPED | policy |
| clients/[id]/nudges | GET/POST | requireClientCoach + client_id | SCOPED | policy |
| clients/[id]/nudges/context | GET | requireClientCoach + client_id | SCOPED | policy |
| clients/[id]/nudges/draft-one | POST | requireClientCoach | SCOPED | policy |
| clients/[id]/nudges/generate | POST | requireClientCoach + client_id | SCOPED | policy |
| clients/[id]/plan-session | POST | requireClientCoach + id/client_id | SCOPED | policy |
| clients/[id]/prep-sheets | GET | requireClientCoach + client_id | SCOPED | policy |
| clients/[id]/schedule | POST | requireClientCoach | SCOPED | policy |
| clients/[id]/schedule/check | POST | requireClientCoach (read-only) | SCOPED | policy |
| clients/[id]/send-note | POST | requireClientCoach + id | SCOPED | policy |
| clients/[id]/template-render | POST | requireClientCoach + id/client_id | SCOPED | policy |
| clients/[id]/transcripts | GET | requireClientCoach + client_id | SCOPED | policy |
| billing/accounts | GET/POST | eq coach_id; clientId branch gated | SCOPED | policy |
| billing/accounts/[id] | GET/PATCH/DELETE | eq id + eq coach_id (cascades scoped) | SCOPED | policy |
| billing/accounts/[id]/coachees | POST | account eq coach_id + coach_clients check | SCOPED | policy |
| billing/accounts/[id]/engagements | GET/POST | account + coachee eq coach_id | SCOPED | policy |
| billing/accounts/setup-all | POST | coach_clients/coachees eq coach_id | SCOPED | policy |
| billing/accounts/[id]/authorization/send | POST | account eq coach_id + agreement gate + rate limit | SCOPED | policy |
| billing/accounts/[id]/payment-method/reconfirm | POST | account eq coach_id | SCOPED | policy |
| billing/accounts/[id]/payment-method/remove | POST | account eq coach_id | SCOPED | policy |
| billing/engagements/[id] | GET/PATCH | eq id + eq coach_id | SCOPED | policy |
| billing/invoices | GET/POST | eq coach_id; account eq coach_id | SCOPED | policy |
| billing/invoices/[id] | GET/PATCH/DELETE | eq id + eq coach_id | SCOPED | policy |
| billing/invoices/[id]/approve | POST | fetch+update eq coach_id | SCOPED | policy |
| billing/invoices/[id]/send | POST | check eq coach_id; sendInvoice(coach.id) | SCOPED | policy |
| billing/invoices/[id]/adjust | POST | createAdjustment loads invoice eq coach_id | SCOPED | policy |
| billing/invoices/[id]/charge | POST | chargeInvoice loads invoice eq coach_id | SCOPED | policy |
| billing/invoices/[id]/decline-note | GET/POST | loadInvoice eq coach_id | SCOPED | policy |
| billing/invoices/[id]/mark-paid | POST | guarded update eq coach_id | SCOPED | policy |
| billing/invoices/[id]/resend | POST | check eq coach_id; resendInvoice(coach.id) | SCOPED | policy |
| billing/invoices/[id]/retry | POST | invoice eq coach_id | SCOPED | policy |
| billing/invoices/[id]/lines | GET/POST | requireDraftInvoice eq coach_id | SCOPED | policy |
| billing/invoices/[id]/lines/[lineId] | PATCH/DELETE | invoice eq coach_id; line eq invoice_id | SCOPED | policy |
| billing/reminders | GET | join invoices!inner.coach_id = coach.id | SCOPED | policy |
| billing/run/approve-all | POST | update .in(ids).eq(coach_id) | SCOPED | policy |
| billing/run/assemble | POST | assembleRun(coach.id) | SCOPED | policy |
| billing/sessions | GET | engagement eq id + eq coach_id | SCOPED | policy |

**Gate inconsistency (normalize during Phase 1, not an isolation defect):** most
client sub-routes use `requireClientCoach`; `clients/[id]/billing` +
`clients/[id]/billing/sessions` hand-roll `getSessionCoach` + `coachCanAccessClient`.
Same boundary, two idioms — consolidate on `requireClientCoach` for one auditable gate.

### 2c. Public-token routes, webhooks, crons, auth

| Path | Method | Auth | Scoping | Verdict | Phase 1 |
|---|---|---|---|---|---|
| /api/actions/complete | GET | public token | complete_token (one row) | SCOPED (token) | policy |
| /api/agenda/[token] | GET/POST | public token | token (one row) | SCOPED (token) | policy |
| /api/agreements/sign | POST | public token | sign_token + status/expiry guards | SCOPED (token) | policy |
| /api/agreements/issue | POST | session | requireClientCoach | SCOPED | policy |
| /api/agreements/template | GET/PUT | session | requireCoach + eq coach_id | SCOPED | policy |
| /api/billing/authorize/[token]/session | POST | public token | authorization_token (one account) | SCOPED (token) | policy |
| /api/billing/invoices/receipt/[token] | GET | public token | receipt_token (one invoice) | SCOPED (token) | policy |
| **/api/billing/webhooks/stripe** | POST | webhook (Stripe sig) | records via Stripe ids/metadata | **NEEDS REVIEW** | refactor |
| **/api/transcripts/ingest** | POST | webhook (x-ingest-secret) | coach from body; **roster match unscoped** | **UNSCOPED** | refactor |
| /api/cron/reminders | GET | cron secret | iterates coaches; per-appt owning-coach token | SCOPED | no change |
| /api/cron/nudges | GET | cron secret | nudge → coach via coach_id | SCOPED | no change |
| /api/cron/vault-sync | GET | cron secret | per-coach syncGarden(coach.id) | SCOPED | no change |
| /api/cron/calendar-sync | GET | cron secret | per-coach roster via coach_clients | SCOPED | no change |
| /api/cron/billing-reminders | GET | cron secret | sendDueReminders | SCOPED | no change |
| /api/cron/billing-retries | GET | cron secret | runBillingMaintenance | SCOPED | no change |
| /api/auth/[...nextauth] | GET/POST | NextAuth | Google OAuth | N-A | no change |

**Public-token property assessment** (all tokens are v4 `randomUUID` → non-enumerable):

| Token route | Single-purpose | One record | Non-enumerable | Expiring |
|---|---|---|---|---|
| actions/complete (`complete_token`) | ✅ | ✅ | ✅ | ❌ permanent (idempotent) |
| agenda/[token] | ✅ | ✅ | ✅ | ❌ no TTL (readable after submit) |
| agreements/sign (`sign_token`) | ✅ | ✅ | ✅ | ✅ 30-day TTL + self-invalidates at sign |
| billing/authorize/[token]/session | ✅ | ✅ | ✅ | ❌ no expiry (409 once card active) |
| billing/invoices/receipt/[token] | ✅ | ✅ | ✅ | ❌ permanent (stamps received_at once) |

Only the agreement sign-token expires. The other four are permanent bearer
credentials — acceptable under the "token = credential" design, but flagged so Phase 1
can decide whether receipt/agenda/authorize links should gain a TTL. Action-complete
links remain prefetch-vulnerable (a known, documented caveat).

**Webhook authentication + ownership:**
- **transcripts/ingest** — shared secret header `x-ingest-secret` vs `INGEST_SECRET`
  (503 if unset, 401 mismatch). The **caller names the tenant** via `coachEmail`
  (or `DEFAULT_COACH_EMAIL`), and there is **no assertion that a matched client
  belongs to that coach**. A **single shared secret governs all coaches** — the
  root of both the ingest defect (§4) and the Phase 1 per-org endpoint design.
- **billing/webhooks/stripe** — authenticated by Stripe signature
  (`STRIPE_WEBHOOK_SECRET`, 400 on failure). Records resolved from Stripe metadata
  (`tlw_invoice_id`/`tlw_billing_account_id`/`coach_id`) or stored Stripe ids. It
  **trusts the Stripe-id → row mapping** and does not independently re-verify coach
  ownership before writing. Safe in practice (those ids were minted by our own
  send/charge paths) — a mapping-integrity trust, not an ownership check. Writes are
  guarded/idempotent. Flagged NEEDS REVIEW so a Stripe-Connect (per-tenant) rollout
  re-examines the assumption.

---

## 3. Cron & background job inventory (§0.5)

**Highest blast radius:** crons run as **service-role** (RLS will not protect them in
Phase 1), they **loop across coaches**, and they **send/charge on a client's behalf**.
A scoping error here is a wrong email or charge to a real person, not just a read leak.
All 6 are gated by `Authorization: Bearer <CRON_SECRET>` (route refuses without it).

| Cron (hourly) | Enumerates work | Pre-send/charge assertion | Failure mode if wrong | Idempotent? |
|---|---|---|---|---|
| /api/cron/reminders | All `scheduled` appointments in a 14-day window | Sends via each appointment's **owning coach** token; reconciles against that coach's calendar | Reminder to wrong client if an appointment row's coach/client were mis-linked upstream | ✅ claims `(appointment_id, kind)` in `appointment_reminders` (unique) before send |
| /api/cron/nudges | `status='scheduled'` nudges past `scheduled_for` | `sendNudge` sends via the **nudge's `coach_id`** Gmail; enforces spacing rule | Nudge to wrong client only if nudge.coach_id/client_id mis-set at creation (creation is scoped) | ✅ spacing-blocked stays scheduled + retries; only coach moves to scheduled |
| /api/cron/vault-sync | Every coach with `vault_folder_path` set | `syncGarden(coach.id)` — per-coach; **but the vault repo/token is a single global env** (§5) | Cross-tenant: one shared PAT/repo means all coaches index Jeff's garden | ✅ upsert + prune by (coach_id, id) |
| /api/cron/calendar-sync | Every coach with a refresh token | Roster loaded **scoped via `coach_clients`** (the correct pattern); matches events per-coach | Unmatched booking → review queue (nothing silently attached) | ✅ upsert by `(coach_id, google_event_id)` |
| /api/cron/billing-reminders | Due `invoice_reminders` | `sendDueReminders` operates per-invoice (invoice carries coach_id) | Reminder to wrong payer only if invoice mis-owned (creation is scoped) | ✅ reminder rows status-guarded |
| /api/cron/billing-retries | Due charge retries / dormancy / stale cards | `runBillingMaintenance`; charge path re-loads invoice `.eq('coach_id')` + idempotency claim | Wrong charge — but charge path has the strongest guards in the codebase | ✅ `invoice_charge_attempts` unique claim + Stripe idempotency key |

**Cron findings:**
- **calendar-sync is the reference implementation** — it scopes its roster via
  `coach_clients` before matching. **Ingest (§4) should copy it.**
- **vault-sync is per-coach in code but not in data:** the vault repo + PAT are a
  single global env (`VAULT_REPO`/`VAULT_GITHUB_TOKEN`), so every coach's "garden"
  is actually Jeff's. Correct today (one firm); a Phase 1 cross-tenant leak. See §5
  and the decision record ("vault access is per-tenant").
- Cron secret: `CRON_SECRET` is a required Bearer token, not guessable (set to an
  `openssl rand -hex 32` value). Present and enforced.
- No job sends/charges without an owning-coach association on the record it acts on;
  the residual risk is entirely **upstream mis-linking** (which §4 can cause).

---

## 4. Ingest path analysis + proposed per-org contract (§0.6)

**This is the single highest-severity multi-tenant risk in the system.**

### Current endpoint
`POST /api/transcripts/ingest`. Auth: header `x-ingest-secret` must equal
`INGEST_SECRET` (503 if unset, 401 on mismatch). **No signed-in user.** Payload:
`{ markdown|content|transcript (one required), filename?, title?|summary?,
driveFileId?, source?, coachEmail?, coachName? }`. Coach = `coachEmail ??
DEFAULT_COACH_EMAIL` (400 if neither), get-or-created. Calls
`ingestMarkdown(..., { assumeSessionToday: true })`; a non-matched result emails the
coach a needs-review notice.

### 🔴 The defect
`lib/transcripts/ingest.ts:167`:
```
const { data: roster } = await supabase.from('clients').select('id, name, email')
```
selects **all clients across all coaches** — no `coach_id` / `coach_clients` filter.
The transcript is stamped with the ingesting `coach.id`, but the **match step can
attach another coach's `client_id`** (and their initials), then **auto-score** it
(`runAndStoreReport` writes `session_reports`) against that foreign client. The
calendar-match fallback (`lib/calendar.ts#findClientFromCalendar`) inherits the same
unscoped roster. Contrast `lib/booking-sync.ts#loadRoster`, which scopes the identical
match set through `coach_clients`.

### Exact matching algorithm (in order)
0. **Dedupe** — SHA-256 of `canonicalizeForHash(markdown)` on `transcripts.content_hash`;
   hit → adopt existing row, return `duplicate`.
1. **Resolve instant** — explicit `Z`/offset timestamp, else `zonedWallClockToUtc`
   in the coach's timezone; date from parse, else (webhook only) today in coach zone.
2. **forceClient?** — trust it (per-client import only; never the webhook).
3. **Load roster** — `clients.select(id,name,email)` — **ALL COACHES (the bug).**
4. **Name match** (`match.ts`) — `clientNameRaw` from front-matter
   `client|clientname|name|coachee|participant`, else filename. Scoring: exact
   normalized = 1.0; initials-only 0.9/0.6; first+last both hit → `max(overlap, 0.9)`;
   else Jaccard. **Confident iff best ≥ 0.85 AND top-two gap ≥ 0.15**, else `needs_review`.
5. **Calendar match** (only if not matched + valid instant) — events ±3h, padded
   bracket; (a) guest email exact → conf 1; (b) guest displayName via `matchClient`;
   (c) event title via `matchClient`; found event, no roster tie → `needs_review`.
6. **Title/initials** — `buildTranscriptTitle`; weak unmatched title → Claude Haiku
   `proposeTranscriptTitle`.
7. **Insert** transcript (`coach_id`, `client_id`=match|null, `match_status`, …).
8. **Auto-score** — only if `autoScore !== false` AND `matched` AND `clientId`.

### Ambiguous / failed matches
Never guessed. `needs_review` when: name present but no hit, best < 0.85, ambiguous
(gap < 0.15), or any calendar failure. `unmatched` only when there was no name signal.
Non-matched → skips scoring, `client_id` null, sits in the Practice review queue;
webhook emails the coach. Nothing is silently dropped. **The failure is not "drops a
transcript" — it is "attaches it to the wrong tenant."**

### All name-based client-resolution sites
| Site | Scope safety |
|---|---|
| `lib/transcripts/match.ts` | pure fn; safe/unsafe per caller's roster |
| `lib/transcripts/ingest.ts:167-184` | 🔴 **UNSCOPED** (all clients) |
| `lib/calendar.ts` `findClientFromCalendar` / `listClientMatchedEvents` / `matchEventToClient` | safe only if the passed-in roster is scoped |
| `lib/booking-sync.ts#loadRoster` | ✅ SCOPED via coach_clients (the pattern to copy) |
| `lib/matchZoomToClient.ts` | time-window match, not name |
| `lib/client-lookup.ts#findClientByEmailOrName` | ⚠️ unscoped query; safe only if caller re-checks (`/api/send` does; `/api/generate` does **not**) |
| `app/api/generate/route.ts` | ⚠️ resolves goals by id **or name**, no ownership check (UNSCOPED, §1 #4) |
| `app/api/sessions/route.ts` | calendar guest/title extraction; CA roster removed in §0.3 |

### Proposed Phase 1 contract — per-organization ingest endpoint
Built later; recorded here so Phase 1 executes against it:

- **Per-organization endpoint + secret.** E.g. `POST /api/ingest/[orgToken]` or a
  per-org value of `x-ingest-secret`, each mapping to exactly one `org_id`.
- **Resolve the org from the endpoint/secret BEFORE any matching logic runs.** The
  request never names its own tenant via a body field (`coachEmail` stops being
  authoritative).
- **Name/calendar matching is scoped inside that org by construction** — the roster
  query is `... where org_id = <resolved> ` (and, within it, `coach_clients`), never
  a global `select` from `clients`. A no-match inside the org → `needs_review`, never
  a spill to another org.
- **Rotate/scope secrets per org** so revoking one tenant's Zapier connection cannot
  read/write another's.
- Interim hardening (if any ingest change is pulled into Phase 1's first pass): scope
  `lib/transcripts/ingest.ts:167` to `coach_clients` exactly as `booking-sync.loadRoster`
  already does.

---

## 5. Singleton inventory + Phase 1 destinations (§0.7)

Every resource that assumes "the coach is Jeff / the org is theLeadershipWell."
There is **no `organizations` table today** — firm-level identity has nowhere to live
but the `coaches` row or a hardcode.

### Env-var singletons
| Singleton | Read sites (representative) | Type | Phase 1 destination |
|---|---|---|---|
| **JEFF_FROM_EMAIL** | `lib/gmail.ts:80` (From on **all** unattended mail), scorecard/transcript-review/appointment emails, send, email/send, send-note, agreements/issue, sessions | logic | `coaches` (per-coach send-from); org fallback → `organizations`. **Highest-risk singleton** — every unattended email currently sends *as Jeff* regardless of owning coach. |
| **JEFF_CC_EMAIL** | appointments, calendar, send, email/send, send-note, agreements/issue+sign, sessions | logic | `coaches` (per-coach Cc) / `organizations` |
| **DEFAULT_COACH_EMAIL** | `transcripts/ingest` (webhook fallback coach) | logic | per-tenant config keyed by the ingest secret (§4) |
| **DEFAULT_COACH_NAME** | `gmail.ts:29` (falls back to hardcoded `'Jeff Holmes'`), ingest, email/send | logic | `coaches.name`; delete the `'Jeff Holmes'` fallback |
| **VAULT_REPO / VAULT_GITHUB_TOKEN / VAULT_BRANCH** | `lib/vault/client.ts`, `lib/vault/sync.ts` | logic (credential) | per-tenant vault identity on `coaches`/`organizations`, encrypted. Single app-PAT breaks isolation (§3 vault-sync). Decision record: external coaches get **vault-lite**, never their own repo. |
| **DEFAULT_MEETING_LINK** | `lib/scheduling.ts:127` (hardcoded Zoom URL) | logic | `coaches` (per-coach room); drop the firm-specific fallback |
| **COACH_ZOOM_LINK** | `lib/scheduling.ts:140` | logic | `coaches.reminder_settings.meetingLink` (retire env tier) |
| **ANTHROPIC_API_KEY** | **10 sites** each `new Anthropic({apiKey: process.env…})` — engine, suggest, title, growth score/bands, nudges llm, generate, notes/client-email, plan-session, goals/generate | logic (credential) | **Per-tenant BYO key.** No central factory today — needs one `getAnthropic(tenant)` resolver before the 10 sites can be per-tenant (decision record: every tenant brings their own key; encrypted at rest, never logged, masked in UI, graceful failure). |
| **STRIPE_SECRET_KEY** | `lib/billing/stripe.ts:15` (single `getStripe()` factory) | logic (credential) | per-tenant via **Stripe Connect Standard** (decision record). Cleanest — one read site. |
| **STRIPE_WEBHOOK_SECRET** | `billing/webhooks/stripe:54` | logic (credential) | per-tenant/per-Connect-endpoint secret |

### Hardcoded brand / identity (logic-bearing)
- **Signature default** (Jeff Holmes, `jeff@jeffkholmes.com`, `theleadershipwell.com`,
  `meetings-na2.hubspot.com/dr-jeff`) — `lib/signature.ts:16-39`. Already per-coach in
  `email_signatures`; make the **code fallback generic**, logo → `organizations`.
- **Prep-email sign-off** "Jeff Holmes / Executive Coach · theLeadershipWell" —
  `lib/email-template.ts:165-166` → `coaches` + `organizations`.
- **From display `'Jeff Holmes'` hardcoded in raw MIME** — `send`, `send-note`,
  `agreements/issue` → `coaches.name`.
- **Billing sign-off `'Dr. Jeff Holmes'` fallback + firm line** — `billing/send.ts`,
  `receipt.ts`, `reminders.ts`, `decline-note` → `coaches.name` + `organizations`.
- **Coaching-session detection regex hardcodes `jeff`** — `app/api/sessions/route.ts`
  (`/dr\.?\s*jeff/`) → derive coach-name tokens from the `coaches` row per request.
- **AI-prompt identity "You are Jeff Holmes…"** — `notes/client-email`, `generate`,
  `plan-session`, `goals/generate`, `growth-areas/score` → interpolate `coaches.name`
  + `organizations`.
- **Authorization mandate "I authorize theLeadershipWell to…"** —
  `lib/billing/payment-methods.ts:21`, **stored verbatim as a legal record** →
  `organizations` (per-tenant legal entity). Legally binding string; handle with care.
- **Default Cc `jeff@theleadershipwell.com`** hardcoded client-side — `EmailModal.tsx:33`
  → fetch from coach/org config.

### Cosmetic brand strings (lower priority)
Email-template/footer chrome, UI titles/subjects, page metadata across `app/layout.tsx`,
`Sidebar`, dashboard/practice/business-center pages, agreement/scorecard/appointment/
client-note email templates, public agenda/session pages — all "theLeadershipWell" /
"Confidential" branding → centralize a brand block on `organizations`. The scoring
engine's brand + named IP principles (`lib/scoring/engine.ts`, `rubric.ts`) are
platform IP, not a tenant singleton — revisit only if tenants get their own rubric.

**No `jeff|holmes|leadershipwell` hit in `app/`/`lib/`/`components/` is unaccounted
for.** (Remaining matches live only in `.env.example`, `README.md`, `CLAUDE.md`, and
`spec/*` filenames.)

### Structural notes
- **JEFF_FROM_EMAIL at `lib/gmail.ts:80` is the top singleton to fix** — all unattended
  email sends as Jeff regardless of owning coach.
- **Anthropic has no central factory** (10 constructions) — build `getAnthropic(tenant)`
  first.
- **Stripe is already centralized** — the cleanest per-tenant conversion.
- `coaches` is keyed by Google email with get-or-create (`lib/coach.ts`); there is **no
  `organizations` table** — the missing home for firm identity/brand/keys.

---

## 6. Sponsor recommendation (§0.8)

### Current `billing_accounts` (migrations 028 + 030/032/040 — post-renumber)
`id`, `coach_id` NOT NULL → coaches (tenant owner), `name`, `type CHECK
IN('solo','enterprise')`, `billing_email`, `stripe_customer_id`, `status`(active|closed)
+ `closed_at`, `billing_cc`, and the Payment-on-File mandate columns
(`stripe_payment_method_id`, `payment_method_status`, `authorization_token`,
`authorized_at`, `authorization_text`, `charge_mode`, …).

**Relationships:** `coaches 1:N billing_accounts`; `billing_accounts` ← `coachees`,
`engagements`, `invoices` (all `billing_account_id`). `clients 1:N coachees N:1
billing_accounts`, `coachees UNIQUE(coach_id, client_id)`. `coachees 1:N engagements
1:N billable_sessions N:1 invoices`.

### Can a payer already span multiple clients today? — **YES**
1. `coachees` has **no unique on `billing_account_id`** (only `UNIQUE(coach_id,
   client_id)`) → many coachees, one payer.
2. `type IN ('solo','enterprise')` explicitly distinguishes single- vs multi-client.
3. The run engine groups multiple coachees under one enterprise account and emits
   per-client lines (`lib/billing/run.ts`); the accounts API returns `coacheeCount`.

### Recommendation (default): **PROMOTE `billing_accounts`, do NOT create a new `sponsors` table**
The sponsor relationship — one payer, many coached individuals — **already exists and
is load-bearing** as `billing_account(enterprise) → coachees → clients`, wired through
invoices, the run engine, the Stripe customer, and the Payment-on-File mandate. A
parallel `sponsors` table would duplicate this graph, force a migration of live billing
data + a second grouping path, and fragment the invariant "a client bills to exactly
one payer." Payment/authorization is already account-scoped, so a sponsor paying for a
cohort maps 1:1 with zero new plumbing.

The real gap is **semantic/reporting, not structural**: enterprise accounts lack a
distinct **sponsor contact/role** (e.g. an HR sponsor who is neither the payer-email
nor a coached client) and a **sponsor-facing aggregate view**. Both are additive on the
promoted entity — a nullable `sponsor_contact_*` / role, and a read-only aggregate —
**not** a reason to fork the model. *Caveat:* if a payer must exist who is explicitly
**not** billing (ROI reports only, a third party pays), or a client sponsored by two
parties, promotion needs an added nullable sponsor role. Default to promotion; revisit
only if that requirement appears. (**Resolved 2026-08-09 — promote; see §8 #1.**)

### Sponsor aggregate reporting — read-from vs. the hard wall
**Read (aggregate only):** `billing_accounts → coachees → engagements →
billable_sessions/invoices/invoice_lines/invoice_adjustments` — session **counts** and
**hours**, engagement progress, invoice/payment totals, engagement-status counts. Every
query filtered by `coach_id`/`org_id` and scoped to the one `billing_account_id`.

**MUST NEVER cross to a sponsor (hard wall):** session content
(`transcripts.raw_md`, `session_reports.report`, all scorecard detail/evidence/gates/
growth assessments); `notes.content`, `actions`, `nudges`, `communications` bodies;
coach-private fields (`clients.key_info`, `coaching_goals`, `bio`, `agreements`
content, `agenda_requests`); and **any qualitative attribution to a named individual**.
The risk is entirely **any join that reaches `notes` / `transcripts` / `session_reports`
via `coachees.client_id`** — a sponsor surface must never traverse it.

---

## 7. Proposed Phase 1 table groupings — strangler RLS rollout

Schema migration is **big-bang** (add `org_id` everywhere, backfill to org #1);
enforcement is **strangler** (enable RLS one group at a time, verify on staging, then
production). Suggested order — lowest blast radius / highest value first, billing last:

1. **clients + notes + actions** — the core tenant boundary; `clients.org_id` is the
   anchor (client→coach is 1:1, so `org_id` lives directly on `clients`). Prove the
   JWT-claim → policy path here first.
2. **transcripts + session_reports** — confidential session content; also fix the
   ingest roster scoping (§4) as this group lands.
3. **appointments + communications + agreements + agenda_requests + prep_sheets** —
   scheduling + client-facing comms.
4. **nudges + garden_notes + garden_edges** — nudging + vault index (also move the
   vault repo/token per-tenant, §5).
5. **billing_accounts + coachees + engagements + billable_sessions + invoices +
   invoice_lines + invoice_reminders + invoice_adjustments + invoice_charge_attempts +
   billing_authorization_events** — **last**, and behind its own verification, because
   a policy error here is a payment error.

Cross-cutting prerequisite for **every** group: the route must move **off the
service-role key** (or set a request-scoped role) for RLS to engage — a policy on a
table still read via `getSupabaseAdmin()` does nothing. Pair each group's policy with
the switch to a JWT-scoped client on the routes that touch it.

---

## 8. Decisions — RESOLVED (2026-08-09)

All Phase-1-blocking questions were decided by Jeff on 2026-08-09. Recorded here as
the binding inputs to the Phase 1 build brief (`docs/PHASE_1_BUILD_BRIEF.md`).

| # | Question | **Decision** |
|---|---|---|
| 1 | Sponsor: promote `billing_accounts` vs. new `sponsors` table | ✅ **Promote `billing_accounts`** (enterprise accounts become sponsors; add a nullable sponsor contact/role + a read-only aggregate view behind the §6 hard wall). No parallel table. |
| 2 | `/api/coaches[/[id]]`: role-gate coach admin | ✅ **Supervisor-only** for list / create / edit / delete / role-change. A coach may edit only their own non-role fields. |
| 3 | Anthropic key: per-tenant BYO | ✅ **Per-tenant BYO from day one.** Build a single `getAnthropic(tenant)` resolver; route all 10 call sites through it. Keys encrypted at rest, never logged, masked in UI, graceful failure. No platform-key fallback. |
| 4 | Zoom: firm-global vs. per-coach; keep `/api/zoom-test`? | ✅ **Per-coach** — every coach (including TLW's own) connects their own Zoom account. **Delete `/api/zoom-test`** (leftover diagnostic). |
| 5 | Vault: tenant access to Jeff's garden? | ✅ **Firm-only.** Jeff/TLW keeps the real vault; **external tenants never touch it** — they get **vault-lite** (in-app native framework store behind the same provider interface). |
| 6 | Permanent bearer tokens (`receipt`/`agenda`/`authorize`) | ✅ **Add a TTL** to receipt/authorize (and agenda) links before external launch. |
| 7 | GDPR Art. 9 — transcripts as special-category | ✅ **Assume yes (special-category).** Low urgency / not blocking near-term work — **wire in late, but the architecture must account for it as we build** (data classification, DPA-ready boundaries). |
| 8 | EU data residency | ✅ **Keep it possible** — the tenant→database connection stays a **lookup, not a constant**, so residency routing can be added later without re-architecture. Wire in late. |
| 9 | Google OAuth scope classification (sensitive vs. restricted) | ⏳ **External process** — 4–12 week verification tail; run before external launch. Not a code decision; tracked, not blocking Phase 1 build.

---

## Appendix A — Coach Accountable decommission record (§0.3)

CA has been shut down apart from Jeff's out-of-app maintenance connection. Removed:
- **Routes deleted:** `app/api/notes/route.ts` (CA notes proxy),
  `app/api/clients/import/route.ts` (CA client import),
  `app/api/clients/[id]/import-notes/route.ts` (CA notes import).
- **`/api/sessions`** — CA client-roster matching stripped; the Google Calendar read +
  title/guest-email name extraction is retained (the dashboard "Up next" cards need it).
- **Prep flow (`app/session/*`)** — the `/api/notes` (CA) fetch removed; the generator
  now runs off `clients.coaching_goals` (server-side in `/api/generate`) and Zoom
  summaries. The flow and its dashboard links are **kept** (pillar #1).
- **Env vars** `COACH_ACCOUNTABLE_*` removed from `.env.example` and `README.md`.
- **Verified:** zero outbound `coachaccountable.com` calls remain; typecheck + `next
  build` pass.

**Retained CA-imported data + provenance (this is coaching history, not cruft):**
| Table.column | Migration | Purpose |
|---|---|---|
| `clients.ca_client_id` | 001 | Links a client to its Coach Accountable record |
| `notes.ca_session_id` | 005 | CA session id; partial unique index `(client_id, ca_session_id)` dedupes imports |

All imported `notes`/`actions`/`clients` rows remain intact and render normally in the
client workspace. The billing "owner: Coach Accountable" label (`engagements.billing_owner
= 'CA'`) and the "signed on CA" help text in EditClientModal/AgreementsCard are also
retained (data provenance / informational, not live integration).

## Appendix B — Migration renumber map (§0.2)

Duplicates `026`/`034` resolved by full shift to a strict `001`–`041`. Production was
already at this schema state → filename/ledger correction only, no data change. Full
old→new table and the down-script convention are in **`docs/MIGRATION_PROCEDURE.md`**.
Kept: `026_coach_growth_areas`; `026_dashboard_layouts` → `027`, and everything after
shifts +1 (…`038_payment_on_file` → `040`, `039_prep_sheet_pipeline` → `041`).

## Appendix C — Staging (§0.1)

Artifacts: `supabase/staging/000_full_baseline.sql` (schema, no data),
`supabase/staging/001_synthetic_seed.sql` (fictional 2-org seed). Runbook +
free-tier wake-up procedure + env-diff validation in **`docs/STAGING_SETUP.md`**.
Console steps (project creation, Vercel Preview env, OAuth redirect) are Jeff's to run;
**no production data in staging, ever.**
