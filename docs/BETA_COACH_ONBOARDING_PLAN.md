# Beta Coach Onboarding — Build Plan

**Goal:** Onboard 2–3 beta-tester coaches onto the TLW platform seamlessly, remove
lingering Coach Accountable (CA) references, and give each coach a real self-serve
Account settings area (email signature, calendar selection, transcript source).

**Key scoping decision (2026-08-14):** For the beta, **transcript intake is manual
upload only** (the per-client file-import flow already works). Automated per-coach
Plaud and Zoom ingestion is **deferred to post-beta**. The Account "transcript
source" panel still ships, but Plaud/Zoom appear as *informational / coming-soon*
options, not live per-coach integrations.

This plan is organized into four tiers. **Tier 1 is mandatory before any coach
touches the app** — it fixes correctness and identity bugs that would otherwise
leak data across coaches or send a new coach's email out looking like Jeff.

---

## Tier 1 — Correctness & identity (must ship before beta)

These are not new features; they are fixes to single-tenant assumptions.

### 1.1 Close the ingest cross-tenant leak 🔴
- **Problem:** `lib/transcripts/ingest.ts:167` loads the client roster with **no
  `coach_id` filter**, so a transcript can be name/calendar-matched to another
  coach's client and scored against them.
- **Fix:** Scope the roster query to the resolving coach's accessible client ids
  (mirror the correct pattern in `lib/booking-sync.ts#loadRoster`). The coach is
  already resolved upstream in each caller; thread `coachId` into `ingestMarkdown`
  and filter `clients` by `coach_clients` for that coach.
