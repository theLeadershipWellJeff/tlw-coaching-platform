# CLAUDE.md — theLeadershipWell Coaching Platform

Working notes for Claude (and Jeff) on this codebase. Keep this current as the
app evolves.

## What this is

A coaching platform for Dr. Jeff Holmes (theLeadershipWell). Two pillars:

1. **Session prep** — pulls a client's history (Coach Accountable notes, Zoom/
   transcript context) and uses Claude to generate a personalized prep email,
   sent via Gmail.
2. **Coaching scorecard** — scores recorded sessions against the ICF 2025 Core
   Competencies refined by theLeadershipWell's standards. The **consolidated
   spec `spec/theLeadershipWell_Session_Report_Spec_v0.4.md` is the single
   source of truth** — read it before touching scoring (the older `..._v0.3.md`
   is kept for history only).

Plus a **client workspace** (per-client hub) and **roster**.

## Stack & commands

- **Next.js 14** (App Router) + TypeScript + Tailwind. **Supabase** (Postgres).
  **NextAuth** (Google OAuth). **Anthropic SDK** for generation/scoring.
  Deployed on **Vercel** (production builds from `main`), domain
  `theleadershipwell.online`.
- `npm run dev` · `npm run build` · `npm run lint`
- Always run `npx tsc --noEmit` and `npm run build` before committing. There is
  no automated test suite; verify pure logic with throwaway node scripts.

## Architecture

- `app/(authenticated)/*` — signed-in app shell: `dashboard`, `clients`,
  `clients/[id]` (workspace) + `/notes` + `/transcripts`, `scorecard` +
  `scorecard/[id]`, plus `groups`/`library`/`practice`/`templates` (ComingSoon
  stubs), `account`.
- `app/session/[id]` — the standalone prep-email generator/sender (older flow).
- `app/api/*` — route handlers (all server-side).
- `lib/` — `supabase/` (admin client + hand-written types), `scoring/`
  (engine, rubric, aggregate, types, store), `transcripts/` (parse, match,
  ingest), `calendar.ts`, `drive.ts`, `coach.ts`, `authOptions.ts`,
  `email-template.ts`, `zoom.ts`, `notes/extract.ts`.
- `supabase/migrations/*` — SQL, applied by hand in the Supabase SQL editor.

### Config-driven rendering (block registry) — planned, read before touching `clients/[id]`
The client workspace is slated to move from hard-coded JSX to a **block registry +
slot model**: the page loads a layout config and renders pre-built blocks into named
slots (`SurfaceRenderer`), instead of wiring components by hand. Spec lives in
`spec/TLW_Block_Registry_Architecture_v1.md` — **read it before refactoring the
client workspace or adding new workspace panels.** Tier 1 (build now) = the registry,
slot model, validator, default layout, and the Note Editor + Actions/Insights panel
rebuilt **as blocks**. Tier 2 (`workspace_layouts` per-coach override) and Tier 3
(AI customization dialogue) are reserved seams, **not** to be built yet. Tenant
isolation = every block's data access filtered server-side by the session `coachId`
(NextAuth, not Supabase RLS).

## Data model (Supabase)

All tables are RLS-enabled with **no public policies** — reached only via the
service-role key (`getSupabaseAdmin()` in `lib/supabase/server.ts`). Never use
the admin client from a `"use client"` file. Types are hand-written in
`lib/supabase/types.ts` (note the `type` aliases, not interfaces — see the
comment there).

- `clients` — roster. `ca_client_id` links to Coach Accountable. Has `address`,
  `timezone`, `coaching_goals` (jsonb `{title,description}[]`).
- `notes` — in-app/imported notes (HTML content). `ca_session_id` dedupes CA
  imports (partial unique index on `(client_id, ca_session_id)`).
- `actions` — commitments/follow-ups.
- `coaches` — one per coach, keyed by signed-in Google email
  (get-or-create). `role` (coach|supervisor), `timezone`,
  `google_refresh_token` (for unattended calendar reads — **treat as a
  credential**).
- `transcripts` — ingested transcript md + match result. `content_hash` (unique)
  dedupes ingestion. `match_status` = matched|needs_review|unmatched.
- `session_reports` — one scored report per transcript. `report` jsonb holds the
  full engine output (spec §14); scalar columns are denormalized for
  aggregation. `coach_self_scores`/`coach_overall`/`coach_notes` = the coach's
  parallel assessment, which **never overwrites** the machine score.

## Key pipelines

### Transcript → scored report
Plaud.ai finishes a transcript → Zapier POSTs it to `POST /api/transcripts/ingest`
(shared-secret `x-ingest-secret`) and also archives the md to a Drive folder.
`lib/transcripts/ingest.ts#ingestMarkdown` is the shared core (also used by the
manual paste and per-client Drive import):
1. dedupe by content hash;
2. parse (`lib/transcripts/parse.ts`) — title/front matter, **timestamp** title
   handling (Plaud names files `YYYY-MM-DD HH:MM:SS`);
