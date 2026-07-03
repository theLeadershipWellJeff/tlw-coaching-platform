# theLeadershipWell Coaching Platform — Current State & Next Builds

**Date:** July 3, 2026
**Repo:** `theLeadershipWellJeff/tlw-coaching-platform` · Deployed on Vercel from `main` at `theleadershipwell.online`
**Purpose of this document:** a complete, self-contained briefing for strategizing the next major builds. It contains everything needed to understand the app's architecture, data model, conventions, and current feature set — and to draft build prompts that will be executed back in the codebase with Claude Code.

---

## 1. What the app is

A coaching-practice platform built for Dr. Jeff Holmes (theLeadershipWell), an executive/leadership coach. It is currently a **single-coach product with multi-coach seams** — every table and API is coach-scoped, but only Jeff (and a supervisor role) use it today. The four pillars in production:

1. **Session prep** — pulls a client's history (Coach Accountable notes, transcripts, coaching goals) and uses Claude to generate a personalized prep email sent via Gmail, with a client-facing agenda fill-in link.
2. **Coaching scorecard (Practice)** — scores recorded session transcripts against the ICF 2025 Core Competencies refined by theLeadershipWell's proprietary rubric (spec v0.4 + v0.5/v0.5.1/v0.5.2 deltas). Deterministic gates and metric thresholds are enforced in code; judgment calls live in the Claude prompt. Includes coach self-scoring and coach **growth areas** (a separate AI pass against coach-defined development focuses).
3. **Client workspace** — a per-client hub: rich note editor with live ACTION/INSIGHT capture, coaching goals, agreements (e-sign), scheduling with conflict checking, branded email, nudges, communications log, transcripts, agenda responses.
4. **Business Center** — billing accounts, engagements, billing runs, Stripe hosted invoices, billing reminders, revenue/coaching-hours analytics.

Cross-cutting systems: **between-session nudges** (AI-drafted, coach-reviewed), a **vault "mind garden"** (an Obsidian/GitHub repo of coaching frameworks indexed into the app and used to draft framework nudges), **external booking capture** (Calendly/HubSpot → Google Calendar → app), and a **customizable dashboard** (coach-arranged card layout).

---

## 2. Stack & operational facts

- **Next.js 14 (App Router) + TypeScript + Tailwind.** React 18, TipTap editor.
- **Supabase (Postgres)** — accessed **only** via the service-role key server-side (`lib/supabase/server.ts#getSupabaseAdmin`). All tables have RLS enabled with **no public policies**; tenant isolation is enforced in application code, **not** RLS.
- **NextAuth with Google OAuth** — coach identity is the signed-in Google email. Scopes include Gmail send, Calendar read/write (`calendar.events`), Drive readonly. `coaches.google_refresh_token` is stored for unattended sends/reads (treat as a credential). **Adding a scope requires the coach to sign out and back in.**
- **Anthropic SDK** for all generation/scoring (models resolved via env with retired-model-id guards; default `claude-sonnet-4-6`; env overrides `SCORING_MODEL`, `NUDGE_MODEL`, `GOALS_MODEL`, `SUGGEST_MODEL`).
- **Stripe** for invoicing (hosted invoices only, `days_until_due: 30`; webhook `POST /api/billing/webhooks/stripe` handles `invoice.paid`).
- **Vercel Cron** (hourly, `CRON_SECRET` Bearer): `/api/cron/reminders`, `/api/cron/nudges`, `/api/cron/vault-sync`, `/api/cron/calendar-sync`, `/api/cron/billing-reminders`.
- **No automated test suite.** Verification = `npx tsc --noEmit` + `npm run build` before every commit; pure logic verified with throwaway node scripts.
- **Migrations are applied by hand** — every schema change is delivered as a numbered `.sql` file in `supabase/migrations/` AND pasted as a copy/paste SQL block for the Supabase SQL editor. Never assume a migration is applied. Current sequence runs 001–034 (two files share the 026 and 034 numbers — dashboard_layouts/coach_growth_areas and nudge_coach_note/transcript_title respectively; the next migration should be numbered 035).