- **Files:** `lib/transcripts/ingest.ts`, callers in
  `app/api/transcripts/ingest/route.ts`, `app/api/transcripts/manual/route.ts`,
  `app/api/clients/[id]/import-file/route.ts` (the last already forces a client, so
  it's safe — verify).
- **Risk:** Low. Manual-upload beta reduces exposure further, but fix it anyway.

### 1.2 Role-gate the `/api/coaches` routes 🔴
- **Problem:** `app/api/coaches/route.ts` and `app/api/coaches/[id]/route.ts` have
  no authorization — any signed-in coach can list all coaches, promote themselves
  to `supervisor`, or delete another coach.
- **Fix:** Add a `requireSupervisor(coach)` guard (new helper, e.g. in
  `lib/client-access.ts` or a new `lib/roles.ts`) and apply it to GET (list),
  POST (create), PATCH (role/name), DELETE. Non-supervisors → 403.
- **Files:** `app/api/coaches/route.ts`, `app/api/coaches/[id]/route.ts`, new role
  helper. Jeff's row must be `role='supervisor'` (verify/set in Supabase).

### 1.3 De-Jeff the outbound identity
Replace hardcoded "Jeff" fallbacks with the actual acting coach. Each should read
the coach's own name/email; only fall back to env when no coach is resolvable.
- **Send-from:** `lib/gmail.ts:29` (`'Jeff Holmes'` display-name fallback) and
  `:80` (`JEFF_FROM_EMAIL` From). Unattended sends must use the owning coach's
  Gmail identity (their stored refresh token already exists).
- **Signature default:** `lib/signature.ts:18-39` — see Tier 2 §2.1; once coaches
  can set their own, the hardcoded Jeff block becomes a true last-resort only.
- **Billing sign-offs:** `lib/billing/reminders.ts:227,235` hardcode "Dr. Jeff
  Holmes" / "theLeadershipWell · jeff@theleadershipwell.com" with no coach
  fallback — thread the coach through. Also `lib/billing/send.ts:353,455`,
  `lib/billing/receipt.ts` (already use `coach.name || 'Dr. Jeff Holmes'` — make
  the fallback generic or coach-derived).
- **Meeting link:** `lib/scheduling.ts:127` `DEFAULT_MEETING_LINK` (Jeff's Zoom
  room) is the final fallback. Acceptable as a *coded* last resort, but a coach
  who hasn't set a link should be nudged in onboarding rather than silently
  inheriting Jeff's room.
- **Hardcoded CC:** `app/(authenticated)/clients/[id]/EmailModal.tsx:33` defaults
  CC to `jeff@theleadershipwell.com`; session-prep pages display the same. Default
  CC to the acting coach's own email (or empty), not Jeff's.
- **Files:** as listed above.

### 1.4 Gate sign-up for the beta
- **Problem:** Sign-in is a fire-and-forget `events` hook (`lib/authOptions.ts:77`)
  with no allowlist — anyone with the URL + a Google account becomes a coach.
- **Fix (pick one):**
  - (a) Add a `callbacks.signIn` that checks the email against an allowlist
    (env `BETA_COACH_EMAILS` comma-list, or a small `allowed_coaches` table), OR
  - (b) Keep the Google OAuth app in "testing" mode with the 2–3 beta emails as
    test users (no code change, but caps at 100 users and shows an "unverified"
    screen).
  - **Recommendation:** (a) — cleaner UX, and the allowlist can later become the
    supervisor-managed invite list.
- **Files:** `lib/authOptions.ts` (+ env or table).

---

## Tier 2 — The Account settings panels you asked for

All new panels mount on `app/(authenticated)/account/page.tsx` (currently only
Timezone / Scheduling / Vault / Supervisor). Each is a client component in
`app/(authenticated)/account/` following the existing pattern (load from
`GET /api/coach`, save via `PATCH /api/coach` or a dedicated route).

### 2.1 Email signature editor (lowest effort — read path already exists)
- **State today:** `email_signatures` supports a per-coach row and
  `getActiveSignatureHtml()` already *prefers* it — but nothing ever writes it.
  The signature API is GET-only; default is hardcoded Jeff HTML.
- **Build:**
  - New `SignatureSettings.tsx` panel: a simple editor (name, title, email, phone,
    booking link, optional logo) that renders to the email-safe table HTML the
    signature system expects — plus a live preview matching the send-time render.
  - New `POST/PUT /api/email/signature` (currently GET-only) that upserts the
    coach's `email_signatures` row. Tenant-scope to the session coach.
  - Keep `DEFAULT_SIGNATURE_HTML` only as the final fallback for a coach who hasn't
    saved one (and consider making it generic rather than Jeff-branded).
- **Migration:** none (table 017 already exists; only writes are new).
- **Files:** new panel, `app/api/email/signature/route.ts` (add POST/PUT),
  `lib/signature.ts` (unchanged read path).

### 2.2 Calendar picker
- **State today:** every Google Calendar call is hardcoded `calendarId: 'primary'`
  (9 sites in `lib/calendar.ts`, plus `app/api/zoom-summaries/route.ts:31`).
- **Build:**
  - New `CalendarSettings.tsx`: fetch the coach's calendar list
    (`GET /api/calendar/list` → Google `calendarList.list`), show a dropdown,
    save the chosen id.
  - **Migration:** add `coaches.calendar_id text` (nullable; NULL = `'primary'`).
  - Thread the chosen id through `lib/calendar.ts` — replace the hardcoded
    `'primary'` with a `calendarId` param defaulting to the coach's setting.
    (This touches match, create, conflict/free-busy, delete, list, delta, and
    upcoming — do it as one helper that resolves the coach's calendar id.)
- **Scopes:** `calendar.readonly` + `calendar.events` are already granted; listing
  calendars needs no new scope.
- **Files:** new panel, new `app/api/calendar/list/route.ts`, `lib/calendar.ts`
  (parameterize), migration `0XX_coach_calendar_id.sql`.

### 2.3 Transcript-source selector (manual-first for beta)
- **State today:** no `transcript_source` concept; source is set implicitly by the
  receiving endpoint.
- **Build (beta scope):**
  - New `TranscriptSourceSettings.tsx`: radio/segmented control with three options
    — **Manual upload** (live, the default for beta), **Plaud** (shown with a short
    blurb + subscription/affiliate CTA link — see Tier 3, marked "coming soon" for
    automated intake), **Zoom** (shown, "coming soon").
  - **Migration:** add `coaches.transcript_source text default 'manual'`.
  - For beta this setting is mostly informational + records intent; it does not yet
    change routing (manual upload works regardless). Wiring it to per-coach Plaud/
    Zoom is Tier 3 / post-beta.
- **Files:** new panel, `/api/coach` PATCH (+ GET) to read/write
  `transcript_source`, migration.

> **Account page after Tier 2:** Timezone · Scheduling · **Signature** ·
> **Calendar** · **Transcript source** · Vault · Supervisor. Consider grouping
> into labeled sections ("Profile & sending", "Scheduling", "Transcripts",
> "Advanced") as the list grows.

---

## Tier 3 — Larger integrations (post-beta)

### 3.1 Per-coach Plaud wiring + subscription discount
- Each coach needs their own ingest attribution so their Plaud→Zapier flow tags
  transcripts to them (per-coach ingest token instead of the single global
  `INGEST_SECRET` + `DEFAULT_COACH_EMAIL=jeff`).
- Add a Plaud subscription/affiliate CTA (net-new — zero references exist today):
  a signup link + optional discount code surfaced in the transcript-source panel.
- **Deferred:** not needed while beta is manual-upload-only.

### 3.2 Zoom cloud-recording transcript ingestion (largest single build)
- Today Zoom is only a meeting *link* + a firm-wide AI-Companion *summary* fetch.
  There is **no** recording/VTT retrieval.
- To make Zoom a real transcript source: per-coach Zoom OAuth (not the single
  firm-wide Server-to-Server app), `cloud_recording:read` scope, and a
  recording → VTT → `ingestMarkdown` pipeline.
- **Deferred:** post-beta.

---

## Tier 4 — Onboarding & CA cleanup (polish, ship alongside beta)

### 4.1 First-run onboarding
- **Problem:** a new coach lands on the full dashboard, every widget empty, no
  guidance (`app/(authenticated)/layout.tsx` only checks the session).
- **Build:** a lightweight first-run checklist/wizard — "Set your timezone → pick
  your calendar → build your email signature → add your first client → import a
  transcript." Track completion in `localStorage` or a `coaches.onboarded` bool.
  Reuse the portal onboarding pattern (`PortalOnboarding`) as a model.

### 4.2 Scrub remaining CA references (low effort)
- Change the two example strings from "(e.g. Coach Accountable)" to a generic
  "(e.g. another platform)": `EditClientModal.tsx:383`, `AgreementsCard.tsx:102`.
- Relabel the stale prep-prompt header `OPEN ACTION ITEMS FROM COACH ACCOUNTABLE:`
  → generic (`app/api/generate/route.ts:163`).
- Update `README.md:80,91` (still narrates the old CA note-pull flow as live).
- Retained provenance columns (`ca_client_id`, `ca_session_id`) stay — invisible
  to coaches, no action needed.

---

## Migrations introduced by this plan
- `0XX_coach_calendar_id.sql` — `coaches.calendar_id text` (nullable).
- `0XX_coach_transcript_source.sql` — `coaches.transcript_source text default 'manual'`.
- (No migration for the signature editor — table 017 already exists.)
- (Deliver each as copy/paste SQL per CLAUDE.md, RLS-enabled, sequentially numbered.)

## Suggested delivery order
1. Tier 1 (all four) — one PR, no user-visible feature change, unblocks beta.
2. Tier 2 §2.1 signature editor — highest value, lowest effort.
3. Tier 2 §2.2 calendar picker + §2.3 transcript-source panel.
4. Tier 4 onboarding + CA scrub.
5. Tier 3 (Plaud/Zoom) — after beta feedback.
