# CLAUDE.md — theLeadershipWell Coaching Platform

Working notes for Claude (and Jeff) on this codebase. Keep this current as the
app evolves.

## What this is

A coaching platform for Dr. Jeff Holmes (theLeadershipWell). Two pillars:

1. **Session prep** — pulls a client's history (Coach Accountable notes, Zoom/
   transcript context) and uses Claude to generate a personalized prep email,
   sent via Gmail.
2. **Coaching scorecard** — scores recorded sessions against the ICF 2025 Core
   Competencies refined by theLeadershipWell's standards. Spec baseline lives in
   `spec/theLeadershipWell_Session_Report_Spec_v0.3.md`; the v0.4 delta
   (`..._v0.4.md`) locks the per-competency band definitions — read both before
   touching scoring.

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
  full engine output (spec §16); scalar columns are denormalized for
  aggregation. `coach_self_scores`/`coach_overall`/`coach_notes` = the coach's
  parallel assessment, which **never overwrites** the machine score.

## Key pipelines

### Transcript → scored report
Plaud.ai finishes a transcript → Zapier POSTs it to `POST /api/transcripts/ingest`
(shared-secret `x-ingest-secret`) and also archives the md to a Drive folder.
`lib/transcripts/ingest.ts#ingestMarkdown` is the shared core (also used by the
manual paste and per-client Drive import):
1. dedupe by content hash — hashed over a **canonicalized** form of the markdown
   (`canonicalizeForHash`: strip BOM, CRLF→LF, trailing whitespace, collapse blank
   lines, trim) so the same session ingested via Zapier (CRLF JSON) and via the
   Drive import (`alt:'media'` LF) lands on **one** row instead of two;
2. parse (`lib/transcripts/parse.ts`) — title/front matter, **timestamp** title
   handling (Plaud names files `YYYY-MM-DD HH:MM:SS`);
