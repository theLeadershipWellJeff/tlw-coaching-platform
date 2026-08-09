# theLeadershipWell Platform — Phase 1 Build Brief
## Multi-Tenant Enforcement: `org_id` big-bang + strangler RLS
**Version:** 1.0
**Date:** 2026-08-09
**Owner:** Jeff Holmes
**Executor:** Claude Code
**Inputs:** `ISOLATION_AUDIT.md` (the checklist this brief executes against) + the resolved decisions in its §8.
**Status:** Ready to plan. Present a file plan and receive confirmation before writing code.

---

## 1. Objective

Move tenant isolation from **application-code only** to **database-enforced**, and
turn the single-coach app into a true multi-tenant product that can safely hold other
coaching firms' confidential client data — including EU-based coaches.

Two structural moves, executed in one deliberate arc:

1. **Big-bang schema** — introduce `organizations`, add `org_id` to every tenant table,
   backfill everything to **org #1 (theLeadershipWell)**. One pass, reversible, no
   behavior change.
2. **Strangler enforcement** — turn on Postgres **Row Level Security** one table-group
   at a time (clients/notes first, billing last), each behind a JWT-scoped Supabase
   client, verified on staging before production. The service-role key is demoted to
   crons and webhooks only.

Alongside enforcement, Phase 1 fixes the confirmed cross-tenant **defects** the audit
found (these are real today and RLS alone will not cover the service-role paths), and
executes the settled product decisions (sponsors, BYO keys, per-coach Zoom, vault-lite,
token TTLs, GDPR/EU architecture hooks).

---

## 2. Strategic framing (recap from the audit)

- **Today there is no DB backstop.** Every table is read via the service-role key
  (`getSupabaseAdmin()`), which bypasses RLS. ~160 routes are "SCOPED" only by
  hand-written `.eq('coach_id', …)` checks. One forgotten filter leaks another tenant's
  data. There is no automated test suite to catch it.
- **RLS is deny-by-default.** Enabling it on a table locks that table until a policy
  exists. This is why enforcement is **strangler** — one group, staging-verified, then
  production — never a single flip against the live practice.
- **A policy on a service-role-read table does nothing.** RLS only engages once the
  route reads through a **JWT-scoped** client whose claims carry `org_id`/`coach_id`.
  So every RLS group ships **with** the route-level switch off the service-role key.
- **The scoping chain is `org_id → coach_id → client_id`.** Because client→coach is
  1:1 (decision record), `org_id` lives **directly on `clients`**, which simplifies
  every downstream policy.

---

## 3. Target architecture

```
organizations            ← NEW tenant root. TLW is org #1. Each external firm = its own org.
  └── coaches            ← seat within an org (coaches.org_id)
        └── clients      ← clients.org_id (direct — safe, client→coach is 1:1)
              └── notes, transcripts, session_reports, appointments, nudges,
                  agreements, communications, garden_notes, prep_sheets, …
sponsors  = billing_accounts (type='enterprise')  ← promoted, not a new table (§6, decision #1)
```

- **Enforcement:** Postgres RLS driven by a **Supabase JWT minted from the NextAuth
  session**, carrying `org_id` and `coach_id` claims. Policies key on
  `current_setting('request.jwt.claims')` → `org_id` (and `coach_id`, or `client_id`
  via `coach_clients` for client-owned tables).
