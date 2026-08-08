# theLeadershipWell Coaching Platform — State of the App & Strategy Brief

_Snapshot: 2026-08-08. Purpose: paste this into a strategy chat to plan the two looming builds — (1) **multi-coach** (each coach gets their own login, access, data, and workspace) and (2) the **client-facing portal**. Written to be self-contained; a reader with no prior context should be able to reason about architecture and trade-offs from this doc alone._

---

## 1. What the app is

A coaching platform for Dr. Jeff Holmes (theLeadershipWell). Today it is effectively a **single-coach** product (Jeff), but the data model was built coach-aware from early on. Core value pillars:

1. **Session prep** — pulls a client's history (Coach Accountable notes, Zoom/transcript context) and uses Claude to generate a personalized prep email, sent via Gmail.
2. **Coaching scorecard** — scores recorded sessions against the ICF 2025 Core Competencies, refined by theLeadershipWell's rubric (consolidated spec v0.4 + deltas through v0.5.3).
3. **Client workspace** — a per-client hub (notes, actions, goals, transcripts, agreements, scheduling, communications, nudges, billing).
4. **Business Center / billing** — invoicing, Stripe, payment-on-file, adjustments.
5. **Between-session nudges** — Claude drafts warm client-facing messages off the vault "mind garden"; coach reviews before send.

### Stack
- **Next.js 14** (App Router) + TypeScript + Tailwind
- **Supabase** (Postgres) — reached only via the service-role key (`getSupabaseAdmin()`); **no RLS policies** — tenant isolation is enforced in application code, not the database (see §3).
- **NextAuth** with **Google OAuth** (coaches sign in with Google; the app rides their Gmail/Calendar/Drive scopes).
- **Anthropic SDK** for all generation/scoring.
- **Stripe** for billing.
- Deployed on **Vercel** (production builds from `main`), domain `theleadershipwell.online`.
- No automated test suite. `npx tsc --noEmit` + `npm run build` are the gates.

---

## 2. Feature inventory (what's shipped)

**Signed-in app shell** (`app/(authenticated)/*`): `dashboard`, `clients` + `clients/[id]` (workspace), `practice` (scorecard lives here), `business-center` (billing), `nudges`, `library`, `account`, plus `groups`/`templates` stubs.

- **Roster** with Active / Inactive / Archived toggle, bulk "Email all", CSV-style import history (CA migration done).
- **Client workspace**: name card, transcripts + notes, coaching goals (AI-generated from notes or hand-edited, with metrics), key info (coach-private), coaching map (drawn live from the vault repo), engagement goals, agreements, scheduling, recent communication, nudges, agenda fill-ins, "Plan next session" prep card.
- **Transcript → scored report pipeline**: Plaud.ai → Zapier webhook → ingest (dedupe, parse, match client by name/calendar, score with the engine). Manual paste + per-client file import also feed the same core. Background scoring with a progress bar; "add without scoring" surfaces.
- **Scoring engine**: Claude prompted with the v0.4 rubric bands + cross-competency principles, then deterministic rules enforced in code (metric thresholds, equal-weighted overall, band derivation, the three §10 gates, Layer-0 data-integrity checks, consultant-move envelopes, contracting classification). Rescore-in-place supported.
- **Scheduling + reminders**: book next session → Google Calendar event + client guest, confirmation email, configurable nudges via hourly Vercel Cron. Conflict-aware picker (free/busy), dual-timezone read-out. Calendar is the source of truth; appointments reconcile to it.
- **External booking capture**: Calendly/HubSpot bookings (which both write to Google Calendar) are captured by an hourly calendar-watch cron and surfaced as "Next Appointment"; unmatched ones land in a dashboard review queue.
- **Branded email send + communications log**: Compose → review → send via the coach's Gmail, signature appended server-side, every send logged to `communications`.
- **Coaching agreements**: structured master template → issue → public e-sign page → promotes `agreement_on_file` + `recording_authorized` onto the client (which the scoring Gate 1 reads).
- **Library**: folder system (Templates + PDF Resources), note templates with merge fields, rich note editor (TipTap, Harvard outline, Tab indent).
- **Send to client**: Claude drafts a client-facing narrative from a note; action items become click-to-log checkboxes (public token links).
- **Nudges (Phases A–C)**: pipeline drafts `action_checkin` / `insight` / `framework` / `goals` nudges off coaching goals, notes, open actions, transcript, and the vault garden; coach reviews (edit/send/schedule/snooze/skip); PDF attachment for framework nudges; dispatch cron.
- **Vault → garden index**: the coach's Obsidian "mind garden" (a GitHub repo) is read-only-indexed into `garden_notes` + `garden_edges` (pointers + graph only, never content). Framework nudges draft from the leaf's live content at send time.
- **Business Center / billing**: `billing_accounts` / engagements / invoices, Stripe hosted invoices, payment-on-file (stored-card mandate via Stripe Checkout setup mode), charge-on-run, credit-note adjustments, receipts, decline/retry handling, dispute logging. This is the most infrastructurally heavy subsystem.