### Environment variables (complete list)
`GOOGLE_CLIENT_ID/SECRET`, `NEXTAUTH_URL/SECRET`, `ANTHROPIC_API_KEY`, `COACH_ACCOUNTABLE_API_ID/_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_API_SECRET_KEY`, `JEFF_FROM_EMAIL`/`JEFF_CC_EMAIL`, `ZOOM_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET`, `INGEST_SECRET` (Zapier→ingest shared secret), `CRON_SECRET`, `DEFAULT_COACH_EMAIL`, `DEFAULT_COACH_NAME`, `VAULT_GITHUB_TOKEN` (read-only PAT on the vault repo), `VAULT_REPO` (default `theLeadershipWellJeff/TheLeadershipWell-Vault`), `VAULT_BRANCH`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Optional: `SCORING_MODEL`, `GOALS_MODEL`, `NUDGE_MODEL`, `SUGGEST_MODEL`, `AUTO_SCORE`, `DEFAULT_TIMEZONE`, `PLAUD_DRIVE_FOLDER`.

**Note for onboarding planning:** several of these are effectively *per-coach config living at app level* today (vault repo/PAT, ingest secret, default coach email, Stripe account). Multi-coach onboarding will need to decide which of these move into the `coaches` row or a per-coach settings table.

---

## 3. Architecture map

```
app/
  (authenticated)/          # signed-in coach shell (sidebar layout)
    dashboard/              # customizable card board (legos), roster, up-next, unmatched bookings, nudge suggestions
    clients/                # roster + clients/[id] workspace (+ /notes, /transcripts)
    practice/               # scorecard space, report [id], growth areas editor, add transcript
    nudges/                 # cross-client Nudge Queue + vault sync button
    business-center/        # billing: accounts, invoices, run, coaches
    library/                # Templates + PDF Resources folder system + agreement master editor
    groups/                 # ComingSoon stub (next build)
    templates/              # ComingSoon stub
    account/                # timezone, scheduling settings, vault panel, signature, supervisor email
  session/[id]/             # standalone prep-email generator (older flow, kept for direct links)
  sign/[token]/             # PUBLIC agreement signing page (token = credential)
  agenda/[token]/           # PUBLIC agenda fill-in page (token = credential)
  api/                      # all server-side route handlers (~40 route groups)
lib/
  supabase/                 # admin client + hand-written types (type aliases, not interfaces)
  scoring/                  # engine.ts, rubric.ts, aggregate.ts, types.ts, store.ts
  transcripts/              # parse.ts, match.ts, ingest.ts
  nudges/                   # generate, extract, dedup, draft, send, garden, llm, settings, email
  billing/                  # stripe.ts, send.ts, run.ts, sessions.ts, reminders.ts, settings.ts
  vault/                    # client.ts (GitHub REST), parse.ts (gray-matter), sync.ts, maps.ts
  growth-areas/             # score.ts (growth pass), bands.ts
  dashboard/                # card registry, layouts, validate, data hooks
  notes/                    # extract.ts, sync-actions.ts
  calendar.ts, booking-sync.ts, appointments.ts, scheduling.ts
  gmail.ts, signature.ts, communications.ts, client-note-email.ts, email-template.ts
  client-access.ts          # requireClientCoach — THE tenant gate
  actions.ts, agenda.ts, agreement-*.ts, coach.ts, authOptions.ts, url.ts, datetime.ts
supabase/migrations/        # 001–034, applied by hand
spec/                       # scoring spec v0.4 (base) + v0.5 → v0.5.1 → v0.5.2 deltas; block registry spec
scripts/generate-email-logo.py
vercel.json                 # the 5 hourly crons
```

### Tenant isolation model (critical — reuse for portal/groups)
- `coach_clients` (coach_id, client_id, role primary|shared) is the ownership link.
- Every `/api/clients/[id]/**` route is gated by `lib/client-access.ts#requireClientCoach` (returns **404, not 403**, on no access).
- Roster and search filter via `accessibleClientIds`. Client create/import call `linkCoachToClient`.
- Public token surfaces (sign, agenda, action-complete) use unguessable single-purpose tokens as the credential — this is the established pattern for any client-facing access without a login.
- **`clients.key_info` is a hard privacy wall**: coach-private notes (family, boss, etc.) that must NEVER feed any client-facing generation or surface (session prep, nudges, send-to-client, and any future portal/chat). Enforced by explicit column lists at every read site.

---

## 4. Data model (Supabase, tables as built)

All tables: RLS enabled, no policies, service-role access only, coach-scoped in code.