3. **match client** — name match (`lib/transcripts/match.ts`, token-based,
   fail-loud) → else **calendar match** (`lib/calendar.ts`): convert the local
   wall-clock time (coach's timezone, DST-correct) to an instant, find the
   overlapping Google Calendar event, read the client off the **non-coach
   guest's email** (exact roster match) → guest-name → **event-title** name match.
   **Calendar match needs the client invited as an email guest (or their name in
   the event title)** — events with no guest/generic title won't match. Sessions
   booked via the in-app **Schedule next session** flow satisfy this by design;
4. on a confident match, **score** (`lib/scoring/store.ts#runAndStoreReport`).
Uncertain/ambiguous matches → `needs_review` (never guessed) and, on the Zapier
path, the coach is **emailed** (`lib/transcript-review-email.ts#sendNeedsReviewEmail`)
so a held transcript never sits silently — they assign the client in Practice and
it scores. **Dupe reconcile:** a per-client "Import from Plaud" of a session
already ingested (e.g. parked by Zapier) **adopts the existing row** (assigns the
forced client) instead of creating a copy; the import UI then scores it. The
Practice queue shows a transcript **preview** (`/api/transcripts` returns first
lines of `raw_md`) so timestamp-named, unmatched rows are identifiable at a glance.
The scoring **model is hardened**: a retired `SCORING_MODEL` id (e.g. the
2026-06-15-retired `claude-sonnet-4-20250514`) is ignored in favor of the safe
default so a stale env var can't silently break scoring (`engine.ts#resolveModel`).

### Scoring engine (`lib/scoring/engine.ts`)
Prompts Claude with the rubric — including the locked **per-competency band
definitions** (spec v0.4, rendered from `rubric.ts#COMPETENCY_BANDS`) and the
cross-competency principles (`CROSS_COMPETENCY_PRINCIPLES`) — then **enforces the
§17 arithmetic gates in code** (feeling-explorations cap on Competency 6,
consultant-move math + >3 mode-drift flag, threshold flags, equal-weighted
overall, band derivation). The **judgment gates** are instructed in the prompt
(they need reading, not arithmetic): attunement for 5/6/8, the Competency-2
band-4 gate, and the v0.4 **Competency-1 AI/technology-disclosure** and
**Competency-3 session-close** band-2 ceilings. v0.4 also adds two move
classifications the prompt pins down — *attunement observation* (counts as a C6
feeling exploration) and *presence-as-instrument* (a C5 move) — neither of which
may inflate talk-time or statement counts. Output shape = spec §16
(`lib/scoring/types.ts`). `lib/scoring/aggregate.ts` rolls reports into the
dashboard/scorecard headline numbers.

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

### Schedule next session (`ScheduleSessionModal.tsx`)
The notes-panel header has a **Schedule next session** button (disabled until the
client has an email). It opens a right-edge slide-over (date / time / duration —
**default 55 min**) with the client name+email pre-filled from context. Confirm
POSTs to `POST /api/clients/[id]/schedule`, which interprets the wall-clock pick
in the coach's timezone (`zonedWallClockToUtc`) and calls
`lib/calendar.ts#createCoachingEvent` to insert the event on the coach's
**primary** calendar with `sendUpdates: 'all'` (emails the client the invite).
Title `"<client name> · Coaching Session"`, description `"Coaching session with
Jeff Holmes · theLeadershipWell"`. Auth is the **live session access token**
(same pattern as `/api/send`), so it needs the writable `calendar.events` scope;
a 403/insufficient-scope is mapped to a "sign out and back in" message. The
created event id is linked onto the active note (`notes.calendar_event_id`). No
availability/conflict checks, no self-scheduling (deliberately out of scope).

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

Folders carry a `kind` (note|agreement|worksheet|generic; migration 011). A
folder's kind drives the builder inside it — `FolderTemplates` shows an "assign
to client" action for `agreement` folders (worksheet kind is a later phase).

### Coaching agreements e-sign (`agreements`)
Templates in an **agreement-kind** folder can be assigned to a client to sign
(`AssignAgreementModal` → `POST /api/agreements` {templateId, clientId}). That
**snapshots** the template body into an `agreements` row (so a later edit never
changes what was agreed) and emails the client the agreement
(`lib/agreement-email.ts`) with an "I have read and agree" checkbox link —
`${getBaseUrl()}/api/agreements/sign?token=…`, the same click-to-log mechanism as
actions. `GET /api/agreements/sign` is **public** (token = credential): flips
status to `signed` (idempotent) + sets `signed_at`, returns a confirmation page.
The client workspace `AgreementsCard` (`/api/clients/[id]/agreements`) shows
sent vs signed. Agreement editing disables merge fields (bodies are snapshotted
raw, so unresolved `{{…}}` would leak).

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

### Session-prep agenda fill-ins (`agenda_requests`)
When `/api/send` matches a client it also creates an `agenda_requests` row
(token) and passes `${getBaseUrl()}/agenda/<token>` into `buildClientEmailHTML`,
which renders a "Help shape our agenda" CTA at the bottom of the prep email. The
**public** page `app/agenda/[token]/page.tsx` (token = credential) shows the
prompts (`lib/agenda.ts#AGENDA_PROMPTS`); `GET/POST /api/agenda/[token]` load and
submit (stores `items` = `[{q,a}]`, status → submitted). The workspace
`AgendaCard` (`/api/clients/[id]/agenda`, latest request) shows the client's
answers (or "awaiting their response").

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

## Environment variables

Google OAuth (`GOOGLE_CLIENT_ID/SECRET`), `NEXTAUTH_URL/SECRET`,
`ANTHROPIC_API_KEY`, Coach Accountable (`COACH_ACCOUNTABLE_API_ID/_API_KEY`),
Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_API_SECRET_KEY`),
`JEFF_FROM_EMAIL`/`JEFF_CC_EMAIL`, Zoom (`ZOOM_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET`),
`INGEST_SECRET`, `DEFAULT_COACH_EMAIL` (= `jeff@jeffkholmes.com`),
`DEFAULT_COACH_NAME`. Optional: `SCORING_MODEL`, `GOALS_MODEL`, `AUTO_SCORE`,
`DEFAULT_TIMEZONE`, `PLAUD_DRIVE_FOLDER` (default `Plaud-Transcripts`). See
`.env.example`.

## Operational notes

- **Google Cloud APIs** must be enabled in the OAuth project: Gmail, Calendar,
  **Drive** (drive.readonly was added for Plaud import — enable the Drive API in
  the Cloud console if you hit "Drive API has not been used").
- **Adding an OAuth scope requires the coach to sign out and back in** (the
  refresh token / access token only gains the scope on re-consent). This also
  populates `coaches.google_refresh_token`. **The calendar scope is now the
  writable `calendar.events`** (was `calendar.readonly`) so the app can create
  sessions — existing coaches must sign out/in once to grant it (calendar reads
  still work under `calendar.events`).
- **Vercel deploys from `main`.** Open a PR → merge → Vercel auto-deploys.
- **Email subjects must survive any mail client.** Non-ASCII header values
  (em-dashes, middots, smart quotes) are wrapped as RFC 2047 encoded-words by
  `lib/email-mime.ts#encodeHeaderValue` (used by every send path) — without it
  they render as mojibake. Hardcoded subjects (scorecard, prep, intro) are kept
  **plain ASCII** so they never depend on the recipient decoding an encoded-word;
  the encoder still covers AI/coach-authored subjects that contain fancy
  punctuation. (Email **bodies** are UTF-8 fine — this is a header-only concern.)
- **Scoring model:** `SCORING_MODEL` overrides the safe default
  (`claude-sonnet-4-6`); a **retired** id (e.g. `claude-sonnet-4-20250514`) is
  ignored by `engine.ts#resolveModel` so a stale env var can't break scoring.
  Set it to a current id (e.g. `claude-opus-4-8`) for stronger judgment.
- **Branch hygiene:** PRs are squash-merged, so the long-lived dev branch
  (currently `claude/great-mccarthy-5xjw41`) diverges from `main`. Before pushing
  a new PR, reconcile with: `git fetch origin main && git merge -X ours origin/main`
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
014 note duration (`notes.duration_minutes`, default 60). Run new migrations by
hand in the Supabase SQL editor.

**Revenue billing:** `session_fee` is an hourly rate; sessions bill in half-hour
units with a 1-hour minimum, rounding up once past 15 min into a half hour
(`lib/billing.ts`). Past-week revenue uses each note's logged `duration_minutes`;
the projection uses the scheduled calendar-event length.

**Pending — apply in Supabase:** `014_note_duration.sql` (013 already applied).
The `library-pdfs` Storage bucket is created automatically on first upload.

## Roadmap

### Shipped
- **Schedule next session** — in-app GCal event creation from the notes panel
  (right-edge slide-over → `POST /api/clients/[id]/schedule`), invites the client;
  uses the writable `calendar.events` scope.
- Plaud transcript import (Drive list + per-client import; unmatched transcripts
  surface in the Practice review queue with preview + delete).
- Emailed scorecard — auto-emails the coach after each scored session, plus an
  on-demand "Email this report" from a report (to me / supervisor / other).
- Scorecard now lives under **Practice** (Scorecard sidebar item removed).
- Per-competency **suggested moves** on a report (Claude-generated, persisted).
- Coach self-scoring (top of report) and supervisor email (`coaches.supervisor_email`,
  set on Account).
- **Session-notes panel** — Key info (private), Coaching map pulldown, Engagement
  goals; default note titles; in-app full client names; browser app icon.
- **Coaching goals** carry metrics and feed the session-prep coaching plan.
- **Library = folder system** — Templates + PDF Resources folders (uploads).
- **Note templates** with merge fields + the editor's Harvard outline / Tab indent.
- **Send to client** + **action checkboxes** (note + prep email) that log back to
  the workspace `ActionsCard`.
- **Coaching agreements** — build → assign → e-sign → `AgreementsCard`.
- **Prep-sheet agenda fill-ins** → public page → `AgendaCard`.
- **Band definitions locked (spec v0.4) (#39)** — explicit 1–5 band definitions
  for Competencies 1 and 3–8 (C2 already done), held in `rubric.ts#COMPETENCY_BANDS`,
  rendered into both the engine prompt and the competency expander. Adds the
  cross-competency principles and the attunement-observation / presence-as-instrument
  move classifications, plus the C1 (AI/tech disclosure) and C3 (session close)
  judgment gates. B.W. is the calibration anchor.

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