3. **match client** — name match (`lib/transcripts/match.ts`, token-based,
   fail-loud) → else **calendar match** (`lib/calendar.ts`): convert the local
   wall-clock time (coach's timezone, DST-correct) to an instant, find the
   overlapping Google Calendar event, read the client off the **non-coach
   guest's email** (exact roster match) → name fallback;
4. on a confident match, **score** (`lib/scoring/store.ts#runAndStoreReport`).
Uncertain/ambiguous matches → `needs_review` (never guessed).

### Scoring engine (`lib/scoring/engine.ts`)
Prompts Claude with the consolidated v0.4 rubric — the **per-competency band
definitions** (rendered from `rubric.ts#COMPETENCY_BANDS`, all eight) and the
named **cross-competency IP principles** (`CROSS_COMPETENCY_PRINCIPLES`:
Attunement Standard, Exploration Gate, Authorship Hinge, Consultant Pull
Signature) — then **enforces the deterministic rules in code**: the metric
threshold flags (talk-time, flagged emotion <2/=2/>2, feeling explorations
0/1/≥2, **question:statement computed from the ratio** — parity or statements-lead
is red, consultant-move math + >3 mode-drift), the equal-weighted overall, band
derivation, and the **three §10 gates**. Gate 3 (zero feeling explorations → C6 ≤
band 3) is recomputed arithmetically; **Gate 1** (two-tier disclosure, v0.4.1 —
no recording consent on file AND no verbal consent to record at open → C1 ≤ band 2)
is recomputed from the client record (`store.ts` reads `clients.agreement_on_file`
+ `clients.recording_authorized` — consent is "on file" when an agreement exists
and the client didn't explicitly decline recording) + `verbal_consent_to_record`
(model); a session with no agreement still surfaces `session.agreement_gap` as an
administrative follow-up (no extra penalty);
**Gate 2** (no named insight at close AND no standing engagement → C3
≤ band 2) is applied as a code ceiling off a boolean the model returns. The finer
judgment calls live in the prompt: the **three-way emotion classification**
(reflection / coping inquiry / feeling exploration — coping inquiry counts as
neither a flagged emotion nor an exploration), the **evocative-reframe vs.
consultant-move** who-synthesises test, and the **single-instance band-4
standard** for C4–C7. Output carries `gates_triggered` (per competency + session)
and `session.standing_engagement`; shape = spec §14 (`lib/scoring/types.ts`).
`lib/scoring/aggregate.ts` rolls reports into the dashboard/scorecard numbers.

**Rescore.** `runAndStoreReport` upserts on `transcript_id`, so re-running it
replaces the machine report in place (coach self-scores/notes live in separate
columns and survive; a `reviewed` report stays reviewed). The report page has a
**rescore** button (`POST /api/reports/[id]/rescore`) to refresh a session's
score against the current rubric after the engine is updated — no email is sent
on a rescore (`runAndStoreReport(..., { sendEmail: false })`).

### Client matching gotcha (important)
Match on **email first**, then **full first+last name as whole words** — never a
single short fragment. A client stored with a one-letter last name (e.g. "Michel
W") previously substring-matched any title containing "w". Fixed in
`/api/sessions` (dashboard) and the transcript matcher is email-first by design.

### CA notes / clients import
`/api/clients/import` (clients) and `/api/clients/[id]/import-notes` (notes,
`Session.getAll`). Both idempotent. Roster has bulk buttons; the notes button
loops active clients one request at a time with progress.

### Client workspace (`app/(authenticated)/clients/[id]`)
Name card (gear → edit), Transcripts + Notes summary cards, New note / Send
email / Import-from-Plaud actions, Coaching goals card (generate from notes via
`/api/clients/[id]/goals/generate`, or edit by hand). Email composes+sends via
Gmail (`/api/email/send`). Plaud import: `/api/drive/transcripts` lists the
Drive folder; `/api/clients/[id]/import-transcripts` imports picks (forced to
that client), then the UI scores each.

### Session-notes panel (`clients/[id]/NotesPanel.tsx`)
The right-hand rail carries the live ACTION/INSIGHT capture (`CaptureGroup` —
newest-first, 5 visible with a "Show all" expander; the notes list does the same)
**plus** persistent, per-client context loaded from the client record: **Key info**
(`clients.key_info`,
freeform reference — boss/spouse/kids), **Coaching map** (`clients.coaching_map`,
a pulldown of the practice's maps — defined in `CoachingMapCard.tsx#MAPS`: The 6
Components / The Airplane Model / First 90 Days / Who I Am Becoming; `blurb` field
is the future home of click-to-view framework descriptions), and **Engagement
goals** (the same `clients.coaching_goals` as the workspace card, edited via the
"Client goals" modal). All three save with PATCH `/api/clients/[id]`
(`KeyInfoCard`, `CoachingMapCard`, `EngagementGoalsCard`).

**Key info is PRIVATE to the coach.** `clients.key_info` must never feed any
client-facing generation (session prep, nudges, the "send to client" draft) —
those use the note content only. Keep it out of those prompts.

**Captured actions persist + are checkable.** A note's `ACTION:` lines are
reconciled into the `actions` table (note_id set) on every open and save —
`lib/notes/sync-actions.ts#syncNoteActions`, called from the note PATCH and
`POST /api/clients/[id]/notes/[noteId]/actions` (the editor POSTs it on mount so
older notes persist on view). So a note's actions flow to the workspace
`ActionsCard` and the `{{unfinished_actions}}` field without a "send to client".
The capture-panel checkbox toggles status coach-side via
`PATCH /api/clients/[id]/actions/[actionId]` (`completed_via = 'coach'`; the
client email link still uses public `/api/actions/complete`). Sync keeps `done`
rows but drops still-`open` rows whose line the coach edited away; `send-note`'s
`persistActionLinks` dedupes on the same `(note_id, description)`, so tokens stay
stable. A just-typed line shows a plain (not-yet-checkable) box until autosave
persists it.

New note titles default to `"<client name> · <date>"` (`NotesPanel#newNote`).
The editor toolbar has a **Templates** dropdown (`RichNoteEditor`, gated by
`enableTemplates`) that inserts a saved Library template at the cursor.

**Custom Library labels (migration 019).** A coach can rename the fixed Library
home nodes (the Templates / PDF Resources / Coaching Agreement tiles) and the
virtual **Unfiled** bucket via an inline pencil on each (`LibrarySpace#HomeNode` /
the Unfiled row). Labels persist per coach on `coaches.library_labels` (jsonb,
keyed `templates|pdf|agreement|unfiled`; absent = built-in default) via
`PATCH /api/coach { libraryLabels }`, read from `GET /api/coach`. Internal section
keys (`templates|pdf`) are unchanged — only display labels.

### Library = folder system (`library/LibrarySpace.tsx`)
The Library is a two-section folder browser (migration 010): **Templates** and
**PDF Resources**. `library_folders` (coach-scoped, `section` = templates|pdf)
are the folders; CRUD via `/api/library/folders` + `/api/library/folders/[id]`
(delete cascades the folder's contents — for PDF folders the Storage objects are
removed first). Navigation state lives in `LibrarySpace` (home → section →
folder).

- **Templates folders** hold `note_templates` (now carry `folder_id`; null =
  Unfiled, surfaced as a virtual folder for pre-folder templates). Managed by
  `FolderTemplates` — same builder as before, scoped to the folder. `/api/templates`
  takes `?folderId=<uuid|none>` (omit it → all, for the note editor dropdown);
  POST/PATCH accept `folder_id` (PATCH = move).
- **PDF folders** hold uploaded files. `pdf_resources` rows index files in the
  private Storage bucket `library-pdfs` (created on first upload via
  `lib/library-storage.ts#ensurePdfBucket`). `FolderPdfs` uploads (multipart →
  `POST /api/library/pdfs`, **4 MB cap** — serverless body limit), views (signed
  URL via `GET /api/library/pdfs/[id]`), deletes.

Folders carry a `kind` (note|agreement|worksheet|generic; migration 011), kept for
worksheets; the coaching agreement is no longer a folder template (migration 018,
below).

### Coaching agreement system (`agreement_templates`, `agreements`; migration 018)
A single **structured master template per coach** (`agreement_templates`,
get-or-create seeded from `lib/agreement-template.ts`), edited at
**`/library/agreement`** (`AgreementTemplateEditor`, two-column editable sections
+ interleaved ICF/legal **locked** blocks + live Cormorant preview; `GET/PUT
/api/agreements/template`). The locked text and the **document renderer**
(`renderAgreementHtml`) live in `lib/agreement-template.ts` so the editor preview,
the issue review, the signing page, and the signed snapshot can never drift.

**Issue** (client workspace Agreement card → `IssueAgreementModal`: details →
payment → review with a **scroll-to-bottom gate** → send; also the roster's
"issue now?" prompt after creating a client, via `/clients/[id]?issue=1`).
`POST /api/agreements/issue` captures the per-client merge vars, snapshots the
fully-rendered document into `agreements.body_html`, mints a 30-day magic-link
token, and emails the client a **CTA delivery vehicle** (`buildAgreementEmailHTML`,
hosted PNG logo — never SVG) linking to `${getBaseUrl()}/sign/<token>`.

**Sign** at the **public** page `app/sign/[token]/page.tsx` (server-renders the
snapshot + validates not-found/expired/already-signed; the GET is folded into the
server component). `SigningForm` collects a **one-of-two recording-authorization**
choice + a **typed-name acceptance** (≥2 chars). `POST /api/agreements/sign`
(public, token = credential) validates server-side, writes `status='active'`,
`signed_at`, `recording_authorized`, `signer_typed_name`, `signer_ip`, an
immutable `signed_agreement_html`, invalidates the token, **promotes
`agreement_on_file` + `recording_authorized` onto the client record**, then emails
the coach a notification + the client their copy (both via
`lib/gmail.ts#sendCoachHtmlEmail`, unattended).

The workspace `AgreementsCard` shows none/awaiting/active, recording status, and
the **no-recording compliance flag** (the one Signal-Orange instance), with
Issue/View/Re-issue. The same non-dismissible no-recording banner shows in the
client header (`ClientDetail`). The roster flags an agreement **unsigned > 7 days**
(amber dot; `pendingAgreements` from `GET /api/clients`). `clients.agreement_on_file`
+ `clients.recording_authorized` are the **source of truth the scoring Gate 1
reads** (see the scoring engine section). Status vocabulary is `sent | active`
(`none` = no row).

### Note templates + merge fields
`note_templates` (coach-scoped, migration 008) holds reusable rich-text note
templates, organized into Library folders (above), CRUD via `/api/templates` +
`/api/templates/[id]`. They surface in the note editor's Templates dropdown.

Templates can embed **merge fields** (`lib/note-template-fields.ts`: `{{client_name}}`,
`{{today}}`, `{{unfinished_actions}}`, `{{recent_insights}}`, `{{coaching_goals}}`),
dropped in via the editor's **Insert field** dropdown (`RichNoteEditor`,
`enableFields`, shown in the Library editor). When a template is inserted into a
client's note, the Templates dropdown POSTs it to `/api/clients/[id]/template-render`,
which resolves the tokens against live data (open `actions`, INSIGHT: lines from
recent notes, goals) before inserting.

### Note editor (`RichNoteEditor`)
TipTap. Toolbar: bold/italic, Title (H2)/Sub-title (H3), bullet list, numbered
list, and **Harvard outline** (I. A. 1. a. i.) — the last two share the
orderedList node, told apart by an `outline` attribute (CSS `.tlw-prose
ol.tlw-outline` styles the levels by depth). **Tab** nests a list item or
indents a paragraph (custom `Indent` extension → `data-indent`/margin); Shift-Tab
reverses. `enableTemplates`/`enableFields`/`clientId` gate the dropdowns.

### Send to client (`SendToClientModal`) + action completion loop
The button at the bottom of a note drafts a clean, client-facing **narrative**
via Claude (`/api/notes/client-email` → `{subject, body}`; **note content only,
never key_info** — and it deliberately omits the ACTION:/INSIGHT: items, which
render as their own sections). The captured `INSIGHT:` lines become an Insights
list (✦) and the `ACTION:` lines an interactive checklist. Sending goes through
`POST /api/clients/[id]/send-note`, which:
1. persists each action as an `actions` row with an unguessable `complete_token`
   (re-uses the row for the same note+description across re-sends);
2. builds the HTML email (`lib/client-note-email.ts`) where each action's box is
   a click-to-log link `${getBaseUrl()}/api/actions/complete?token=…`;
3. sends HTML via Gmail (Cc the coach).

`GET /api/actions/complete?token=…` is **public** (the token is the credential)
— it flips the action to `done` (idempotent) and returns a branded confirmation
page. The client workspace `ActionsCard` (`/api/clients/[id]/actions`) shows the
sent items and their live status, closing the loop. Email can't run live
checkboxes, so the "checkbox" is a styled link — the one-click GET is the
tradeoff (watch for link-prefetch false positives).

Icons are consistent everywhere: **actions = a square checkbox**, **insights =
✦** (capture panel `CaptureGroup`, the email, and `ActionsCard`).
`lib/url.ts#getBaseUrl` builds absolute email links (NEXTAUTH_URL → VERCEL_URL →
localhost).

`lib/actions.ts#persistActionLinks` is the shared core (insert/reuse a row with a
token, return a link per action). The **session-prep email** uses the same system:
`/api/send` looks up the client (email → name), persists `content.actions` (note_id
null), and passes the per-action links into `buildClientEmailHTML(..., actionLinks)`
so the prep "Your Action Items" boxes are click-to-log too. No client match → plain
boxes, email still sends.

### Scheduling next sessions + reminders (`appointments`)
At the end of a session the coach books the next one from the client workspace
**Sessions card** (`ScheduleCard`): a date/time/length form → `POST
/api/clients/[id]/schedule`. The route converts the coach's wall-clock pick to an
instant (`lib/calendar.ts#zonedWallClockToUtc`, coach timezone), creates a Google
Calendar event with the client as guest (`createClientEvent`, **needs the
`calendar.events` scope** — coach must re-consent once), records an `appointments`
row, and emails a **confirmation** (`lib/appointment-email.ts` →
`lib/gmail.ts#sendCoachHtmlEmail`, which sends via the coach's stored refresh
token so the same path works unattended). Calendar/email are best-effort — a
hiccup never loses the booking.

**Conflict-aware picker + dual-timezone read-out (migration 020).** As the coach
picks a slot, `ScheduleCard` calls `POST /api/clients/[id]/schedule/check`
(debounced) and shows it in **both** the coach's and the **client's** timezone
(`clients.timezone`, set via the edit-client modal dropdown; prompts to add it if
unset) so the two can agree on the call. The check runs a Google **free/busy**
query (`lib/calendar.ts#getCalendarConflicts`, covered by the already-granted
`calendar.readonly` scope — no re-consent): a real conflict turns the Schedule
button **grey + disabled**; a free, verified slot shows green and the button is
**blue**. It also flags a pick **outside the coach's set availability**
(`lib/scheduling.ts#isWithinAvailability`) as an amber warning that never blocks
(product decision: warn, still allow). The conflict guard is client-side; the POST
route stays best-effort (a flaky free/busy read never locks out a booking). The
upcoming-sessions list renders in the coach's timezone (passed from `ClientDetail`).

**Scheduling settings (Account → Scheduling, `SchedulingSettings`).** Per-coach
**weekly availability** (`coaches.availability` jsonb, keyed "0".."6" = Sun..Sat,
each `{enabled,start,end}` in the coach's zone) and **reminders**
(`coaches.reminder_settings` jsonb, `{confirmation, reminders:[{hoursBefore,enabled}]}`).
Canonical shapes, defaults (Mon–Fri 9–5; confirmation + a single 24h nudge), and
pure helpers live in **`lib/scheduling.ts`** (dependency-free, shared by the
settings UI, scheduler, schedule API, and cron). NULL columns = defaults, so
existing coaches are unchanged. Read/written via `GET`/`PATCH /api/coach`
(`availability`, `reminderSettings`); the GET always returns a normalized total
shape. `lib/scheduling.ts` also centralizes the shared timezone option list
(`orderedTimeZones`) reused by the timezone, client-edit, and scheduling UIs.

**Reminders = confirmation + configurable nudges.** The confirmation fires at
booking (if enabled); each enabled `reminder_settings.reminders` rule is a
pre-session nudge at its own lead time. `lib/appointments.ts#sendAppointmentReminder`
is the shared send+log: it CLAIMS the `(appointment_id, kind)` slot in
`appointment_reminders` (unique index) before sending, rolling back on failure —
so a reminder can never fire twice. `kind` = `confirmation` or `nudge_<n>h`
(`lib/scheduling.ts#reminderKind`; 24h keeps the legacy `nudge_24h` name for
dedupe). Nudges are driven by **Vercel Cron** (`vercel.json` → hourly `GET
/api/cron/reminders`, gated by `CRON_SECRET` as a Bearer token): it scans
`scheduled` appointments in a 14-day window and, per session, fires every enabled
rule whose lead-time window has opened (`scheduled - hoursBefore ≤ now ≤ scheduled`).

**Calendar is the boss — appointments track it.** The coach typically reschedules
by dragging the event in Google Calendar. Each cron run first **reconciles** every
upcoming appointment with its event (`lib/calendar.ts#getClientEventState` →
`lib/appointments.ts#syncAppointmentFromCalendar`): a moved event updates
`scheduled_at`/duration, and a move of **>1h re-arms all nudges** (deletes the
`nudge_%` rows) so every reminder shifts with the session; a deleted event cancels
the appointment. The workspace list (`GET /api/clients/[id]/appointments`) runs the
same sync on view so displayed times are fresh. Sync always uses the appointment's
**owning** coach's token (a different coach's token would 404 and wrongly cancel),
and any non-404 read failure leaves the row untouched (no cancel/move on a blip).

The Sessions card lists upcoming sessions with **cancel** (`DELETE
/api/clients/[id]/appointments/[appointmentId]` — removes the calendar event,
marks the row `cancelled`; a pending nudge then never fires). `GET
/api/clients/[id]/appointments` returns future `scheduled` rows. `UpcomingSessions`
renders them two ways: the full list in the Sessions card and a **compact** list
on the `NameCard` (below name/email). Both refetch off a shared `apptReload` key
in `ClientDetail`, bumped on book/cancel.

### Session-prep agenda fill-ins (`agenda_requests`)
When `/api/send` matches a client it also creates an `agenda_requests` row
(token) and passes `${getBaseUrl()}/agenda/<token>` into `buildClientEmailHTML`,
which renders a "Help shape our agenda" CTA at the bottom of the prep email. The
**public** page `app/agenda/[token]/page.tsx` (token = credential) shows the
prompts (`lib/agenda.ts#AGENDA_PROMPTS`); `GET/POST /api/agenda/[token]` load and
submit (stores `items` = `[{q,a}]`, status → submitted). The workspace
`AgendaCard` (`/api/clients/[id]/agenda`, latest request) shows the client's
answers (or "awaiting their response").

### Between-session nudges (`nudges`; migration 022) — Phase A
A nudge is a short, warm, client-facing message the system **drafts** after a
session and the coach **reviews before it sends** (nothing auto-sends in Phase A).
Built as an extension of existing rails — Gmail send, the `communications` log
(`type='reminder'`), the server-appended signature, and the scoring pipeline as
the trigger. Spec: `TLW_Nudging_System_Build_Handoff_v1`. **Phase A only covers
`action_checkin` + `insight`** types; `framework`/`reengagement` (and the vault
index) are reserved for later phases.

**Pipeline** (`lib/nudges/`): `generate.ts#generateNudgesForClient` is the
orchestrator — loads context (coaching goals, recent notes, **still-open** actions,
the source transcript; **never `clients.key_info`** — the key-info wall is enforced
by the column list, §3.1), then `extract.ts` (Claude → candidate list) →
`dedup.ts#applyDedupAndCap` (dedup vs. live/sent nudges; **cap = 1 action + 1
insight per window**, `settings.ts#MAX_NUDGES_PER_WINDOW`) → `draft.ts` (Claude →
subject+body in the coach voice) → insert as `status='draft'`. Both Claude calls go
through `llm.ts` (model = `NUDGE_MODEL` or `claude-sonnet-4-6`, retired-id guard
like the engine). Bounded timing only: `scheduled_for` defaults to the **midpoint**
between now and the next booked appointment, else null (coach sets it).

**Triggered** after scoring — `store.ts#runAndStoreReport` calls it best-effort
(never breaks scoring; skipped on a rescore), and on demand via `POST
/api/clients/[id]/nudges/generate` (the workspace card's "Draft nudges" button).

**Review + send.** Two surfaces: the cross-client **Nudge Queue** screen
(`/nudges`, `GET /api/nudges` coach-scoped, grouped Needs review / Scheduled) and
the per-client workspace **`NudgesCard`** (`GET /api/clients/[id]/nudges`). Both use
the shared `NudgeItem` (edit subject/body/time; **Send now / Schedule / Snooze /
Skip**). `PATCH /api/nudges/[nudgeId]` applies edits + the action (coach-scoped to
the nudge's `coach_id`). `send.ts#sendNudge` is the one send path: enforces the
**spacing rule** (§3.4 — refuses if the client got any outbound communication
within `nudge_settings.nudge_spacing_days`, default 4), appends the signature
server-side, sends via the coach's Gmail (`sendCoachHtmlEmail`, unattended-capable),
logs to `communications`, and sets the nudge `sent` + `communication_id` (shows up
in the Recent Communication card). Settings defaults are in `settings.ts`
(dependency-free, mirrors `lib/scheduling.ts`); `coaches.nudge_settings` NULL = defaults.

**Dispatch cron.** `GET /api/cron/nudges` (hourly in `vercel.json`, `CRON_SECRET`
Bearer) sends every coach-approved nudge whose `scheduled_for` has passed (`status
='scheduled'`), via `sendNudge` — so a spacing-blocked nudge stays scheduled and
retries; only the coach ever moves a nudge to `scheduled`.

### Vault connection → framework index (`frameworks`; migration 023) — Phase A-parallel
The coach's mind garden (the **`TheLeadershipWell-Vault`** GitHub repo) is the
canonical source for frameworks. The deployed app **only reads** it (a single
app-level fine-grained PAT, `contents: read`) and builds a **derived index** — the
`frameworks` table holds **pointers + the 1-hop wikilink graph only, never note
content**. Authoring is collaborative (Claude Code + Obsidian write to the repo);
Obsidian Git pushes the coach's edits up. Spec: handoff §5–§6.

**Read (`lib/vault/`):** `client.ts` is read-only GitHub REST via `fetch` (no octokit)
— `getTree` (one recursive call → paths + per-file SHAs + root tree SHA), `getBlob`,
and `getContentByPath` (the **live** read used at Phase-B draft time). `parse.ts`
(gray-matter) reads frontmatter (`slug/name/aliases/trigger_signals/when_to_use` + the
nudge tag) and extracts `[[wikilinks]]` (plain / `|alias` / `#heading` forms).
`sync.ts#syncFrameworks` orchestrates: tree → **.md files under `vault_folder_path`**
(scope #1) → skip unchanged files by `blob_sha`, else fetch+parse and keep only notes
with the **`framework: true`** tag (scope #2) → resolve link titles to `linked_slugs`
among the tagged set (unknown titles kept raw) → upsert on `(coach_id, slug)` and
**prune** rows whose note is gone/untagged. Content is never stored.

**Config** lives in `coaches.nudge_settings` (`vault_folder_path`, `framework_tag`,
defaults in `lib/nudges/settings.ts`); the repo identity + token are env
(`VAULT_GITHUB_TOKEN`, `VAULT_REPO`, `VAULT_BRANCH`). Read/written via `GET`/`PATCH
/api/coach` (`vaultFolderPath`/`frameworkTag`).

**Sync** runs two ways: manual **`POST /api/vault/sync`** (the Account → **Vault**
panel's "Sync vault" button, returns indexed/ignored/removed counts) and the hourly
**`GET /api/cron/vault-sync`** (`CRON_SECRET` Bearer; re-indexes every coach with a
folder set — near-free when nothing changed thanks to the blob-SHA skip). The panel
also lists the indexed frameworks (`GET /api/vault/frameworks`) so the coach can
confirm tagging worked. **No nudge behavior consumes this yet** — Phase B wires
`frameworks.aliases` into nudge extraction. Needs `023_frameworks.sql` + the
`VAULT_*` env vars; the vault repo must be reachable by the PAT.

### Branded email send + communications log (`email_signatures`, `communications`)
The client workspace **Compose Email** button (`ClientDetail` → `EmailModal`) is a
raw compose → **review → send** flow: To (prefilled client email), editable Cc
(default `jeff@theleadershipwell.com`), Subject, a plain-text body `<textarea>`,
and a **locked, non-editable signature preview** fetched from
`GET /api/email/signature` (so the coach sees exactly what will append). On send it
POSTs `{clientId, to, cc, subject, bodyHtml}` to `POST /api/email/send`, which:
1. tenant-gates on `requireClientCoach`;
2. fetches the active signature (`lib/signature.ts#getActiveSignatureHtml` — coach
   row wins, else the global `coach_id IS NULL` row, else `DEFAULT_SIGNATURE_HTML`)
   and **appends it server-side** (never trusts the client to include it);
3. sends HTML via the signed-in coach's Gmail access token (lands in their Sent
   folder, Cc the coach);
4. **logs every send** to `communications` (`lib/communications.ts#logCommunication`)
   — `status='sent'` with the returned `gmail_message_id`, or `status='failed'` +
   `error_detail` on a transport error (never a silent drop).

`email_signatures` is the single source of truth for the signature: email-safe
table HTML with a **raster PNG** logo (`public/logo-email.png` →
`https://theleadershipwell.online/logo-email.png` — SVG is stripped by mail
clients). `coach_id` nullable: a NULL row is the global default. The
`communications` log is type-discriminated (`type` email|reminder|prep_sheet,
`direction` outbound|inbound) so reminders and future inbound reply-capture reuse
it with no refactor. The workspace **Recent Communication** card
(`CommunicationCard`, `GET /api/clients/[id]/communications`) shows the latest 5
(✉ email / 🔔 reminder icon, subject/label, preview, relative time, muted-red
`failed` chip), with a "View all" expander.

**Brand mark / email logo.** `public/logo-email.png` is the wordmark embedded in
the signature: "THE LEADERSHIP WELL" in a black outlined box (ink `#111226`) with
an orange `+` (`#F5821F`, the one permitted accent) tucked into a **voided
top-right corner** — the plus's top edge meets the top border line and its right
edge meets the right border line. It's regenerated to spec by
`scripts/generate-email-logo.py` (`pip install Pillow`, then
`python3 scripts/generate-email-logo.py`); tweak the plus weight/size/inset via
the CONFIG dials at the top of that file. Keep the colors/text in sync with
`lib/signature.ts`. If the designer ever supplies the official asset, just drop it
in at the same path — the signature points there, so no code change is needed.

### Coaching goals = the source of truth (and of the prep plan)
`clients.coaching_goals` is the sacred goal list. Each goal is `{title,
description, metrics?}` (`metrics` = up to three measures of fulfillment).
Edited in two places that share `GoalRows.tsx` (the rows editor + `toDrafts`/
`cleanGoals`/`emptyGoal` helpers — both preserve metrics on save): the workspace
`GoalsCard` (inline) and the notes-panel `EngagementGoalsCard` (modal). Session
prep is wired to them: `/api/generate` loads the client's goals (by `clientId`
or name) and renders them as the email's fixed **coachingPlan** instead of
inventing one — the rest of the email is still drawn from notes/Zoom. With no
goals stored it falls back to generating the plan from notes.

### Names vs initials
`client_initials` stays the stored, privacy-preserving label (transcripts,
reports, emails). In-app *lists* show the full client name, resolved in code via
`lib/clientNames.ts#withClientNames` (relationship types aren't generated, so no
embedded select) — wired through `/api/reports`, `/api/transcripts`, and
`/api/reports/[id]` (`clientName`).

## Security & pipeline hardening (absorbed from PRs #45/#55)

- **Tenant isolation on sibling routes.** `/api/notes` (CA proxy) now requires a
  signed-in session; `/api/search` filters to `accessibleClientIds` (and is
  `force-dynamic`); `/api/send` only ties tracking to a matched client the coach
  is linked to; `PATCH /api/transcripts/[id]` only assigns to a linked client.
- **Next.js bumped to 14.2.35** (security advisory) + a real **ESLint** config
  (`next/core-web-vitals`); `next build` runs lint (warnings only, non-blocking).
- **Scoring-model guard.** `engine.ts#resolveModel` ignores a retired
  `SCORING_MODEL` id (e.g. the 2026-06-15-retired `claude-sonnet-4-20250514`) and
  falls back to the safe default, so a stale Vercel env var can't silently break
  scoring.
- **Transcript pipeline.** Hashing canonicalizes the markdown
  (`ingest.ts#canonicalizeForHash` — BOM/CRLF/whitespace) so Zapier (CRLF) and
  Drive (LF) dedupe to one row; a forced per-client re-import **reconciles** onto
  the existing row instead of duplicating; ingest emails the coach a
  **needs-review** notice for an unmatched session (`lib/transcript-review-email.ts`);
  the Practice queue shows an opening-line **preview** (`/api/transcripts`).

## Environment variables

Google OAuth (`GOOGLE_CLIENT_ID/SECRET`), `NEXTAUTH_URL/SECRET`,
`ANTHROPIC_API_KEY`, Coach Accountable (`COACH_ACCOUNTABLE_API_ID/_API_KEY`),
Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_API_SECRET_KEY`),
`JEFF_FROM_EMAIL`/`JEFF_CC_EMAIL`, Zoom (`ZOOM_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET`),
`INGEST_SECRET`, `CRON_SECRET` (Bearer token for the hourly crons —
`/api/cron/reminders`, `/api/cron/nudges`, `/api/cron/vault-sync`; set the same
value in Vercel), `DEFAULT_COACH_EMAIL` (= `jeff@jeffkholmes.com`),
`DEFAULT_COACH_NAME`. Vault (framework nudges): `VAULT_GITHUB_TOKEN` (read-only
fine-grained PAT on the vault repo), optional `VAULT_REPO` (default
`theLeadershipWellJeff/TheLeadershipWell-Vault`), `VAULT_BRANCH` (default `main`).
Optional: `SCORING_MODEL`, `GOALS_MODEL`, `NUDGE_MODEL`,
`AUTO_SCORE`, `DEFAULT_TIMEZONE`, `PLAUD_DRIVE_FOLDER` (default `Plaud-Transcripts`).
See `.env.example`.

## Operational notes

- **Google Cloud APIs** must be enabled in the OAuth project: Gmail, Calendar,
  **Drive** (drive.readonly was added for Plaud import — enable the Drive API in
  the Cloud console if you hit "Drive API has not been used").
- **Adding an OAuth scope requires the coach to sign out and back in** (the
  refresh token / access token only gains the scope on re-consent). This also
  populates `coaches.google_refresh_token`. ⚠️ The **scheduling** feature added
  `calendar.events` (write) — booking a session and sending reminders won't work
  until the coach re-consents.
- **Vercel deploys from `main`.** Open a PR → merge → Vercel auto-deploys.
- **Branch hygiene:** PRs are squash-merged, so the long-lived dev branch
  (`claude/practical-allen-uh4ckg`) diverges from `main`. Before pushing a new
  PR, reconcile with: `git fetch origin main && git merge -X ours origin/main`
  (branch content is the superset; this avoids phantom add/add conflicts).
  Verify `git diff --stat origin/main..HEAD` shows only the intended files.

## Migrations applied (001–012)

001 init (clients/notes/actions) · 002 scorecard (coaches/transcripts/
session_reports) · 003 coach calendar (refresh token + timezone) · 004 client
workspace (address + coaching_goals) · 005 CA notes (ca_session_id) · 006
supervisor email (coaches.supervisor_email) · 007 key info + map · 008 note
templates · 009 action completion · 010 library folders · 011 agreements · 012
agenda requests · 013 revenue + competency focus + prep sheets
(`clients.session_fee`, `coaches.competency_focus` jsonb, `prep_sheets` table) ·
014 note duration (`notes.duration_minutes`, default 60) · 015 coach_clients
(tenant scoping — links each client to its coach(es); the isolation boundary the
client routes filter on) · 016 appointments (`appointments` +
`appointment_reminders` — scheduled sessions and the reminder log) · 017 email
signatures + communications (`email_signatures` single-source signature +
`communications` outbound log; seeds Jeff's signature) · 018 agreement system
(`agreement_templates` structured master template; extends `agreements` with the
signing fields; adds `clients.agreement_on_file/recording_authorized/agreement_id`;
migrates legacy `signed`→`active` + backfills `agreement_on_file`). Run new
migrations by hand in the Supabase SQL editor · 019 library labels
(`coaches.library_labels` jsonb — per-coach custom labels for the fixed Library
nodes) · 020 scheduling settings (`coaches.availability` + `coaches.reminder_settings`
jsonb — per-coach weekly bookable hours and configurable reminders; NULL = defaults) ·
021 client timezone label (`clients.timezone_label` — the friendly major-city name
the coach picked, e.g. "Austin", shown back instead of the zone's canonical city;
cosmetic, all time math still uses `clients.timezone`) · 022 nudges (`nudges` table
+ `coaches.nudge_settings` jsonb — the between-session nudging system; additive,
NULL settings = code defaults) · 023 frameworks (`frameworks` table — the derived
index over the vault repo; additive).

**Tenant scoping (015).** `coach_clients` (coach_id, client_id, role) is the
ownership link. Client access is enforced **server-side** by the session coach,
not Supabase RLS (we're on NextAuth): `lib/client-access.ts#requireClientCoach`
gates every `/api/clients/[id]/**` route (404, not 403, on no access), the roster
list filters via `accessibleClientIds`, and client create/import call
`linkCoachToClient`. A client can be linked to more than one coach (occasional
shared clients, role `shared`); the normal case is one `primary` link.

**Revenue billing:** `session_fee` is an hourly rate; sessions bill in half-hour
units with a 1-hour minimum, rounding up once past 15 min into a half hour
(`lib/billing.ts`). Past-week revenue uses each note's logged `duration_minutes`;
the projection uses the scheduled calendar-event length.

**Pending — apply in Supabase:** `014_note_duration.sql`,
`015_coach_clients.sql`, `016_appointments.sql`, and
`017_email_signatures_communications.sql`, `018_agreement_system.sql`,
`019_library_labels.sql`, `020_scheduling_settings.sql` (adds the two jsonb
columns the scheduler/settings read — safe additive change, defaults until set),
and `021_client_timezone_label.sql` (adds `clients.timezone_label` — additive,
nullable), and `022_nudges.sql` (the `nudges` table + `coaches.nudge_settings`
jsonb — additive; **apply before the Nudge Queue is used**), and `023_frameworks.sql`
(the `frameworks` index over the vault repo — additive; **apply before vault sync
is used**). ⚠️ **015 must be run BEFORE
the tenant-scoping code is deployed to `main`** — until the table exists and is
backfilled, the roster would filter to zero clients. Read the backfill comment in
015 first (it assumes all current coach logins are the same person). **016 must be
applied before scheduling is used.** The `library-pdfs` Storage bucket is created
automatically on first upload.

**Scheduling go-live checklist:** (1) apply `016_appointments.sql`; (2) set
`CRON_SECRET` in Vercel (same value the cron sends); (3) enable the
`calendar.events` scope is already in `authOptions` — **the coach must sign out
and back in** to grant calendar-write + populate the refresh token with it;
(4) Vercel picks up `vercel.json` crons on the next deploy from `main`.

## Roadmap

### Shipped
- **Branded email send + Recent Communication card (Phase 1B)** — Compose Email
  in the client workspace sends branded HTML via the coach's Gmail (signature
  appended server-side from `email_signatures`, Cc the firm), with review-before-
  send and a locked signature preview. Every send logs to `communications`
  (`status` sent/failed), surfaced in the workspace **Recent Communication** card
  (migration 017, forward-compatible with reminders + inbound reply-capture).
  Needs migration 017 applied and the real logo PNG dropped at
  `public/logo-email.png`. Templates/AI compose deferred to Phase 2/3.
- **Scheduling next sessions + reminders** — workspace Sessions card books the
  next session (Google Calendar event + client guest), confirmation email at
  booking, and a 24h-before nudge via hourly Vercel Cron (`appointments` +
  `appointment_reminders`, migration 016). Upcoming sessions show in the Sessions
  card and compactly on the name card. Needs `calendar.events` re-consent +
  `CRON_SECRET`.
- **Conflict-aware scheduler + scheduling settings (migration 020)** — the picker
  shows a slot in the coach's *and* the client's timezone, runs a Google free/busy
  check (blue Schedule button when free, grey on a calendar conflict), and warns
  when a pick is outside the coach's set hours. Account → Scheduling sets per-coach
  weekly availability + configurable reminders (confirmation toggle + any number of
  "X before" nudges). Uses the already-granted `calendar.readonly` scope (no new
  consent). Needs `020_scheduling_settings.sql` applied.
- Plaud transcript import (Drive list + per-client import; unmatched transcripts
  surface in the Practice review queue with preview + delete).
- Emailed scorecard — auto-emails the coach after each scored session, plus an
  on-demand "Email this report" from a report (to me / supervisor / other).
- Scorecard now lives under **Practice** (Scorecard sidebar item removed).
- Per-competency **suggested moves** on a report (Claude-generated, persisted).
- Coach self-scoring (top of report) and supervisor email (`coaches.supervisor_email`,
  set on Account).
- **Coach timezone setting (Account → Timezone).** `coaches.timezone` is now
  editable via PATCH `/api/coach` (`TimezoneSettings`). The dashboard "Up next"
  cards render every day/time label in that zone (passed down to `UpNextPanel`),
  and "today" fallbacks for an undated transcript/CA note now resolve in the
  coach's zone via `lib/datetime.ts#todayInTimeZone` — never the server's UTC
  date, which was landing evening-Pacific sessions on the next day. The
  `DEFAULT_TIMEZONE` env var stays the fallback for new coaches.
- **Skip on session-prep cards.** Each "Up next" card has a Skip button that
  hides that calendar session from the dashboard (persisted in `localStorage`,
  `tlw-dashboard-skipped`, pruned to live event ids).
- **Session-notes panel** — Key info (private), Coaching map pulldown, Engagement
  goals; default note titles; in-app full client names; browser app icon.
- **Coaching goals** carry metrics and feed the session-prep coaching plan.
- **Library = folder system** — Templates + PDF Resources folders (uploads).
- **Note templates** with merge fields + the editor's Harvard outline / Tab indent.
- **Send to client** + **action checkboxes** (note + prep email) that log back to
  the workspace `ActionsCard`.
- **Coaching agreements** — build → assign → e-sign → `AgreementsCard`.
- **Prep-sheet agenda fill-ins** → public page → `AgendaCard`.
- **Consolidated v0.4 rubric (#39)** — explicit 1–5 band definitions for all
  eight competencies (`rubric.ts#COMPETENCY_BANDS`), rendered into both the engine
  prompt and the competency expander. Named cross-competency IP principles
  (Attunement Standard, Exploration Gate, Authorship Hinge, Consultant Pull
  Signature), the three-way emotion classification (reflection / coping inquiry /
  exploration), the evocative-reframe vs. consultant-move test, single-instance
  band-4 standards, and the three §10 gates (1, v0.4.1: no signed agreement on
  file AND no verbal consent to record → C1≤2; 2: no named insight at close AND no
  standing engagement → C3≤2; 3: zero feeling explorations → C6≤3) surfaced as
  `gates_triggered` on the report. The report page shows a red gate note on any
  capped competency, and an `agreement_gap` administrative flag when no signed
  agreement is on file. The coaching/counseling boundary (1.06) flags only
  wound-repair/diagnosis, not psychological depth or emotional exploration.

### Open — keep these tracked (also GitHub issues)
- **Worksheets (client fill-in) — to be built (#38).** Worksheet-kind Library folders
  exist (with a "still being built" banner) but currently behave like note
  templates. Planned: a builder with blanks + checkboxes, assign-to-client, a
  public fill-in page (same token pattern as agreements/agenda), and answers
  stored on the client workspace.
- **Supervisor cross-coach roll-up view (Phase 3) (#40).** Firm-facing dashboard
  rolling up reports across coaches + a Claude-vs-coach comparison. Schema is
  ready (`coach_id` + `role`), and coach self-scores are now captured, so the
  comparison data exists. Needs: a supervisor-scoped aggregate API and a
  `/supervision`-style page (gate on `role = 'supervisor'`).