**Core coaching:**
- `coaches` — one per coach, keyed by Google email (get-or-create on sign-in). `role` (coach|supervisor), `timezone`, `google_refresh_token`, `supervisor_email`, `competency_focus` jsonb, `availability` jsonb (weekly bookable hours), `reminder_settings` jsonb, `nudge_settings` jsonb (incl. `vault_folder_path`, `nudge_spacing_days`), `library_labels` jsonb, `billing_settings` jsonb, `calendar_sync_token`/`calendar_synced_at`.
- `clients` — roster. `ca_client_id` (Coach Accountable link), `address`, `timezone` + `timezone_label`, `coaching_goals` jsonb `{title,description,metrics?}[]` (**the sacred goal list**, feeds prep plan), `key_info` (PRIVATE), `coaching_map`, `session_fee` (hourly), `agreement_on_file` + `recording_authorized` (**scoring Gate 1 source of truth**), `agreement_id`, `client_type` (migration 030).
- `coach_clients` — tenant link (above).
- `notes` — session notes (HTML), `ca_session_id` dedupe, `duration_minutes` (default 60, feeds revenue + hours).
- `actions` — commitments. `note_id` (nullable), `complete_token` (public click-to-complete), `completed_via`, status open|done.
- `transcripts` — ingested markdown, `content_hash` unique dedupe, `match_status` matched|needs_review|unmatched, `title` (034, coach-editable).
- `session_reports` — one per transcript, `report` jsonb = full engine output (spec §14) + denormalized scalars; `coach_self_scores`/`coach_overall`/`coach_notes` (never overwritten by machine); `reviewed` flag.
- `coach_growth_areas` + `growth_area_assessments` (026) — coach-defined development focuses with band scales; a separate Claude pass per transcript with a mandatory "Observed Gate" (no opportunity → not observed, never a low score).

**Client communication & engagement:**
- `communications` — every outbound send logged (`type` email|reminder|prep_sheet, `direction`, `status` sent|failed + `error_detail`, `gmail_message_id`). Extensible — future `sms`, `voice`, `group_id`, inbound.
- `email_signatures` — single source of truth; coach row wins over global NULL-coach row; appended **server-side** on every send.
- `nudges` (022, 034) — AI-drafted between-session messages, `status` draft|scheduled|sent|skipped, `type` action_checkin|insight|framework (reengagement reserved), `framework_slug`, `linked_resource_slug`, `scheduled_for`, `communication_id`, `coach_note` (private, never sent).
- `agenda_requests` — prep-email agenda fill-ins (token, `items` [{q,a}]).
- `agreement_templates` + `agreements` — structured master template per coach; issued agreements snapshot fully-rendered HTML, magic-link token (30d), signing captures typed name, IP, recording choice; signing **promotes `agreement_on_file`/`recording_authorized` onto the client row**.

**Scheduling:**
- `appointments` — native bookings + captured external ones. `google_event_id` (unique with coach_id), `client_id` **nullable** (unmatched external bookings = review queue), `source` native|calendly|hubspot|external, `attendee_email`, `title`, `raw_event`, status scheduled|cancelled|ignored.
- `appointment_reminders` — send log with unique `(appointment_id, kind)` claim-before-send (a reminder can never fire twice). `kind` = confirmation|nudge_<n>h.

**Vault / garden:**
- `garden_notes` + `garden_edges` (024) — derived index over the vault GitHub repo: **pointers + graph only, never note content**. A note is a leaf iff frontmatter has `nudge_eligible`/`themes`; `nudge_eligible: true` is the client-surfacing gate. Edges from `parent:`, `frameworks:`, inline `[[wikilinks]]`.

**Library:**
- `library_folders` (section templates|pdf, `kind` note|agreement|worksheet|generic), `note_templates` (rich-text templates with merge fields, `folder_id`), `pdf_resources` (private Storage bucket `library-pdfs`, 4 MB upload cap).

**Billing (027–033):**
- `billing_accounts` (Stripe customer per account, `billing_cc`, enterprise accounts can group multiple clients), `engagements` (`skip_billing`), `invoices` (`client_message`, hosted-invoice lifecycle, paid via webhook), `billable_sessions` (`appointment_id` FK), `billing_run_warnings` (calendar cross-check + subscription no-sessions warnings). `coaches.billing_settings` jsonb (preview_before_approve, auto_send_on_approve, cc_self_on_send).

**Dashboard:**
- `dashboard_layouts` (026) — per coach per `surface` (dashboard today; door open for workspace/business-center), `blocks` jsonb `[{blockId, size, order}]`, normalized on read/write by `lib/dashboard/validate.ts`.

---

## 5. Key pipelines (as built)