**Migrations** run through **039** (`039_prep_sheet_pipeline.sql`). Applied by hand in the Supabase SQL editor; there are two accidental duplicate numbers (026, 034) that both shipped.

---

## 3. The tenant-isolation model (critical for both builds)

This is the single most important architectural fact for the two upcoming builds.

- We are on **NextAuth, not Supabase Auth**, so there is **no Postgres RLS enforcement**. All access control is **application-code enforced against the session coach.**
- **`coaches`** — one row per coach, keyed by signed-in Google email, get-or-create on first use (`lib/coach.ts#getOrCreateCoach`). Carries `role` (coach|supervisor), timezone, `google_refresh_token`, and per-coach settings blobs (`availability`, `reminder_settings`, `nudge_settings`, `billing_settings`, `library_labels`).
- **`coach_clients`** (migration 015) — the ownership link `(coach_id, client_id, role)`. This is *the* isolation boundary.
- **`lib/client-access.ts`** enforces it:
  - `requireClientCoach(supabase, clientId)` gates every `/api/clients/[id]/**` route — returns **404 (not 403)** on no access so a coach can't even probe for another coach's client ids.
  - `accessibleClientIds(coachId)` filters the roster.
  - `linkCoachToClient(...)` is called on client create/import.
- Almost everything already carries `coach_id`: transcripts, reports, notes (via client), appointments, nudges, garden, billing accounts. The comment in `lib/coach.ts` is explicit: coach-awareness was designed in "so a supervisor can roll up across coaches later without a migration."

**What this means:** the multi-coach build is **less a schema project and more a "audit every route + close the seams" project.** The plumbing is mostly there.

### Two known gaps that multi-coach must close

1. **No sign-in allowlist / invite gate.** `lib/authOptions.ts` + `getOrCreateCoach` mean **anyone with any Google account who reaches the app becomes a coach** (a new `coaches` row is minted on first sign-in). For a real multi-coach product this must become an **invite/approval flow** (allowlist table, admin-invites-coach, or domain restriction).
2. **Firm-wide singletons that assume "the coach is Jeff."** Several resources are global rather than per-coach and would leak or misattribute across coaches:
   - Env-var identity: `DEFAULT_COACH_EMAIL`, `DEFAULT_COACH_NAME`, `JEFF_FROM_EMAIL`, `JEFF_CC_EMAIL`.
   - The **vault** is a single app-level GitHub PAT + one repo (`VAULT_REPO`) — the garden/framework system currently assumes one coach's garden. Per-coach vaults would need per-coach repo config + tokens.
   - Email signature default, `DEFAULT_MEETING_LINK` / `COACH_ZOOM_LINK`, the brand logo.
   - Some **aggregate/dashboard/practice/business-center** routes may query globally rather than scoping to `accessibleClientIds` — these need a per-route audit (the `/api/clients/[id]/**` routes are gated, but list/aggregate endpoints are the risk surface).

---

## 4. Big Build #1 — Multi-coach platform

**Goal:** each coach gets their own login, access, data storage, and workspace; coaches cannot see each other's clients/data; a supervisor/admin can roll up.

