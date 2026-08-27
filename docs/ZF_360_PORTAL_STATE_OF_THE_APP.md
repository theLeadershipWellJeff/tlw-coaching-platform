# State of the App — ZF 360 Assessment Portal (architecture reference)

**Date:** 2026-08-27 · **Verified against code** on branch `claude/zf-360-client-portal-j18ojs`
(everything below was checked in the actual source, not just project docs).

**Purpose:** the complete current state of every subsystem relevant to the
Zenger Folkman 360 portal use case, so a build prompt can be written against
facts. Structured as: use case → what exists today → gap analysis → reusable
patterns → open decisions.

---

## 1. The use case, restated as requirements

| # | Requirement |
|---|---|
| **A** | Coach uploads a client's ZF 360 assessment PDF; the client can view it in their portal. |
| **B** | The client engages with the report through AI chat, guided by theLeadershipWell coaching standards already in the app. |
| **C** | Per-client feature toggle — the coach "turns on" ZF functionality for a client's portal. |
| **D** | The client establishes goals + measures of success **from the portal**, in the same `{title, description, metrics}` structure the coach workspace uses. |
| **E** | Portal-only clients — some users will have **no coach taking notes or uploading transcripts**; the portal "may or may not be connected to a coach." A branch of the product. |
| **F** | Company vision & values loaded into the portal, shared across all clients at the same company, feeding goal-setting and AI conversation. |
| **G** | Clients upload personnel reviews to further inform goal setting, task creation, and AI coaching conversations. |
| **H** | AI-assisted task creation for the client. |

---

## 2. Client Portal — current state

A fully separate client-facing surface at `app/portal/*`, walled off from the
coach app. Shipped through "Phase 7" (tour) plus billing, search, frameworks,
password login, and chat retrieval — **but several of its backing migrations
are still pending in production (see §10)**.

### 2.1 Auth & session

- **Session** = a signed cookie `tlw_portal_session` (hand-rolled HS256 JWT,
  Web Crypto so it runs in Edge middleware; signed with `NEXTAUTH_SECRET`).
  Payload carries **only `{sub: clientId, portal: true}`** — no email, org, or
  coach. TTL 7 days. `lib/portal/session.ts`; Node-side reader
  `lib/portal/server.ts#getPortalClientId`.
- **Middleware** (`middleware.ts`): matcher `['/portal', '/portal/:path*']`,
  public paths only `/portal/login` + `/portal/verify`. `/api/portal/**` is
  deliberately NOT matched — each route self-guards with `getPortalClientId()`.
- **Coach NextAuth session is never accepted on portal routes and vice-versa.**
  Two completely disjoint auth systems by construction.
- **Magic link** (primary + recovery path): `POST /api/portal/auth/request`
  → looks up client by email (ilike) → rate cap 5 links/client/hour →
  **`resolveClientCoach()`** → mints a token (only the **sha256 hash** stored
  in `client_tokens`, single-use, 24h TTL) → emails the link **from the
  client's coach's Gmail** via `sendCoachHtmlEmail`. Always returns a generic
  `{ok:true}` (anti-enumeration). Verify page POSTs the token (scanner-safe)
  to `/api/portal/auth/verify`, which consumes it race-safely and sets the cookie.