### 5.1 Transcript → scored report
Plaud.ai transcript → Zapier POSTs to `POST /api/transcripts/ingest` (`x-ingest-secret`) + archives md to Drive. `lib/transcripts/ingest.ts#ingestMarkdown` (shared with manual paste + per-client Drive import): (1) dedupe by canonicalized content hash (BOM/CRLF-safe); (2) parse title/front-matter incl. Plaud timestamp filenames; (3) match client — **email-first token name match, else calendar match** (coach-timezone wall-clock → instant → overlapping Google Calendar event → non-coach guest's email against roster); (4) confident match → score via `lib/scoring/store.ts#runAndStoreReport`. Uncertain → `needs_review` (never guessed), and the coach gets a needs-review email. Rescore button re-runs in place (upsert on `transcript_id`; coach self-scores survive; no email on rescore).

### 5.2 Scoring engine (`lib/scoring/engine.ts`)
Claude is prompted with the consolidated v0.4 rubric — all eight per-competency band definitions (`rubric.ts#COMPETENCY_BANDS`) + named cross-competency IP principles (Attunement Standard, Exploration Gate, Authorship Hinge, Consultant Pull Signature). **Deterministic rules enforced in code**: metric threshold flags (talk-time; flagged-emotion counts; feeling explorations 0/1/≥2; question:statement ratio — parity/statements-lead is red; consultant-move envelope math; >3 mode-drift advisory), equal-weighted overall, band derivation, and the three §10 gates recomputed arithmetically:
- **Gate 1** (v0.4.1 two-tier disclosure): no recording consent on file AND no verbal consent at open → C1 ≤ band 2. Reads `clients.agreement_on_file` + `clients.recording_authorized` + model-reported verbal consent. v0.5.2: observed verbal consent passes Gate 1 regardless; unconfirmed on-file infra caps C1 at 3.4 (`c1_ceiling`).
- **Gate 2**: no named insight at close AND no standing engagement → C3 ≤ band 2.
- **Gate 3**: zero feeling explorations → C6 ≤ band 3.

v0.5.2 also added **Layer 0 data integrity** (fail-loud into `report.integrity`): phantom-speaker collapse, telling-statements-only Q:S denominator, and **verbatim evidence verification** (every quoted evidence string must be a literal transcript substring — `verifyEvidenceVerbatim`), aggregated into `flags_for_manual_review` + a report warning banner. Consultant moves are counted **once per contiguous envelope** with spans. Prompt-side judgment: three-way emotion classification (reflection / coping inquiry / feeling exploration), evocative-reframe vs. consultant-move who-synthesises test, single-instance band-4 standard for C4–C7. `lib/scoring/aggregate.ts` rolls up dashboard numbers. A **growth pass** (`lib/growth-areas/score.ts`) runs separately against the coach's active growth areas — never changes ICF scores.

### 5.3 Notes → actions → client loop
Note editor (TipTap: Harvard outline, Tab indent, Templates dropdown, merge fields `{{client_name}}/{{today}}/{{unfinished_actions}}/{{recent_insights}}/{{coaching_goals}}`). `ACTION:` lines reconcile into `actions` on open+save (`lib/notes/sync-actions.ts`). **Send to client**: Claude drafts a client-facing narrative (`/api/notes/client-email` — note content only, never key_info); ACTION lines become a click-to-log checklist (public `GET /api/actions/complete?token=…` flips to done, branded confirmation page); INSIGHT lines render as ✦ list. Same action-link system powers prep-email action boxes (`lib/actions.ts#persistActionLinks`). Icons everywhere: action = square checkbox, insight = ✦.

### 5.4 Scheduling + reminders + external capture
Workspace Sessions card books (coach wall-clock → UTC, Google Calendar event with client guest, confirmation email, `appointments` row); conflict-aware picker (free/busy check, dual-timezone readout, availability warning). Hourly reminders cron fires enabled nudge rules; claim-before-send dedupe; **calendar is the boss** — each cron run reconciles appointments with their events (moves update, >1h move re-arms nudges, deletes cancel; sync always uses the owning coach's token; non-404 failures leave rows untouched). **External capture**: Calendly/HubSpot both write to Google Calendar, so an hourly calendar-delta sync (`lib/booking-sync.ts`, syncToken incremental, 410→full resync) upserts external bookings keyed `(coach_id, google_event_id)`; unmatched ones land in the dashboard **Unmatched bookings** panel (assign or dismiss→ignored).

### 5.5 Nudging (Phases A–C shipped)
After scoring (best-effort, never breaks scoring; skipped on rescore) or on demand: `lib/nudges/generate.ts` loads context (goals, recent notes, open actions, source transcript, surfaceable garden leaves — **never key_info**) → extract candidates (Claude) → dedup + **cap 2 per window** (priority action > framework > insight) → draft subject+body in coach voice → insert `status='draft'`. **Framework nudges** draw on the garden: named leaf (`mentioned`), theme match, or 1-hop **connection bridge** (`suggested`); draft time pulls the leaf's live content from GitHub + surfaceable neighbours; non-named origins draw an explicit bridge line. Review in the Nudge Queue or per-client NudgesCard (edit, coach_note, Send now / Schedule / Snooze / Skip). `send.ts#sendNudge` is the one send path: **spacing rule** (refuse if any outbound comm within `nudge_spacing_days`, default 4), server-side signature, coach Gmail unattended, `communications` log. Hourly cron dispatches scheduled nudges; only the coach ever moves a nudge to scheduled.

### 5.6 Vault garden sync
`lib/vault/sync.ts#syncGarden`: GitHub tree → .md under `vault_folder_path` → parse frontmatter (gray-matter) → keep leaves → upsert `garden_notes` + prune → resolve link titles → rebuild `garden_edges`. Manual button + hourly cron. Content never stored — always read live at draft time. Also powers the **coaching map structure pop-up** (`/api/vault/map` finds a vault note by title, parses `### NN · Component` + `> [!question]` callouts; hard-coded `MAPS` registry is the offline fallback).

### 5.7 Billing (Business Center)
`billing_accounts` → `engagements` → billing runs (`lib/billing/run.ts`) assemble `billable_sessions` (note durations + appointments; half-hour units, 1-hour minimum past 15 min) → review/approve → `lib/billing/send.ts` sends **Stripe hosted invoices** (no card on file needed; client can save card/enable autopay). Webhook marks paid. `billing_run_warnings` surface calendar cross-check discrepancies. Enterprise grouping in the run UI is a tracked open item.

---

## 6. Conventions & invariants (must-follow when building)

1. **Migrations**: numbered `.sql` in `supabase/migrations/` + copy/paste block in chat; new tables get `ENABLE ROW LEVEL SECURITY` (no policies); never code against an unconfirmed migration. Next number: **035**.
2. **Tenant gate**: every client-scoped route through `requireClientCoach` (404 on no access). New surface areas (portal, groups) need their own explicit, auditable gates and route prefixes.
3. **key_info wall**: never crosses into anything client-facing. Enforce by column lists, not by trust.
4. **Email**: all sends via the coach's Gmail (`lib/gmail.ts#sendCoachHtmlEmail` works unattended via refresh token); signature appended server-side; **every send logged to `communications`** (sent or failed, never silent); PNG logo only (SVG stripped by mail clients); absolute links via `lib/url.ts#getBaseUrl`.
5. **Public client surfaces** use unguessable single-purpose tokens (agreements, agenda, action-complete). Follow this pattern until the portal auth layer exists.
6. **Types** are hand-written in `lib/supabase/types.ts` as `type` aliases (not interfaces).
7. **Never use the Supabase admin client from a `"use client"` file.**
8. **Best-effort side effects**: calendar/email hiccups never lose a booking; nudge generation never breaks scoring; a flaky free/busy read never blocks a booking.
9. **Claude model calls** go through per-feature resolvers with retired-model-id guards; model ids come from env with safe defaults.
10. **Verify before commit**: `npx tsc --noEmit` && `npm run build`. PRs are squash-merged to `main`; Vercel auto-deploys `main`.
11. **Block registry (planned)**: the client workspace is slated to move to a config-driven block/slot renderer (`spec/TLW_Block_Registry_Architecture_v1.md`) — read before refactoring the workspace. The dashboard already ships the "legos" pattern (`dashboard_layouts` + card registry + validator), which is the working precedent.
12. **CLAUDE.md** in the repo is the living working-notes file — keep it updated as features land (it currently lags the code on billing/growth-areas/dashboard-legos; this document is the corrected snapshot).

---

## 7. What's shipped (condensed checklist)

- Transcript ingest (Zapier/Plaud + Drive import + manual paste) → client match (email/name/calendar) → ICF scoring v0.5.2 with gates, integrity layer, rescore; needs-review queue with previews + coach email notice.
- Coach self-scoring, supervisor email, suggested moves, emailed scorecards, **coach growth areas** (separate AI pass, Observed Gate).
- Client workspace: notes (TipTap, templates, merge fields), ACTION/INSIGHT capture with persistence + click-to-complete loop, coaching goals (+metrics, feed prep plan), key info (private), coaching map with live vault-drawn structure pop-up, send-to-client narrative email.
- Agreements: structured master template editor, issue → public e-sign (token) → snapshot, recording-authorization capture, promotes Gate-1 fields, compliance flags, >7-day unsigned roster flag.
- Scheduling: conflict-aware booking, dual-timezone display, availability settings, confirmation + configurable reminders (claim-before-send), calendar-is-boss reconciliation, cancel.
- External booking capture (Calendly/HubSpot via calendar watch, hourly + on-demand, unmatched review queue).
- Branded email compose (review-before-send, locked signature preview), communications log + Recent Communication card.
- Nudges Phases A–C: action/insight/framework types, garden-bridged framework nudges, queue + per-client card, spacing rule, dispatch cron, private coach_note.
- Vault garden index (leaves + edges, hourly sync, account panel listing).
- Library folders (templates + PDFs), custom labels, agreement editor at `/library/agreement`.
- Business Center: billing accounts/engagements/invoices/runs, Stripe hosted invoices + webhook, billing reminders cron, billing settings, skip-billing, run warnings.
- Dashboard: customizable card board (`dashboard_layouts`), roster, up-next with skip, scorecard summary, suggested nudges, unmatched bookings; coaching-hours API (`/api/coaching-hours`).
- Session prep (older `/session/[id]` flow) + agenda fill-in public page + AgendaCard.
- Security hardening: tenant scoping (015 + `requireClientCoach`), search/notes/send route gating, Next 14.2.35, scoring-model guard, transcript hash canonicalization.

### Tracked smaller open items (GitHub issues / CLAUDE.md roadmap)
Billing-run enterprise grouping · coaching hours card in 3 places + ICF-exportable log (CSV) · capture-panel prior actions/insights (last 5) · coaching-map "Send to client" button · dashboard Emails Sent / Nudges cards clickable → modals · terser send-to-client output (bullets) · SMS delivery via Twilio (spec'd in CLAUDE.md) · background prep-sheet generation (PrepContext/PrepModal) · worksheets builder (#38) · supervisor cross-coach roll-up (#40) · calendar push (events.watch) upgrade for booking capture.

---

## 8. THE BIG FOUR — next major builds

These are the four strategic builds to plan next. For each: what exists to build on, what's already been decided, and the open questions to strategize. **The goal of the chat session this document feeds is to produce concrete build prompts (phased, with schema, routes, and acceptance criteria) to bring back to Claude Code.**

### 8.1 Client-facing portal (highest complexity, highest value)

A separate authenticated area where clients log in, see their coaching materials, and use an AI chat grounded in their own session history.

**Already decided (from the roadmap spec):**
- Separate route tree (`app/portal/*` or `app/(client)/*`) with its own middleware guard; portal APIs prefixed `/api/portal/**` — never mixed with coach routes.
- Auth: **magic-link, not Google OAuth** (clients don't have Google accounts on file). Pattern: `client_tokens` table, single-use, 24h TTL, stored hashed; rate-limit 5 sends/client/hour; session carries `clientId` (never `coachId`). CSRF on custom POST routes.
- Every query hard-scoped to the authenticated `client_id`. `key_info`, `coach_clients`, and all coach-internal fields never queried from portal routes.
- Workspace cards: Next appointment (read-only + reschedule link to the coach's booking link), Coaching goals (read-only), Transcripts (list + view), Shared notes, Frameworks (garden leaves surfaced to this client, pop-up with summary + optional linked Library PDF — needs `garden_notes.pdf_resource_id` FK), Recent communication, Contact coach (compose → coach Gmail path, logged `direction='inbound'`).
- **AI chat is the core value**: conversation list (`portal_conversations`) + persisted messages (`portal_messages`); Claude context = the client's transcripts, shared notes, goals — strictly their data; document upload per turn (Supabase Storage `portal-uploads`, TTL-purged); token budget = last N turns + transcript corpus with summarization.
- Quick search: Postgres full-text (`tsvector` on transcripts + notes), client-scoped, sub-second target.
- Onboarding tour (first login) + per-card ⓘ popovers.
- Migrations needed: `portal_conversations`, `portal_messages`, `client_tokens`, `garden_notes.pdf_resource_id`, `clients.portal_onboarded`, optional `clients.phone`.
- Suggested phases: (1) auth layer → (2) read-only cards → (3) AI chat → (4) search → (5) frameworks+PDF → (6) upload → (7) tour.

**To strategize in chat:**
- What "shared notes" means precisely (a `shared` flag on notes vs. deriving from sent emails) and what the coach's sharing control looks like.
- Chat guardrails: system-prompt boundaries (it's a reflection companion, not a coach replacement; no advice outside the coaching material?), escalation to "contact your coach," and how much coach visibility into portal chats (privacy stance — does Jeff see conversations? summaries only? nothing?).
- Whether portal usage should generate coach-side signals (e.g., "client revisited the Delegation framework 3×" → nudge candidate).
- Model + cost ceilings for portal chat; per-client rate limits.
- Branding/UX: the portal is the client's first product impression — visual identity vs. the coach app.

### 8.2 Voice nudge send (new capability — no prior spec)

Extend the nudge system so a nudge can be delivered as a **voice message**, not just email text. Nothing is built; this is greenfield on top of very solid rails (the nudge pipeline, review-before-send, `communications` log, spacing rule).

**What exists to build on:**
- `lib/nudges/send.ts#sendNudge` is the single send path — a delivery-channel branch point already exists conceptually (the SMS roadmap item planned `email | sms | both` per nudge).
- `communications.type` is extensible (add `'voice'`).
- The NudgeItem review UI is where a channel/preview control would live.
- Public token-link pattern (agreements/agenda/actions) works for a hosted "listen" page.

**To strategize in chat (key decisions):**
1. **Voice source**: (a) AI text-to-speech of the drafted nudge — possibly a cloned voice of Jeff (ElevenLabs or similar; consent/ethics = it's his own voice, but disclosure to clients should be decided), (b) coach-recorded audio in the review UI (MediaRecorder → upload), or (c) both, with TTS as the default and re-record as the override.
2. **Delivery vehicle**: email with an embedded player link to a branded hosted page (fits existing Gmail rails + `getBaseUrl` token pattern — lowest lift), vs. SMS/MMS with an audio link (requires the Twilio build), vs. actual voicemail drop (highest complexity/telephony cost).
3. **Storage**: Supabase Storage bucket (`nudge-audio`), signed URLs or public token page; retention policy.
4. **Schema sketch**: `nudges.delivery_channel` (email|voice|sms), `nudges.audio_url`/`audio_storage_path`, maybe a `voice_settings` block in `coaches.nudge_settings`.
5. **Review flow**: the coach must be able to *listen before sending* (same review-before-send doctrine as everything else). Regenerate-audio on body edit.
6. New env: TTS provider key (e.g. `ELEVENLABS_API_KEY` + voice id) and/or Twilio trio if SMS rides along.

### 8.3 Groups area (major build — architecture session needed)

`/groups` is a ComingSoon stub. The product intent is fully written; the architecture is explicitly TBD.

**Product intent (decided):**
- A **group** = named, coach-owned container, `status` active|past (archive freezes it, history stays readable).
- **Members** = existing clients (FK) **or non-client participants** (name+email only — sponsors, HR admins, observers). Both first-class. Per-group **roles**: member | admin (receives group comms, sees aggregates, co-manages) | coach (owner).
- Group workspace cards: overview (edit/archive), members (add/search/remove/role, click-through to client workspace), sessions (one calendar event, all members as guests; attendance notes), notes (group-scoped, never leak into individual workspaces unless linked), actions (assignable to group or member), communications log.
- Comms: group email compose (role-filtered subsets, one `communications` row per recipient), **group nudges** (same review-before-send; spacing rule per-recipient — flag members who recently got an individual nudge), group session reminders via the existing cron, announcement blasts.
- Group goals (jsonb, separate from client goals) + framework associations from the garden.
- Data model sketch: `groups`, `group_members` (member_type client|external), `group_notes` (or `notes.group_id` — TBD), `group_actions`, `communications.group_id`, `appointments.group_id` (client_id already nullable).
- Suggested 10-phase build order ends with a group-facing portal view through the client-portal auth layer.

**To strategize in chat:**
- The reuse-vs-parallel-table decision (`notes.group_id` vs. `group_notes`; same for actions) — leaning parallel keeps individual-client queries clean, leaning reuse keeps editors/sync-actions shared. This is the main architecture fork.
- How group sessions interact with billing (bill the enterprise `billing_account`? per-member? out of scope v1?) and with the scorecard (are group session transcripts scored? probably not v1).
- Whether the reminder/nudge crons need per-member fan-out infrastructure or can iterate inline.
- Sequencing vs. the portal (group-facing portal view depends on portal auth).

### 8.4 New-user (coach) onboarding — productization

Make the app usable by a coach who is not Jeff, signing up cold. The multi-coach seams exist (coach-keyed tables, get-or-create coach on Google sign-in, `coach_clients` tenancy, per-coach settings jsonb everywhere), but the app has never onboarded anyone.

**Known gaps to close (from the codebase):**
1. **Access control on sign-up**: today any Google account that signs in gets a coach row created. Need an allow-list / invitation / self-serve-with-approval decision, and a plan-gating story if this becomes SaaS.
2. **Per-coach config still at app level**: `INGEST_SECRET` + the Zapier/Plaud pipeline (per-coach ingest secrets? per-coach Drive folder — `PLAUD_DRIVE_FOLDER` is global), `VAULT_*` (per-coach vault repo + PAT, or vault becomes optional), Stripe account (Jeff's account is the platform's — multi-coach billing needs Stripe Connect or per-coach keys), `DEFAULT_COACH_EMAIL` fallbacks, `JEFF_FROM_EMAIL`/`JEFF_CC_EMAIL` hard-defaults (e.g. the EmailModal default Cc `jeff@theleadershipwell.com`).
3. **Signature seeding**: migration 017 seeds Jeff's signature as the global row; a new coach needs a signature-builder step (or a generated default from their name/logo).
4. **Onboarding wizard** (first sign-in): timezone → availability → reminder defaults → signature → agreement master template review (already get-or-create seeded from `lib/agreement-template.ts`) → optional integrations (Coach Accountable keys per coach? Zoom? vault?) → Google re-consent explainer for `calendar.events` (the scope-grant sign-out/sign-in dance needs to be a designed step, not a gotcha).
5. **Empty states**: dashboard/workspace/practice with zero clients, zero transcripts, zero layout — the legos default layout exists; audit every card for a useful empty state + "do this first" prompts.
6. **Branding**: logo/colors are theLeadershipWell-specific in emails (`public/logo-email.png`, locked agreement blocks, Cormorant preview). Decide single-brand (coaches under TLW) vs. white-label (per-coach branding table).
7. **Coach Accountable / Zoom** are Jeff-specific integrations — make optional and per-coach or hide behind feature flags.
8. **Supervisor role** exists (`coaches.role`); the supervisor roll-up view (#40) becomes more relevant with multiple coaches.
9. **Docs/legal**: terms, privacy policy, data-processing posture (client PII + transcripts + recordings consent chain is already unusually well-handled by the agreement system — a genuine selling point).

**To strategize in chat:**
- Business model first (solo-tool licensed to other coaches vs. multi-coach firm vs. SaaS) — it drives the Stripe architecture, allow-list design, and branding decisions.
- Minimum lovable onboarding path: which integrations are required day-1 (Google only) vs. progressive (CA, Plaud, vault, Stripe).
- Whether onboarding precedes or follows the portal/groups builds (new coaches likely need those to see full value; but onboarding hardening is cheaper before more surface area lands).

### Suggested sequencing question for chat
A reasonable default order to pressure-test: **Portal auth + read-only cards → Portal AI chat → Groups schema + workspace → Voice nudges → Onboarding hardening** (with onboarding items #1–2 done early as cheap insurance). But the right order depends on business priorities — what's driving revenue/retention now.

---

## 9. How to write build prompts to bring back to Claude Code

When chat produces a build plan, format each phase as a prompt with:
1. **Context anchor**: name the feature and point at this document's relevant section + the files/pipelines to build on (e.g. "extend `lib/nudges/send.ts`; follow the token-page pattern from `app/agenda/[token]`").
2. **Migration first**: exact schema as a numbered migration (next is **035**), additive where possible, RLS-enabled, with the copy/paste-SQL delivery convention — and instruct that code must not assume the migration is applied until Jeff confirms.
3. **Route + file plan**: which API routes (respecting the `/api/portal/**` vs `/api/clients/**` boundary), which components, which lib modules.
4. **Invariants to restate**: the key_info wall, requireClientCoach/portal-session gates, server-side signature, communications logging, best-effort side effects, tsc+build verification.
5. **Acceptance criteria**: observable behaviors ("client with expired token sees X", "coach hears audio before send is enabled").
6. **Phase boundaries**: small, shippable slices — each phase must build green (`npx tsc --noEmit` + `npm run build`) and be deployable behind its migration.

---

*End of briefing. This file lives at `APP_STATE.md` in the repo root; keep it (and CLAUDE.md) updated as the big four land.*