**Already in place (reduces scope):**
- Per-coach identity (`coaches`), per-coach ownership (`coach_clients`), per-coach settings blobs, `coach_id` stamped across the data model.
- Per-coach Gmail/Calendar (sends already go through each coach's own Google account and refresh token — this is a big win; no shared mailbox to untangle).
- `requireClientCoach` gating on the client routes; `role` column already exists for supervisor.

**Open decisions / work to scope in the strategy chat:**
- **Onboarding & access control**: invite flow vs. domain allowlist vs. admin approval. Where do coaches get added? Who is the admin/owner tier? (Jeff as super-admin.)
- **Route audit**: every list/aggregate/cron route must be confirmed to scope by `coach_id` / `accessibleClientIds`. Crons currently loop "every coach" — confirm that stays correct and doesn't cross-send.
- **Per-coach vault/garden**: does each coach bring their own Obsidian garden (per-coach repo + token config on `coaches`), or is the garden shared firm IP? Product decision with real build cost.
- **Per-coach branding**: signature, logo, from-address, meeting link — move the remaining env-var singletons onto the `coaches` row.
- **Billing/Stripe**: is there one firm Stripe account (Jeff's) that all coaches bill through, or per-coach Stripe? Today it's one account. This is a significant fork.
- **Supervisor roll-up view** (already tracked as an open item): a `/supervision` page gated on `role='supervisor'`, aggregating reports across coaches + Claude-vs-coach comparison. Schema is ready.
- **Shared vs. shared-nothing library/templates**: are note templates, PDF resources, agreement master template per-coach (they already are, `coach_id`-scoped) or firm-shared? Confirm.
- **Data migration**: backfill — all existing data belongs to Jeff; new coaches start empty. The 015 backfill already assumed "all current logins are the same person."

**Rough risk read:** MEDIUM build. The hard 80% (data model, per-coach sends, isolation boundary) is done. The remaining 20% is exacting: the security audit of non-`[id]` routes, the invite/admin tier, and the singleton cleanup. The security surface is the thing to be careful about — a missed global query leaks one coach's clients to another.

---

## 5. Big Build #2 — Client-facing portal

**Goal:** a separate authenticated area where **clients** (not coaches) log in and see *only their own* data — goals, transcripts, shared notes, next appointment, frameworks, recent communication, contact-coach — plus an **AI chat** over their own coaching corpus, quick search, and an onboarding tour.

**Why this is the highest-complexity/highest-security build:**
- It introduces a **second, entirely separate auth principal** (client, not coach). NextAuth today only knows coaches. Needs a magic-link (or `client_tokens`) flow carrying `clientId`, its own middleware guard (`/portal/**`, `/api/portal/**`), and hard scoping to the authenticated `clientId` on every query.
- The **coach-private wall** must never break: `clients.key_info`, `coach_clients`, coach-internal fields, other clients' data — none can cross the boundary. Because we don't have RLS, this is *all* application-code discipline, on a brand-new route namespace.
- The **AI chat** is the core value: Claude answers over the client's transcripts + shared notes + goals, with document upload, persisted conversations (`portal_conversations` / `portal_messages`), and token-budget management. Context assembly must be scoped-by-construction.

**Suggested build order (from the roadmap):**
1. Auth layer (magic-link + `client_tokens` + portal session middleware).
2. Read-only workspace cards (goals, transcripts list, notes list, next appointment, contact-coach).
3. AI chat (conversations + messages + Claude integration + transcript context).
4. Quick full-text search (Postgres `tsvector`, scoped by `client_id`).
5. Frameworks card + PDF pop-up (garden leaf → Library PDF; `garden_notes.pdf_resource_id` already exists from migration 035).
6. Document upload in chat (Supabase Storage, TTL-purged).
7. Onboarding tour + per-card ⓘ popovers.

**Migrations needed:** `portal_conversations`, `portal_messages`, `client_tokens`, `clients.portal_onboarded`, optional `clients.phone` (SMS magic-link). (`garden_notes.pdf_resource_id` already shipped.)

**Rough risk read:** HIGH build, and it is **downstream of multi-coach in one important way**: a client belongs to a coach, and "shared notes / shared transcripts" semantics depend on how coach ownership works. Deciding multi-coach first makes the portal's data-scoping rules cleaner (client → coach → firm). Worth sequencing deliberately.

---

## 6. Interdependency between the two builds

- Both hinge on the **same isolation discipline** (app-code scoping, no RLS). Doing the multi-coach **route audit first** hardens the exact patterns the portal will reuse — arguably the portal should *not* start until the codebase has a proven, audited "scope every query to a principal" convention, because the portal adds a second principal on top.
- **Consider adding RLS as part of this work.** With two principals (coach, client) and cross-coach isolation both landing at once, the "service-role key bypasses everything, trust the app code" model gets materially riskier. A strategy question worth raising: is now the moment to introduce real Postgres RLS (or at least a hardened data-access layer) rather than continuing to hand-scope every route?
- **Shared primitives** to build once and reuse: a principal-aware session/middleware abstraction, a `scopeToPrincipal(query)` helper, and a single audited list of "coach-private columns that never cross a boundary."

---

## 7. Should you strategize *here* (in Claude Code) vs. a regular chat?

You asked for the benefits and drawbacks. Straight read:

### Benefits of strategizing in Claude Code (this environment)
- **Ground truth.** I can read the actual code, confirm which routes are scoped, check the real migration state, and correct assumptions — a plain chat strategizes against your *description* of the app; here I strategize against the app. For a security-sensitive isolation build, that difference is large.
- **No translation loss.** Decisions turn directly into a plan, a migration file, and a diff in the same place. The strategy and the implementation share one source of truth (this repo + `CLAUDE.md`).
- **It can verify claims mid-strategy.** "Does route X already scope by coach?" is answerable in seconds instead of assumed.
- **Artifacts persist in the repo** (like this file), versioned and pasteable.

### Drawbacks of strategizing here
- **Weaker at open-ended divergent thinking / business framing.** A strategy chat is better for "what's the pricing model, who's the buyer, what's the sequencing across quarters, what could go wrong commercially" — the parts that aren't about the code. Here I bias toward implementation reality.
- **Context is code-shaped.** I'll tend to anchor on what's built and how, which can under-weight "should we even build it this way / buy vs. build / defer" questions.
- **Cost/latency of the code tooling** for pure ideation you don't need — a lot of the machinery here is wasted on a whiteboard conversation.
- **One long thread mixing strategy + implementation** can get muddy; a clean strategy doc (this one) handed to a dedicated thinking chat keeps the two modes separate.

### My recommendation
**Do the divergent strategy in a regular chat** (paste this doc), because the biggest open questions are product/sequencing/security-posture decisions, not code facts — and a strategy chat is better at holding several options in tension without pulling toward implementation. **Then bring the conclusions back here** to pressure-test against the actual code and turn them into a phased build plan + migrations. Use this environment as the *verification and execution* layer, not the ideation layer. The one thing I'd verify *here before* you finalize strategy: the **route-by-route scoping audit** (§3/§4), because whether the isolation is truly airtight today changes the multi-coach estimate and the portal's risk profile — that's a code fact, and it's cheap to nail down here.

---

## 8. Quick reference — where things live

- Tenant isolation: `lib/client-access.ts`, `lib/coach.ts`, `lib/authOptions.ts`
- Scoring: `lib/scoring/*` (engine, rubric, aggregate, store), spec in `spec/theLeadershipWell_Session_Report_Spec_v0.4.md` + deltas v0.5 → v0.5.3
- Transcripts: `lib/transcripts/*`, ingest webhook `POST /api/transcripts/ingest`
- Nudges: `lib/nudges/*`; Vault/garden: `lib/vault/*`
- Billing: `lib/billing/*` (stripe, send, charge, adjustments, retries, access)
- Scheduling/calendar: `lib/scheduling.ts`, `lib/calendar.ts`, `lib/appointments.ts`, `lib/booking-sync.ts`
- Migrations: `supabase/migrations/*` (through 039; hand-applied)
- Full architecture notes: `CLAUDE.md` (the living source of truth — read it for any subsystem detail)
</content>
</invoke>