- **Service-role** demoted to crons + webhooks, which then carry **explicit** org/coach
  assertions in code (RLS can't help them).
- **Per-tenant secrets:** each org supplies its own Anthropic key and (external tenants)
  Stripe Connect account. Firm identity/brand/legal move onto `organizations`/`coaches`.

---

## 4. Decisions baked in (from `ISOLATION_AUDIT.md` §8 — resolved 2026-08-09)

| # | Decision | Where it lands in this brief |
|---|---|---|
| 1 | **Promote `billing_accounts`** as the sponsor entity (no new table) | §5.6 |
| 2 | Coach admin (`/api/coaches`) is **supervisor-only** | §5.2 |
| 3 | **Per-tenant BYO Anthropic key** from day one; one `getAnthropic(tenant)` resolver | §5.4 |
| 4 | **Per-coach Zoom** (incl. TLW's own coaches); **delete `/api/zoom-test`** | §5.9 |
| 5 | Vault is **firm-only**; external tenants get **vault-lite** behind the provider interface | §5.10 |
| 6 | **Add TTL** to `receipt`/`authorize`/`agenda` bearer tokens | §5.7 |
| 7 | Treat transcripts as **GDPR special-category**; architect for it, **wire in late** | §5.12 |
| 8 | **Keep EU residency possible** — tenant→DB connection is a **lookup, not a constant** | §5.13 |
| 9 | Google OAuth scope classification — external verification, tracked, not blocking build | §8 |

---

## 5. Phased build

Each sub-phase ships **paired up/down migrations** (convention in
`docs/MIGRATION_PROCEDURE.md`), is **staging-verified first**, and is reversible.

### 5.0 — `organizations` + `org_id` big-bang (schema only, no enforcement)
- Create `organizations` (id, name, brand fields, legal-entity name, created_at; RLS
  enabled, no policy yet).
- Add nullable `org_id uuid references organizations(id)` to **every tenant table**
  (clients, notes, actions, transcripts, session_reports, appointments,
  appointment_reminders, agreements, agreement_templates, agenda_requests, prep_sheets,
  communications, nudges, garden_notes, garden_edges, coach_growth_areas, note_templates,
  library_folders, pdf_resources, dashboard_layouts, billing_accounts, coachees,
  engagements, billable_sessions, invoices, invoice_lines, invoice_reminders,
  invoice_adjustments, invoice_charge_attempts, billing_authorization_events, and
  `coaches`).
- **Backfill** all existing rows to **org #1 (theLeadershipWell)**; then set `org_id`
  `NOT NULL` where every row is populated.
- **No app behavior change yet.** Down-script drops the columns + table.
- **Validation:** every tenant row has `org_id = org#1`; app runs unchanged on staging.

### 5.1 — JWT minting + service-role demotion substrate
- Mint a **Supabase JWT** from the NextAuth session carrying `org_id` + `coach_id`
  (+ `role`) claims; sign with the Supabase JWT secret (captured in `STAGING_SETUP.md`).
- Introduce a **request-scoped Supabase client** (`getSupabaseForRequest()`) that sends
  the JWT, so RLS policies can read the claims. Keep `getSupabaseAdmin()` for
  crons/webhooks only.
- This sub-phase adds the substrate but **flips no table to RLS yet**.
- **Validation:** a signed-in request carries correct claims; admin client still works
  for crons.

### 5.2 — Pre-RLS correctness fixes (the confirmed defects)
Fix these **before** the matching RLS group, since several run as service-role where RLS
won't protect them:
1. **Ingest roster scoping** (`lib/transcripts/ingest.ts:167`) — scope the client match
   roster to the org (mirror `booking-sync.loadRoster`). **Highest priority.**
2. **`/api/coaches[/[id]]`** — gate list/create/edit/delete/role-change to
   `role='supervisor'` and the caller's org; a coach edits only their own non-role
   fields (decision #2).
3. **`/api/practice/revenue`** — scope `clients` + `notes` reads through
   `accessibleClientIds`/org.
4. **`/api/generate`** — resolve the client through `coachCanAccessClient` before reading
   goals; stop resolving by bare name.
5. **`lib/client-lookup.ts`** — make callers re-check ownership, or scope the query.
- **Validation:** targeted repro on staging (two orgs) shows no cross-org read/write.

### 5.3 — Strangler RLS rollout (group by group, staging → prod)
Order (lowest blast radius / highest value first; billing last), each group = enable
RLS + policies + switch its routes to the JWT-scoped client:
1. **clients + notes + actions** — prove the JWT→policy path here.
2. **transcripts + session_reports** — confidential content.
3. **appointments + communications + agreements + agenda_requests + prep_sheets**.
4. **nudges + garden_notes + garden_edges**.
5. **billing_*** (accounts, coachees, engagements, billable_sessions, invoices,
   invoice_lines, invoice_reminders, invoice_adjustments, invoice_charge_attempts,
   billing_authorization_events) — **last**, behind its own verification; a policy error
   here is a payment error.
- **Validation per group:** on staging with Org A + Org B, a coach in Org A cannot read
  or write any Org B row through any route in the group; crons still function via the
  admin client with their explicit assertions.

### 5.4 — Per-tenant Anthropic BYO key
- Add encrypted per-tenant key storage (on `organizations` or `coaches`).
- Build one `getAnthropic(tenant)` resolver; route the **10** current
  `new Anthropic(...)` sites through it (engine, suggest, title, growth score/bands,
  nudges llm, generate, notes/client-email, plan-session, goals/generate).
- Encrypted at rest, never logged/traced, masked in UI after entry, graceful
  tenant-facing failure on invalid/rate-limited key (decision #3).
- **Validation:** invalid key → clear message, not a silent failure; keys never appear
  in logs.

### 5.5 — Singleton migration to org/coach
Move each logic singleton off env/hardcode (audit §5), highest first:
- **`JEFF_FROM_EMAIL`** (`lib/gmail.ts:80`, sends all unattended mail as Jeff) → owning
  coach's send-from; org fallback. **Top priority.**
- `JEFF_CC_EMAIL`, `DEFAULT_COACH_*`, `DEFAULT_MEETING_LINK`, `COACH_ZOOM_LINK` → coach/org.
- Signature default, prep-email sign-off, raw-MIME "Jeff Holmes", billing sign-off,
  session-detection `jeff` regex, AI-prompt identity, authorization mandate legal string,
  brand chrome → `coaches.name` / `organizations`.
- **Validation:** an Org B coach's emails/prompts/branding show Org B identity, never Jeff.

### 5.6 — Sponsor = promoted `billing_accounts` (decision #1)
- Add nullable **sponsor contact/role** fields to `billing_accounts` (enterprise) — an
  HR sponsor who is neither payer-email nor a coached client.
- Build a **read-only sponsor aggregate view**: counts/hours/engagement-progress/invoice
  totals only, filtered by org + one `billing_account_id`.
- **Enforce the hard wall** (audit §6): the aggregate must never join to `notes` /
  `transcripts` / `session_reports` / coach-private fields via `coachees.client_id`.
- **Validation:** the sponsor surface exposes zero session content or per-individual
  qualitative attribution.

### 5.7 — Bearer-token TTLs (decision #6)
- Add expiry to `receipt`, `authorize`, and `agenda` tokens (agreement `sign_token`
  already expires). Expired link → a friendly "request a new link" page.
- **Validation:** an expired token is refused; a fresh one works.

### 5.8 — Per-org ingest endpoint (audit §4 target contract)
- Per-org ingest endpoint/secret (`POST /api/ingest/[orgToken]` or per-org
  `x-ingest-secret`), each mapping to one `org_id`.
- **Resolve the org from the endpoint/secret before any matching runs**; the request
  never names its own tenant. Name/calendar matching is scoped inside the org by
  construction. Rotate/scope secrets per org.
- **Validation:** a transcript posted with Org A's secret can only ever match Org A
  clients; a name collision across orgs never crosses.

### 5.9 — Zoom per-coach + remove diagnostic (decision #4)
- Move Zoom from firm-global to **per-coach** connection (each coach, incl. TLW's own).
- **Delete `/api/zoom-test`.**
- **Validation:** a coach only sees their own Zoom summaries; `zoom-test` is gone.

### 5.10 — Vault-lite provider seam (decision #5)
- Formalize a **framework-provider interface** with two implementations: the existing
  **GitHub vault** (firm/TLW only) and **vault-lite** (in-app native framework store)
  for external tenants. External tenants never wire a GitHub repo/PAT.
- Move `VAULT_REPO`/token/branch off global env onto the firm's org config.
- **Validation:** an external tenant can create/surface frameworks via vault-lite and
  never touches Jeff's garden.

### 5.11 — Stripe Connect for external tenants (decision record)
- External tenant payments via **Stripe Connect Standard**; per-tenant Connect account +
  webhook secret. TLW's own billing path unchanged.
- **Validation:** an external tenant's charge settles to their Connect account; webhook
  ownership is verified per tenant.

### 5.12 — GDPR special-category architecture (decision #7 — build hooks, wire late)
- Treat transcripts/notes/scorecards as **special-category**. Now: add the data
  **classification boundary** and DPA-ready seams (clear separation of content vs.
  metadata, deletion/erasure hooks). Don't build the full consent/retention machinery
  yet — but the schema and access boundaries must not preclude it.
- **Validation:** content tables are cleanly separable for future residency/erasure.

### 5.13 — EU residency kept possible (decision #8 — lookup, not constant)
- Ensure the tenant→database connection is resolved by a **lookup** (per-org), not a
  hardcoded constant, so a future EU-resident database can be added without
  re-architecture. Do not build routing yet.
- **Validation:** swapping one org's DB connection target is a config change, not a code
  change.

---

## 6. Sequencing & dependencies

```
5.0 org_id big-bang ─┬─> 5.1 JWT + service-role demotion ─┬─> 5.3 strangler RLS (groups 1→5)
                     │                                     │
                     └─> 5.2 correctness fixes ────────────┘   (fixes land before/with each group)
Parallelizable after 5.1: 5.4 BYO keys · 5.5 singletons · 5.7 token TTLs · 5.9 Zoom · 5.10 vault-lite
Gated on their RLS group: 5.6 sponsor (after billing RLS) · 5.8 per-org ingest (with transcripts group)
External-tenant track: 5.11 Stripe Connect (before first external tenant)
Cross-cutting seams: 5.12 GDPR · 5.13 residency (hooks during 5.0/5.1; full wiring deferred)
```

Do **not** flip an RLS group before its routes read through the JWT-scoped client.
Every group is its own staging→prod pass with a snapshot and a down-script.

---

## 7. Non-goals for Phase 1

- Full GDPR consent/retention/erasure machinery (only the architectural hooks — §5.12).
- Live EU-resident database routing (only kept-possible — §5.13).
- The client-facing portal, groups, SMS, and other roadmap features (`CLAUDE.md`).
- Any new coaching/scoring feature work — Phase 1 is isolation + the settled decisions.

---

## 8. Open / external items (tracked, not blocking the build)

- **Google OAuth scope classification** (sensitive vs. restricted) — 4–12 week Google
  verification tail; start before external launch (decision #9).
- **Privacy counsel** confirmation on GDPR Art. 9 handling before EU launch.

---

## 9. Guardrails

- **Present a file plan and receive confirmation before writing any code.**
- **Snapshot before every migration**, both environments; **staging → verify → prod**,
  no exceptions (`docs/MIGRATION_PROCEDURE.md`).
- Every migration ships a **paired down-script**, authored first.
- **Never flip a table to RLS in production without a staging rehearsal** on the two-org
  seed.
- New tenant secrets (Anthropic, Stripe, Zoom, vault) are **encrypted at rest, never
  logged, masked in the UI**.
- Backfill everything to **org #1** and keep the app behavior-identical until a group's
  enforcement is deliberately turned on.
- If Phase 2 work tempts mid-build (portal, groups), **log it and stop** — no scope
  pull-forward.