- **Username + password** (optional, migration 054 — PENDING in prod):
  `client_credentials` table (own table, never on `clients`, so `select *`
  can't leak a hash). scrypt (N=16384,r=8,p=1, params stored with hash),
  min length 10, 8 failures → 15-min lockout, `timingSafeEqual`, one generic
  401 for all failure modes. Set at `/portal/settings` — requires a live
  portal session (inbox possession is the authorizer; no separate reset flow).
- **Coach-initiated invite**: workspace action bar → `POST
  /api/clients/[id]/portal-invite` (gated `requireClientCoach`), sends from
  the acting coach's Gmail. GET on the same route returns portal status
  (username / hasPassword / lastSeen / locked). A supervisor on-behalf resend
  exists under `/api/coaches/[id]/clients/[clientId]/portal-invite`.
- **Rate limiting + audit** (`lib/portal/access.ts`, migration 053 — PENDING):
  `portal_access_log` is both audit trail and the counter (Postgres-backed
  because serverless). Limits: chat 60/h, upload 20/h, contact 10/h, password
  login 10/15min. The limiter **fails open**; the cookie is the security
  boundary. Actions `note_view`/`session_view`/`pdf_view` are declared but
  never emitted (views are not currently logged).

### 2.2 Portal home (`app/portal/page.tsx`, SSR, force-dynamic)

Order: header (Settings link, logout) → onboarding tour shell → greeting →
**booking CTA** (coach's `coaches.booking_url`, hidden when null) → **search
box** → **chat entry tile** → card grid:

| Card | Data |
|---|---|
| Upcoming sessions | next 5 `appointments` (`scheduled`), shown in client's timezone |
| Your coaching goals | `clients.coaching_goals` — title, description, metrics[] — **read-only, no portal write path** |
| Your sessions | last 20 `transcripts` (title + date), each → `/portal/sessions/[id]` |
| Your session notes | sent notes only = `communications` rows `type='session_note' ∧ outbound ∧ sent` → `/portal/notes/[id]` |
| Messages from your coach | other outbound sent `communications` (subject + preview, not clickable) |
| Your frameworks | `FrameworksCard`, self-hides when empty (see §2.6) |
| Billing | `BillingCard`, self-hides; **solo accounts only** (see §2.7) |
| Contact your coach | compose → emails the coach, logged as inbound communication |

Every card carries an `InfoPopover` (ⓘ). Six-step `PortalTour` fires when
`clients.portal_onboarded` is false (migration 053), with a replay link.

### 2.3 Data access rules (the invariants)

- `lib/portal/data.ts#loadPortalOverview` — every query hard-scoped to the
  authenticated `clientId`. **The `notes` table is never read by any portal
  code path** — clients see only what the coach actually emailed
  (`communications` `type='session_note'`, the migration-050 gate). `key_info`
  and every coach-private field are never selected.
- Viewers (`loadPortalTranscript` / `loadPortalSessionNote`) filter on **both**
  row id and `clientId` — someone else's id 404s rather than confirming
  existence. Note viewer renders stored email HTML in a **sandboxed iframe**.
- Portal billing misses return **404, never 403** (existence non-confirmation).

### 2.4 AI chat (`/portal/chat`, `lib/portal/chat.ts`)

- **Storage**: `portal_conversations` + `portal_messages` (migration 045 —
  PENDING in prod per the ledger). Conversation list, rename, delete; title
  = first 48 chars of first message.
- **Context (`buildChatContext`)** — retrieved, not stuffed:
  - client name + `coaching_goals`;
  - newest **4 transcripts** × 6,000 chars each;
  - up to 8,000 chars of **sent session-note emails** (HTML → plain text);
  - **retrieval**: 24,000-char budget from the `portal_chat_context(p_client_id,
    p_query, p_limit 8)` SQL function (migration 053, reusing 052's search
    vectors) ranked against the client's question, across their whole history.
    Missing function → silently degrades to recency-only.
- **System prompt** = role preamble ("companion for reflection, NOT a
  replacement for their coach"; cite sessions by date; escalate
  urgent/clinical/crisis to the coach; never invent; material is "a relevant
  selection, not their complete history") + **`PORTAL_CHAT_VOICE_STANDARDS`**
  (from `lib/writing-standards.ts`) + goals + notes + sessions + retrieved
  passages.
- **Model** `PORTAL_CHAT_MODEL` env or `claude-sonnet-4-6` default (no
  retired-model guard, unlike the scoring engine). `max_tokens` 4096.
- **Streaming**: `streamChatReply` async generator → route wraps in a
  `ReadableStream` of plain text (not SSE), `X-Conversation-Id` header, both
  turns persisted server-side (assistant turn in `finally`, partial kept on
  mid-stream failure). Route `maxDuration = 300`. Message cap 8,000 chars,
  history window last 40 messages.

### 2.5 Chat document upload (Phase 6 — the closest thing to G today)

`POST /api/portal/chat/upload`: 4 MB cap, rate-limited, extracts text via
`lib/transcripts/extract.ts` (pdf via **unpdf**, docx via **mammoth**, txt/md,
vtt/srt captions). **The file is never stored** — extracted text (capped
30,000 chars) returns to the browser, is spliced into that one turn's last
user message in memory for the model, and only a `📎 filename` marker is
persisted to `portal_messages`. Later turns see only the marker. This is
ephemeral by design — a personnel review uploaded here does NOT persist.

### 2.6 Frameworks + PDF flow (the model for a "your ZF report" card)

- `GET /api/portal/frameworks` → `lib/portal/frameworks.ts` — union of
  (a) this client's `type='framework'` nudges' slugs and (b) `client_frameworks`
  rows (migration 055 — PENDING; frameworks a scored session *named*,
  `dismissed_at` = coach override), resolved against `garden_notes` with
  `nudge_eligible = true` re-checked. Card self-hides when empty.
- **PDF open**: `GET /api/portal/frameworks/[slug]/pdf` — authorizes the slug
  against the same union, re-applies the eligibility gate, then mints a
  **300-second signed URL** on the private `library-pdfs` bucket and 302s.
  Authorization and card contents are deliberately kept in exact step.
  This authorize-then-signed-URL-redirect pattern is directly reusable for
  serving a ZF PDF.

### 2.7 Portal billing

`lib/portal/billing.ts#resolvePortalBillingAccount` is the single gate:
`coachees` → `billing_accounts`, returns null unless `type='solo'` — **an
enterprise coachee sees no billing at all** (the company pays). Card on file +
invoice history + Stripe hosted Checkout setup mode.

### 2.8 Search

`GET /api/portal/search?q=` → `portal_search()` SQL function (migration 052 —
PENDING): one ranked FTS query over the client's own transcripts + sent
session notes (weighted title A / body B, compound `(client_id,
search_vector)` GIN via btree_gin, `websearch_to_tsquery`). Snippets use
`[[hl]]`/`[[/hl]]` sentinels — never HTML — so content can't inject markup.
Missing function → ILIKE transcript-scan fallback.

---

## 3. Coaching standards — what's already in the app for the AI

This is requirement B's foundation, and it already exists:

- **Source of truth**: `spec/theLeadershipWell_Writing_Standards_v1.0.md`
  (Jeff's living voice doc — non-negotiables, core voice, anti-pattern
  register with never-say list and AI-detection tells, evidence standards,
  channel standards, CTA system, checklists). **§9 is a self-contained
  "Assistant Configuration Block"** — a paste-ready system prompt — that no
  code currently references. It is a natural seed for a ZF-dialogue prompt.
- **Distilled prompt module**: `lib/writing-standards.ts`, two exports:
  - `CLIENT_VOICE_STANDARDS` — anything written *as the coach* (never-say
    hype/coach-speak/jargon lists, no invented statistics, AI-tell avoidance,
    one ask per message). Wired into: session prep (`/api/generate`),
    send-to-client recap (`/api/notes/client-email`), nudge drafting
    (`lib/nudges/draft.ts`).
  - `PORTAL_CHAT_VOICE_STANDARDS` — condensed variant for the portal chat,
    which speaks as an assistant/reflection companion, not the coach. Wired
    into `lib/portal/chat.ts` only.
  - House rule (CLAUDE.md): **every new client-facing generation must include
    the appropriate block** — a ZF dialogue feature must include one.
- **ICF scoring rubric** (`lib/scoring/rubric.ts`): the eight ICF 2025
  competency band definitions + cross-competency principles (Attunement
  Standard, Exploration Gate, Authorship Hinge, Consultant Pull Signature).
  Currently consumed only by the scoring engine and display surfaces
  (report UI, scorecard email) — **no conversational feature reuses it**.
  It encodes the practice's coaching philosophy (evocative over consultative,
  client authorship, feeling exploration) and could inform how the ZF AI
  coaches rather than advises — but it is written as a session-scoring
  rubric, not a dialogue guide.

---

## 4. Coaching goals — the structure requirement D reuses

- **Storage**: `clients.coaching_goals` jsonb, `CoachingGoal =
  {title: string, description: string, metrics?: string[], source?:
  'manual'|'generated'}` (metrics = up to 3 "measures of fulfillment";
  absent `source` is treated as protected/manual).
- **Shared editor**: `app/(authenticated)/clients/[id]/GoalRows.tsx` — exports
  `GoalDraft`, `emptyGoal()`, `toDrafts()`, `cleanGoals()` (stamps
  `source:'manual'`), `goalHasContent()`, `untitledGoals()`, and the
  `GoalRows` grid component (title + description + 3 metric inputs). Used by
  both coach-side editors (`GoalsCard`, `EngagementGoalsCard`); both save via
  `PATCH /api/clients/[id]` `{coaching_goals}`.
- **AI generation**: `POST /api/clients/[id]/goals/generate` — reads last 12
  notes, prompts for 3–4 goals `{title, description}` (**does not emit
  metrics**), stamps `source:'generated'`, merge rule protects manual goals
  (`existing.filter(g => g.source !== 'generated')` + new generated set).
  Fire-and-forget client tracker `lib/goal-jobs.ts` (localStorage
  `tlw-goal-jobs`, 8s poller against a baseline, 3-min timeout + retry).
  Note: generation currently reads the **`notes` table** — a source
  portal-only clients won't have.
- **Portal today**: goals render **read-only** on the portal home. There is
  **no portal write path for goals** — `PATCH /api/clients/[id]` is a coach
  route gated by `requireClientCoach`. Requirement D needs a new
  portal-scoped goals write route (which can reuse `cleanGoals`-style
  validation and the same jsonb column, but must decide how client edits and
  coach edits coexist — `source` currently only distinguishes
  manual/generated, not coach/client authorship).

---

## 5. File / PDF / storage infrastructure

- **Exactly one Storage bucket exists**: `library-pdfs` (private; constant
  `PDF_BUCKET` in `lib/library-storage.ts`, auto-created on first upload).
  No env var; no other `storage.from(...)` anywhere.
- **`pdf_resources`** (migration 010): `id, coach_id, folder_id →
  library_folders, name, storage_path, size_bytes, created_at`. Coach-scoped
  Library files; path convention `${coachId}/${folderId}/${uuid}.pdf`.
  Upload: `POST /api/library/pdfs`, multipart, **4 MB cap** (serverless
  request-body ceiling — a global constraint on every upload route in the
  app). View: signed URL, 300 s. Nudges can attach these PDFs to emails;
  `garden_notes.pdf_resource_id` is a framework leaf's standing PDF.
- **Text extraction**: `lib/transcripts/extract.ts#extractTranscriptText` —
  md/txt, vtt/srt (flattened to "Speaker: text"), **docx (mammoth), pdf
  (unpdf, text-layer only — a scanned/image-only PDF yields nothing; there is
  no OCR in the app)**. Used by the coach's transcript file import and the
  portal chat upload.
- **There is no per-client document store.** Nothing today attaches an
  arbitrary uploaded document to a client durably: Library PDFs are
  coach-Library-scoped (surfaced to clients only through the framework
  card), transcript imports become `transcripts` rows, and portal chat
  uploads are discarded after one turn. A ZF report PDF (and personnel
  reviews) need a new table — e.g. `client_documents` (client_id, kind,
  storage_path, extracted_text or a pointer, uploaded_by) — plus either a
  second bucket or a new path convention in `library-pdfs`.

---

## 6. AI call patterns (how the app talks to Claude)

- Models per feature, all env-overridable, default `claude-sonnet-4-6`:
  `SCORING_MODEL` (retired-id guard), `PORTAL_CHAT_MODEL`, `NUDGE_MODEL`
  (guard), `GOALS_MODEL`, `PLAN_SESSION_MODEL`, `GENERATE_MODEL`,
  `SUGGEST_MODEL`; `TITLE_MODEL` defaults to haiku (guard). The retired-model
  guard exists in 3 copies (engine, nudges, titles) — a new ZF feature should
  reuse the pattern.
- Two call shapes: simple `messages.create` with `{timeout: 60s,
  maxRetries: 1}` + fence-stripping JSON parse (`lib/nudges/llm.ts` is the
  cleanest template), and **streaming** (`messages.stream`) for the portal
  chat and the scoring engine (headers-only timeout, in-engine stall guard).
- Long-running work is **fire-and-forget** with localStorage job trackers +
  pollers (`lib/scoring-jobs.ts`, `lib/goal-jobs.ts`) because scoring takes
  ~120 s; routes that run engines in-band set `maxDuration = 300`.

---

## 7. Actions / tasks (requirement H's substrate)

- `actions` table: `id, client_id, note_id (null = prep-email action),
  description, due_date, status open|done|dropped, complete_token (unique),
  completed_at, completed_via 'email'|'coach', timestamps`.
- Only two writers, both coach-side: `syncNoteActions` (reconciles a note's
  `ACTION:` lines; deletes edited-away open rows, keeps done history) and
  `persistActionLinks` (send-note + prep emails; stable tokens across
  re-sends).
- **Public completion loop**: `GET /api/actions/complete?token=` — no auth,
  token is the credential, idempotent flip to done, branded confirmation page.
- **The portal has zero access to `actions` today** — no read, no write, on
  any `app/api/portal/**` route. Client- or AI-created tasks are an entirely
  new write path, and need an authorship marker (e.g. `created_via
  'coach'|'client'|'ai'`) so coach-facing surfaces can distinguish them.

---

## 8. Coach coupling & tenancy — where "no coach" breaks today

This is the load-bearing finding for requirement E. A client row **can**
exist with no coach link at the DB level (nothing requires one), but no app
path produces that state, and four places hard-wire the coach:

1. **Client creation**: `POST /api/clients` is the *only* insert site for
   `clients`, and it immediately calls `linkCoachToClient(coach, client,
   'primary')`. Every client is born owned by the signed-in coach.
2. **`lib/client-access.ts#requireClientCoach`** gates all 27+
   `/api/clients/[id]/**` routes (404, never 403, on no link);
   `accessibleClientIds` filters every roster/list. A coach-less client would
   be invisible and unmanageable from the coach app.
3. **Email transport**: `lib/gmail.ts#sendCoachHtmlEmail` is the **only
   outbound email transport in the product** — Gmail API on a specific
   coach's `google_refresh_token`. Verified: no transactional provider
   (no Resend/SendGrid/SES/nodemailer/SMTP) exists anywhere in
   `package.json` or code. It **throws** if the coach has no refresh token;
   `JEFF_FROM_EMAIL`/`DEFAULT_COACH_NAME` are cosmetic header fallbacks only,
   not a sender fallback.
4. **Portal coach resolution**: `lib/portal/coach.ts#resolveClientCoach`
   (coach_clients → primary-or-first → coaches row) is called by exactly two
   routes: magic-link request and contact-coach. **With no coach link, the
   magic-link request silently no-ops** (generic `{ok:true}`, no token, no
   email) — the client can never bootstrap a portal session, and therefore
   can never set a password either (password setup requires a live session).
   Contact-coach returns 400 "No coach on file." A subtler failure: a linked
   coach **without** a refresh token burns a token against the 5/hour cap on
   every attempt while no email ever goes out.

Everything else the portal renders is coach-free and degrades gracefully:
goals, appointments, transcripts, sent notes, chat, search, billing (solo),
frameworks all scope by `client_id` alone and show empty states.

**Net**: "portal without a coach" is blocked precisely at (a) who creates and
administers the client, and (b) who *sends the sign-in email*. Options the
build prompt must choose between: keep a nominal owning coach row for every
portal-only client (e.g. Jeff, or a house "coach" account, minimal change),
or introduce a real coach-less mode, which forces a transactional email
provider (or a designated org sender account) plus an admin surface that
isn't `requireClientCoach`-gated.

**Multi-tenancy context**: `organizations` (migration 042) is the *coaching
firm* tenant root — one seeded row = theLeadershipWell; `org_id NOT NULL
DEFAULT org#1` sits on all 36+ tenant tables but is schema-only (no RLS
enforcement; the 043 route cutover is parked). It is **not** a client-company
concept. The coach app's real isolation boundary is `coach_clients` +
server-side session checks, not RLS.

---

## 9. Company model — what exists for vision & values (requirement F)

**Nothing stores company profile content today.** Verified:

- `clients.company` is a **free-text display string** — rendered on cards and
  CSV export; joins to nothing, groups nothing.
- The only "one company groups multiple clients" concept is
  **`billing_accounts` with `type='enterprise'`** + `coachees`
  (client → account link, unique per coach+client). But `billing_accounts` is
  purely a payer record: name, billing emails, Stripe/mandate state. No
  profile fields. It's also coach-scoped and billing-semantic — overloading
  it with vision/values would couple company content to who pays.
- No `company_profile`, `core_values`, `mission`, or equivalent
  table/column anywhere (grep-verified). The "Vision" strings that do appear
  are component labels inside individual coaching-map frameworks.

Requirement F therefore needs a new entity — e.g. `companies` (org-scoped:
name, vision, values, optional docs) + `clients.company_id` — with decisions
on who edits it (coach? supervisor?), whether `billing_accounts.enterprise`
rows link to it, and how it enters the AI context (system-prompt section in
`buildChatContext`, same pattern as goals).

---

## 10. Migration / deploy state (matters for sequencing)

Highest migration: **057**. Ledger status (CLAUDE.md + files):

| Migration | What | Status |
|---|---|---|
| 044 client_tokens (portal magic link) | | **APPLIED** |
| 045 portal chat tables | `portal_conversations`/`portal_messages` | **PENDING** |
| 046–050 (signature owner, calendar/transcript-source, supervisor bootstrap, coaching hours, note-sent gate) | | **APPLIED** |
| 051 `coaches.booking_url` | portal booking button | **PENDING** |
| 052 portal FTS (`portal_search`, search vectors) | | **PENDING** |
| 053 `portal_access_log` + `portal_onboarded` + `portal_chat_context` | | **PENDING** |
| 054 `client_credentials` (portal password) | | **PENDING** |
| 055 `client_frameworks` | session-named frameworks | **PENDING** |
| 056 invoice reminder ladder | | **APPLIED** (prod) |
| 057 coach plans / admin command center | | **PENDING** |

So **7 pending**, five of them portal-backing (045, 051, 052, 053, 054, 055).
Portal code is written defensively (missing tables degrade: chat context →
recency-only, search → ILIKE fallback, tour → re-offers, password login →
always fails, frameworks → nudge-derived list) — but the ZF build sits on top
of several of these, so the build plan should front-load applying them.
House rule: every schema change ships as a numbered `.sql` in
`supabase/migrations/` **plus** a copy/paste block in chat; Jeff applies by
hand in the Supabase SQL editor and confirms before dependent code deploys.
All new tables get `ENABLE ROW LEVEL SECURITY` with no policies
(service-role-only access), plus an `org_id` column per the 042 pattern.

---

## 11. Gap analysis — requirement by requirement

| Req | Exists today | Gap |
|---|---|---|
| **A** ZF PDF upload + client viewing | 4 MB multipart upload routes; unpdf/mammoth extraction; private bucket + 300 s signed-URL serving; the frameworks card's authorize-then-redirect PDF pattern | No per-client document store (new table + storage path/bucket); no coach UI to upload "an assessment" onto a client; no portal card to view it. 4 MB cap may pinch on graphics-heavy ZF PDFs; no OCR for scanned PDFs. |
| **B** AI dialogue over the report w/ standards | Portal chat (streaming, persisted threads, retrieval, rate limits) with `PORTAL_CHAT_VOICE_STANDARDS` already in the system prompt; standards doc §9 assistant block unused and available; ICF rubric encodes the coaching philosophy | ZF report text isn't in chat context (context = goals + transcripts + sent notes). Needs: extract-and-store the report text at upload, add a context section (and/or index into the 052 vectors for retrieval), plus ZF-specific dialogue guidance (debrief flow, strengths-based framing) layered on the shared voice floor. |
| **C** Per-client ZF toggle | Nothing — verified **no feature-flag column or table exists**; only per-client booleans are agreement/recording/onboarding flags | New column (e.g. `clients.zf_enabled` or a jsonb `portal_features`) + coach-side toggle UI + portal conditional rendering + route-level gating (a flag that only hides the card but leaves routes open would leak). |
| **D** Client sets goals + measures from portal | Full goal structure `{title, description, metrics[]}` + shared editor helpers + read-only portal display | No portal write path. Needs a portal goals route (scoped to session clientId), an editing UI (can mirror `GoalRows`), and an authorship decision (extend `source` or add a field; today it only encodes manual vs generated, and client writes into the same sacred column the coach edits). AI-assisted goal-setting via chat would also be new (chat currently has no tools/write ability — it only talks). |
| **E** Portal-only clients (no coach content, maybe no coach) | Portal reads degrade gracefully to empty for a client with no transcripts/notes; DB doesn't require a coach link | Client creation always links a coach; sign-in email requires a coach's Gmail; coach app is the only admin surface. Decide: nominal house-coach ownership (cheap) vs true coach-less mode (needs transactional email + new admin surface). Empty-state portal UX (no sessions/notes cards, chat context without transcripts) also needs design. |
| **F** Company vision & values shared across a company's clients | Nothing (`clients.company` free text; enterprise billing accounts are payer-only) | New `companies` entity + client link + edit surface + injection into chat context and goal-setting prompts. |
| **G** Personnel review uploads feeding AI | Portal chat upload extracts PDFs/docx but is deliberately ephemeral (one turn, never stored) | Persistent client-document storage (same new table as A, `kind='personnel_review'`), consent/visibility rules (does the coach see it?), and inclusion in chat context/retrieval. |
| **H** AI task creation | `actions` table + public complete-token loop + coach-side UI | Portal has zero access to `actions`; chat has no tool-use. Needs portal actions read/write routes, an authorship marker, coach visibility of client/AI-created tasks, and either explicit UI ("save these as tasks") or tool-use in the chat loop — the latter is a new pattern for the app (all current AI calls are single-shot text/JSON). |

---

## 12. Reusable patterns & invariants to preserve

**Patterns worth reusing in the build:**
- Authorize → 300 s signed URL → 302 (frameworks PDF route) for serving ZF PDFs.
- `communications`-as-gate concept: the portal only shows what was
  deliberately shared — the ZF card should have an equally explicit
  "surfaced to client" moment (the toggle, or the upload itself).
- Defensive reads around pending migrations (`.then(ok, fallback)`).
- Fire-and-forget + localStorage job tracker for any long AI step.
- `lib/nudges/llm.ts` as the template for new single-shot AI calls
  (model env var + retired-guard + timeout/retry + fence-stripping parse).
- 052's FTS shape (generated `search_vector`, compound `(client_id, vector)`
  GIN, `websearch_to_tsquery`, sentinel highlighting) if ZF/personnel-review
  text should be searchable/retrievable.
- The block registry spec (`spec/TLW_Block_Registry_Architecture_v1.md`)
  governs the **coach** workspace only; the portal home is plain JSX — no
  obligation to blocks there, but read it before touching `clients/[id]`.

**Security invariants any new portal feature must keep:**
- Every query scoped to the session `clientId`; id+client double-filter on
  single-row loads; 404 (never 403) on misses.
- `clients.key_info` and the `notes` table never cross the portal boundary;
  no coach-private field in any portal payload or AI prompt.
- Tokens stored hashed, single-use, TTL'd; POST (not GET) consumption.
- Client-rendered text via sentinels/escaping, never trusted HTML outside the
  sandboxed-iframe pattern; uploaded content treated as text, never executed.
- Rate limit + audit new portal write/AI routes via `logPortalAccess` /
  `checkPortalRateLimit`.
- New client-facing AI generations include the appropriate
  `lib/writing-standards.ts` block (house rule).
- New tables: RLS enabled (no policies), `org_id` column, numbered migration
  with copy/paste SQL, applied-and-confirmed before dependent code deploys.

---

## 13. Open decisions the build prompt should settle

1. **Ownership model for portal-only clients**: house coach (minimal change;
   Jeff's Gmail sends the links; clients stay administrable in the existing
   coach app) vs true coach-less (transactional email provider — a first for
   the product — plus a new admin surface and a rethink of `resolveClientCoach`
   call sites). Also: what does "turn on ZF" administration look like for
   these clients if not the client workspace?
2. **ZF feature flag shape**: single boolean vs a `portal_features` jsonb
   (extensible to future branches of the product) — and whether the flag
   gates routes as well as UI (it must).
3. **Document model**: one `client_documents` table covering ZF reports +
   personnel reviews + company docs (kind-discriminated), where extracted
   text lives (column vs re-extract), whether it's indexed into FTS for chat
   retrieval, and coach visibility rules per kind.
4. **Goals authorship**: how client-edited goals coexist with the coach's
   "sacred" `coaching_goals` (shared column with authorship stamps vs a
   proposal/approval flow), and whether metrics become required in the ZF
   goal-setting flow.
5. **Chat capability**: keep chat read-only-with-knowledge (plus explicit
   "save as goal/task" UI outside the chat) vs give the chat tool-use to
   write goals/tasks directly — the latter is the app's first agentic AI
   surface and needs its own guardrails.
6. **Company entity scope**: standalone `companies` table vs linking off
   `billing_accounts` enterprise rows; who edits vision/values; whether the
   same entity later serves the Groups roadmap item.
7. **ZF dialogue design**: what a ZF-specific system-prompt layer adds on top
   of `PORTAL_CHAT_VOICE_STANDARDS` (debrief methodology, strengths-based ZF
   framing, how directive to be), and whether the ICF rubric's principles
   (client authorship, exploration before solutions) are distilled into it
   the way the writing standards were distilled into `writing-standards.ts`.
8. **Sequencing**: five pending portal migrations (045, 051–055) underlie
   this build — apply-and-verify them first, or fold them into the ZF
   migration series.
