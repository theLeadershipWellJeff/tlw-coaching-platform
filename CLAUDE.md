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
   spec `spec/theLeadershipWell_Session_Report_Spec_v0.4.md` is the base source
   of truth**, then apply the deltas **in order**: `..._v0.5.md` → `..._v0.5.1.md`
   → `..._v0.5.2.md` → **`..._v0.5.3.md` (latest — read this last)**. Read the
   base + all deltas before touching scoring (the older `..._v0.3.md` is kept
   for history only).

Plus a **client workspace** (per-client hub) and **roster**.

## Stack & commands

- **Next.js 14** (App Router) + TypeScript + Tailwind. **Supabase** (Postgres).
  **NextAuth** (Google OAuth). **Anthropic SDK** for generation/scoring.
  Deployed on **Vercel** (production builds from `main`), domain
  `theleadershipwell.online`.
- `npm run dev` · `npm run build` · `npm run lint`
- Always run `npx tsc --noEmit` and `npm run build` before committing. There is
  no automated test suite; verify pure logic with throwaway node scripts.

## Database migrations — always provide copy/paste SQL

**Every schema change must be delivered as a ready-to-run SQL block** that Jeff
can paste directly into the Supabase SQL editor. Never assume a migration has
been applied — always ask Jeff to confirm before writing code that depends on new
columns or tables. When providing a migration:

1. Number it sequentially (`032_...`, `033_...`, etc.) and add it to the
   `supabase/migrations/` folder as a `.sql` file.
2. Print the full SQL in a fenced code block in the chat so it can be
   copy/pasted without opening a file.
3. Note in the "Migrations applied" section of this file once Jeff confirms it
   is applied.
4. All new tables must include `ALTER TABLE … ENABLE ROW LEVEL SECURITY;`
   (no policies needed — service-role key bypasses RLS, consistent with the
   rest of the app).

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

**Titles for incoming transcripts.** `transcripts.title` (migration 034) is
proposed at ingest: matched client → "Client · Mon DD, YYYY"; else Zapier's
`title`/`summary` field or the md front-matter title; else the **first markdown
heading** in the body (`parse.ts#headingTitle` — timestamp/generic headings
skipped); else a real non-timestamp filename. For an **unmatched** transcript
still left with nothing (or just "Session · date"), a best-effort Claude call
(`lib/transcripts/title.ts#proposeTranscriptTitle`, `TITLE_MODEL` env or a haiku
default) reads the opening and proposes "Participant — topic" so the review
queue says who it is without opening the transcript. The webhook path also
defaults an undated transcript's `session_date` to **today in the coach's zone**
(`ingest.ts` `assumeSessionToday`, set only by `/api/transcripts/ingest` —
Zapier fires minutes after the recording ends; manual/Drive backfills never
assume).

**Add without scoring.** Not every recording is a coaching conversation (new-
client orientations, teaching sessions) — the coach can file one on a client
without a scorecard. Three surfaces: the review queue's **"add, don't score"**
button (`PATCH /api/transcripts/[id]` with `{clientId, score:false}` — assigns
the client + `matched`, skips the engine), the manual paste form's **"score this
session"** checkbox (`/api/transcripts/manual` `autoScore:false` →
`ingestMarkdown`), and the client workspace transcripts list, which shows
unscored rows as "not scored" with a **"score now"** button (`PATCH` with
`{rescore:true}`) so an unscored transcript can always be scored later.

**Background scoring + progress bar (`lib/scoring-jobs.ts`).** Scoring takes
~120 s, so "confirm & score" (review queue) and "score now" (client transcripts
list) are **fire-and-forget**: the click registers a job in a client-side store
(persisted in `localStorage`, key `tlw-scoring-jobs`) and sends the PATCH
without awaiting — the serverless function runs to completion even if the coach
navigates away or closes the tab. The UI shows a **dark progress bar**
(`ScoringProgress.tsx`, fill rate = `EXPECTED_SCORING_SECONDS` 120 s, holds at
96% until the report actually lands) in a "Scoring in progress" panel on
Practice (`scoring-jobs` panel id) and inline in place of the score-now button.
If the in-page fetch was lost to a reload, a 10 s poller watches `/api/reports`
(which now returns `transcript_id`) and resolves the job when the report
appears; >5 min with no report → error state with **retry** (re-fires the job's
stored PATCH body). A failed score is never lost — the transcript stays filed on
the client as "not scored". Assign-to-client pulldowns (review queue, dashboard
unmatched bookings, billing-account picker) list **working clients only** —
the roster's Active-tab definition (not inactive/archived).

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

**v0.5.2 additions (T.S. anchor, July 2 2026).** (1) **Layer 0 data integrity**
runs before scoring, all fail-loud into `report.integrity`: L0.1 collapses phantom/
minority speakers (model-reported `speaker_reassignments`, `confirmed:false`), L0.2
keeps only telling statements in the Q:S denominator (`question_to_statement_note`),
L0.3 re-verifies every **quoted** evidence string is a literal transcript substring
in `enforceRules` (`verifyEvidenceVerbatim` — pass `transcript` in; misses set
`evidence_verbatim_check:"fail"`). `flags_for_manual_review` aggregates these +
low-confidence attribution; surfaced as a warning banner on the report. (2) A
**consultant move is a contiguous envelope** (open at a role-shift, close at re-
contract / floor-returning question / client-filled pause) counted **once per
envelope** with a `span`; count>3 stays amber advisory (v0.5 A4, no C2 cap),
execution scored per envelope. (3) **C1 platform-boolean precedence:** observed
verbal consent passes Gate 1 regardless of `recording_authorized`
(`gate1 = !agreementOnFile && !verbalConsent`); but unconfirmed on-file
infrastructure (not both `agreement_on_file` AND `recording_authorized===true`)
caps C1 at **3.4** below band 4 (`c1_ceiling`).

**v0.5.3 additions (contracting / agreement-setting).** (1) A fifth Layer-0
utterance bucket, **contracting** (engagement-level agreement-setting — what
coaching is/isn't, roles, confidentiality, journey, fees, compatibility; distinct
from process/logistics housekeeping, unclear split → fail-loud flag
`contracting_classification_unclear`), **active only in engagement sessions 1–2**
(session 3+ it reads as normal content/possible drift). Contracting is
**enveloped** (mirrors the consultant-move envelope; `metrics.contracting_envelope`
with `present`/`substantial`/`client_waiver_detected`/`quality`/`envelopes`) and
excluded from the drift denominators: **talk-time is a dual figure**
(`coach_talk_time_pct` = coaching-body, what the 40% flag evaluates;
`coach_talk_time_pct_raw` = all words, always shown), contracting leaves the Q:S
statement denominator, and is never a consultant move — the carve-out is
content-scoped, never session-scoped. (2) **C3 has two faces** (`faces` on the
competency): session-agenda (all sessions, unchanged) + engagement-contracting
(3.01–3.05, sessions 1–2; bands 3/4/5 = focused one-directional / partnered /
client co-authors); the weaker in-scope face governs the ceiling. (3) The
**absence asymmetry**: absence of contracting is upside-only except a **confirmed
session 1**, where substantial absence caps C3 at **3.4** below band 4
(`c3_contracting_cap`); substantial presence (scope, confidentiality, OR
agreement-setting — not full coverage) clears it, an observed client
waiver/understanding waives it (C1-precedence pattern), and an **uncertain
session number suppresses it** + flags `session_number_uncertain` (a guess never
moves a score). Session number is derived in `store.ts` when front matter lacks
it: prior transcript count for the client + 1, `confirmed` only when prior notes
don't outnumber prior transcripts (a CA-migrated history → `uncertain`).
Contracting surfaces as a coach-facing QA line on the report (sessions 1–2 only,
suppressed 3+).

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
`Session.getAll`). Both idempotent. The API routes remain, but the roster's bulk
"Import from CA" buttons were removed (the CA migration is done) — replaced by
the Active/Inactive roster toggle (below).

### Roster Active/Inactive/Archived toggle + Email all (`clients/ClientsRoster.tsx`)
The roster splits on `clients.status`: a segmented **Active / Inactive /
Archived** toggle (with counts) where the CA import buttons used to be. "Active"
= everything not `inactive`/`archived` (so `prospect` shows there); "Inactive"
is the resting list of finished clients; **"Archived"** is the permanent record
of everyone ever coached — hidden from the working lists AND the dashboard
Clients panel (`RosterPanel` filters it out), but all data (notes, transcripts,
reports) intact and the workspace fully reachable. Rows on the Inactive tab get
a hover **Archive** button, rows on Archived get **Restore** (both
`PATCH /api/clients/[id]` `{status}`, optimistic with rollback); the workspace
edit modal's Status field carries all four values. No column or migration —
`status` is unconstrained text (active|prospect|inactive|archived). The My Team
section filters by the same toggle.

**Email all (`clients/BulkEmailModal.tsx`).** A roster button that mass-emails
every client in the **currently visible list** (respects the toggle + the search
filter). Compose (subject/body, `{{first_name}}` merge token, recipient list
with no-email skips, locked signature preview) → review (personalized preview) →
send: the modal loops recipients client-side (concurrency 3) calling the
existing `POST /api/email/send` per client — one individual email each (never a
group To line), `cc: ''` to suppress the default Cc, signature appended
server-side, every send logged to `communications`. Progress bar + failure list
with "Retry failed". Gmail's own daily send limits apply (~500/day consumer,
~2000/day Workspace) — split a very large blast across days.

### Client workspace (`app/(authenticated)/clients/[id]`)
Name card (gear → edit), Transcripts + Notes summary cards, New note / Send
email actions, Coaching goals card (generate from notes via
`/api/clients/[id]/goals/generate`, or edit by hand). Email composes+sends via
Gmail (`/api/email/send`). **Transcript file import** lives on the Transcripts
card (a "+ Import" button → `ImportTranscriptModal`): the coach picks local
file(s) — md/txt/vtt/srt/docx/pdf — which `POST /api/clients/[id]/import-file`
(multipart, 4 MB/file) extracts to text (`lib/transcripts/extract.ts` — caption
formats flatten to "Speaker: text" lines; docx via mammoth, pdf via unpdf) and
feeds through `ingestMarkdown` forced onto that client, unscored; the modal then
fires the background scoring jobs (`lib/scoring-jobs.ts`) unless the "Score this
session" box is unchecked. This replaced the old Drive-folder "Import from
Plaud" picker (`/api/drive/transcripts` + `/api/clients/[id]/import-transcripts`
and `lib/drive.ts` were removed; the Zapier ingest webhook and its Drive archive
are unaffected).

### Session-notes panel (`clients/[id]/NotesPanel.tsx`)
The right-hand rail carries the live ACTION/INSIGHT capture (`CaptureGroup` —
newest-first, 5 visible with a "Show all" expander; the notes list does the same)
**plus** persistent, per-client context loaded from the client record: **Key info**
(`clients.key_info`,
freeform reference — boss/spouse/kids), **Coaching map** (`clients.coaching_map`,
a pulldown of the practice's maps — registry in `CoachingMapCard.tsx#MAPS`: The 6
Components / The Airplane Model / First 90 Days / Who I Am Becoming / The Becoming
Map. Clicking the assigned map's name opens a **structure pop-up** (portaled to
`document.body` — the sticky rail's stacking context would otherwise trap it under
the note editor; the Client goals modal is portaled for the same reason). The
displayed structure is **drawn live from the vault repo**: `GET /api/vault/map?name=…`
→ `lib/vault/maps.ts#getMapFromVault` finds the vault note by **title** (filename
match anywhere in the repo, 5-min in-memory cache) and parses `### NN · Component`
sections + `> [!question]` callouts into `{name, description, question}`. The
hard-coded `MAPS` entries are the pulldown registry + **offline fallback only** —
vault unconfigured / note missing / no `###` sections degrades to the built-in
copy, never a blank card), and **Engagement
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
"issue now?" prompt after creating a client, via `/clients/[id]?issue=1`; also
the client settings — the edit (gear) modal's Agreement & recording section has
an **"Issue coaching agreement" / "Issue a new agreement"** button
(`EditClientModal#saveAndIssue`) that saves the pending edits first (so the flow
prefills the just-edited name/email/phone), closes the modal, and opens the same
`IssueAgreementModal`; the label reads "new" when any agreement exists — a
platform row in any state, or on-file external). The details step **prefills the
coach's Zoom link + phone from the most recently issued agreement** (`GET
/api/agreements/template` returns `lastIssued` — latest non-null `zoom_link`/
`phone` off the coach's `agreements` rows; no migration, editable per client).
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

**External acknowledgment (no re-issue).** An agreement signed outside the
platform (e.g. on Coach Accountable) is recorded via the edit-client modal's
**Agreement & recording** section: a "Signed coaching agreement on file" checkbox
(`clients.agreement_on_file`) + an Authorized / **Do not record** / Not set choice
(`clients.recording_authorized` true/false/null) — the exact fields Gate 1 and the
C1 infrastructure ceiling read, so the ethics clear on the next score without
issuing a platform agreement. `PATCH /api/clients/[id]` accepts both (strictly
validated booleans; no migration — 018 columns). The coach can also override
recording mid-engagement (a client who withdraws permission → "Do not record" →
the no-recording flag + a manual-review flag on any scored session). **Existing
reports need a rescore to pick up a changed acknowledgment.**

The workspace `AgreementsCard` shows none/awaiting/active/**on-file (external,
no `agreements` row — with an "Issue a platform agreement instead" fallback)**,
recording status (client record first, agreement row as fallback), and
the **no-recording compliance flag** (the one Signal-Orange instance, shown
whenever `clients.recording_authorized === false`), with Issue/View/Re-issue.
The same non-dismissible no-recording banner shows in the
client header (`ClientDetail`). The roster flags an agreement **unsigned > 7 days**
(amber dot; `pendingAgreements` from `GET /api/clients` — suppressed for clients
whose agreement is on file externally). `clients.agreement_on_file`
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
the trigger. Spec: `TLW_Nudging_System_Build_Handoff_v1`. **Phases A + B cover
`action_checkin`, `insight`, and `framework`** types; `reengagement` is reserved for
a later phase.

**Pipeline** (`lib/nudges/`): `generate.ts#generateNudgesForClient` is the
orchestrator — loads context (coaching goals, recent notes, **still-open** actions,
the source transcript, **plus the coach's surfaceable garden leaves**; **never
`clients.key_info`** — the key-info wall is enforced by the column list, §3.1), then
`extract.ts` (Claude → candidate list) → `dedup.ts#applyDedupAndCap` (dedup vs.
live/sent nudges; **cap = 2 per window**, priority **action > framework > insight**,
`settings.ts#MAX_NUDGES_PER_WINDOW`) → `draft.ts` (Claude → subject+body in the coach
voice) → insert as `status='draft'`. Both Claude calls go through `llm.ts` (model =
`NUDGE_MODEL` or `claude-sonnet-4-6`, retired-id guard like the engine). Bounded
timing only: `scheduled_for` defaults to the **midpoint** between now and the next
booked appointment, else null (coach sets it).

**Framework nudges (Phases B + C, `garden.ts`).** A framework candidate is proposed
on three bases (`framework_basis` → origin): the session **named** a leaf
(named→`mentioned`), its **themes match** (theme→`suggested`), or — Phase C — a
**connection**: something the client raised bridges to the framework through the
garden's authored edges, even though the coach didn't mention it
(connection→`suggested`). Extraction sees each surfaceable leaf annotated with its
1-hop **`connects to:`** neighbour titles (`loadSurfaceableLeaves`) so the model can
make that bridge. Only `nudge_eligible` leaves are ever offered, and a candidate must
reference a real leaf id (`framework_slug`). At draft time `loadFrameworkContext`
pulls the leaf's **live** content from GitHub (`vault/client#getContentByPath`) +
summary + its **surfaceable** 1-hop neighbours (the gate is re-applied so a
non-eligible note can't leak); `draft.ts` re-voices it into a short reminder (never a
note dump) and, when the framework was **not named** (`origin !== 'mentioned'`),
draws the explicit **bridge** ("when you mentioned X … I didn't raise it then, but
there's a framework that fits"). `generate.ts` sets `linked_resource_slug` to one
related surfaceable leaf. On demand: the manual `CreateNudgeModal` framework tile
lists surfaceable leaves (`/nudges/context` → `frameworks`), AI-drafts via
`/nudges/draft-one` (`{type:'framework', framework_slug}`), and persists
`nudges.framework_slug`.

**Triggered** after scoring — `store.ts#runAndStoreReport` calls it best-effort
(never breaks scoring; skipped on a rescore), and on demand via `POST
/api/clients/[id]/nudges/generate` (the workspace card's "Draft nudges" button).

**Review + send.** Two surfaces: the cross-client **Nudge Queue** screen
(`/nudges`, `GET /api/nudges` coach-scoped, grouped Needs review / Scheduled +
a read-only **Sent** panel of the last 50 sent nudges, compact expandable rows)
and the per-client workspace **`NudgesCard`** (`GET /api/clients/[id]/nudges`).
Both GETs are **enriched** (`lib/nudges/enrich.ts`) with the client's **session
rhythm** — `last_appointment_at` (most recent past scheduled/completed
appointment) and `next_appointment_at` (soonest upcoming `scheduled`) — shown as
a context line on every `NudgeItem`, plus the attached-PDF name. Both use
the shared `NudgeItem` (edit subject/body/time; **Send now / Schedule / Snooze /
Skip**). `PATCH /api/nudges/[nudgeId]` applies edits + the action (coach-scoped to
the nudge's `coach_id`). The queue also has **"+ Create nudge"**
(`CreateNudgeButton` — working-clients picker → the same `CreateNudgeModal` the
workspace card uses). `send.ts#sendNudge` is the one send path: enforces the
**spacing rule** (§3.4 — refuses if the client got any outbound communication
within `nudge_settings.nudge_spacing_days`, default 4), appends the signature
server-side, sends via the coach's Gmail (`sendCoachHtmlEmail`, unattended-capable),
logs to `communications`, and sets the nudge `sent` + `communication_id` (shows up
in the Recent Communication card). Settings defaults are in `settings.ts`
(dependency-free, mirrors `lib/scheduling.ts`); `coaches.nudge_settings` NULL = defaults.

**Framework PDF attachment (migration 035).** A framework nudge can carry a
Library PDF of the framework, attached to the email at send.
`nudges.pdf_resource_id` = this nudge's attachment; `garden_notes.pdf_resource_id`
= the leaf's **standing** PDF, which new framework nudges (pipeline, manual
create, draft-one) default to. Attaching/clearing a PDF on a nudge (`NudgeItem`
select, framework type only — options from `GET /api/library/pdfs` with **no
folderId = all the coach's PDFs**) **writes through** to the leaf, so future
nudges for that framework auto-attach ("attach as they get made"); the PATCH is
sent only when the value changed, and the vault-sync upsert never touches the
column. `sendNudge` is **fail-loud**: a missing/unreadable attachment refuses
the send with a reason rather than quietly sending without it.
`lib/gmail.ts#sendCoachHtmlEmail` accepts `attachments` (multipart/mixed MIME,
base64). Needs `035_nudge_pdf_attachment.sql` applied.

**Dispatch cron.** `GET /api/cron/nudges` (hourly in `vercel.json`, `CRON_SECRET`
Bearer) sends every coach-approved nudge whose `scheduled_for` has passed (`status
='scheduled'`), via `sendNudge` — so a spacing-blocked nudge stays scheduled and
retries; only the coach ever moves a nudge to `scheduled`.

### Vault connection → garden index (`garden_notes` + `garden_edges`; migration 024, supersedes 023) — Phase A-parallel
The coach's mind garden (the **`TheLeadershipWell-Vault`** GitHub repo) is the
canonical source. The deployed app **only reads** it (a single app-level GitHub PAT,
contents read) and builds a **derived node+edge index** — `garden_notes` (leaves) +
`garden_edges` (the 1-hop association graph) hold **pointers + the graph only, never
note content**. Authoring is collaborative (Claude Code + Obsidian write to the repo);
Obsidian Git pushes the coach's edits up. Spec: handoff §5–§6.

**Leaf vs. surfacing (the key model).** A note is an indexable **leaf** iff its
frontmatter carries **`nudge_eligible`** (equivalently a **`themes`** array) — *not* a
`type` value, because client-facing leaves are deliberately heterogeneous in type
(`framework`/`principle`/`phrase`/`psycap-seed`/`psycap-deep-dive`), so keying on
`type == framework` would silently miss leaves like Hope, Clarity, Delegate, Inner
HERO. **`nudge_eligible: true`** is the separate client-**surfacing** gate (a leaf is
indexed regardless; only `true` leaves are ever shown to a client).

**Read (`lib/vault/`):** `client.ts` is read-only GitHub REST via `fetch` (no octokit)
— `getTree` (one recursive call → paths + per-file SHAs + root tree SHA), `getBlob`,
and `getContentByPath` (the **live** read used at Phase-B draft time). `parse.ts`
(gray-matter) reads frontmatter (`id/title/type/themes/summary/nudge_eligible/aliases`)
and collects link titles from `parent:` (relation `parent`), `frameworks:` (relation
`framework`), and inline body `[[wikilinks]]` (relation `link`; plain / `|alias` /
`#heading` forms). `sync.ts#syncGarden` orchestrates: tree → **.md files under
`vault_folder_path`** → fetch+parse, keep only leaves → upsert `garden_notes` (PK
`(coach_id, id)` where `id` = frontmatter slug) + **prune** the gone → resolve every
link title to a target `id` (via id/title/aliases of the leaf set; unresolved or
self-links dropped) and **rebuild** `garden_edges`. The vault is small, so it re-reads
every leaf each run (edge resolution is global); `blob_sha` is stored but the skip is
not active. Content is never stored.

**Config** lives in `coaches.nudge_settings` (`vault_folder_path` only — leaves are
detected structurally, so there's **no tag setting**); the repo identity + token are
env (`VAULT_GITHUB_TOKEN`, `VAULT_REPO`, `VAULT_BRANCH`). Read/written via `GET`/`PATCH
/api/coach` (`vaultFolderPath`).

**Sync** runs two ways: manual **`POST /api/vault/sync`** (the Account → **Vault**
panel's "Sync vault" button + the Nudges page button; returns `indexed`/`surfaceable`/
`edges`/`ignored`/`removed` + a ready-built `message`, e.g. "Indexed 12 leaves … (0
surfaceable, 8 edges)") and the hourly **`GET /api/cron/vault-sync`** (`CRON_SECRET`
Bearer; re-indexes every coach with a folder set). The Account panel lists the indexed
leaves with type/themes/eligibility + out-edges (`GET /api/vault/garden`) so the coach
can confirm it worked. **Phase B consumes this** — `framework` nudges match
surfaceable leaves and draft from their live content (see the nudging section). Needs
`024_garden.sql` + the `VAULT_*` env vars; the vault repo must be reachable by the PAT.

### External booking capture → Next Appointment (`appointments` extended; migration 025)
Jeff sometimes hands an overwhelmed client his **Calendly** or **HubSpot** link to book
the next session later. Both tools already write the booking to his **Google Calendar**
(client as a guest) — the same calendar the native "Schedule next session" modal writes
to. So **Google Calendar is the single source of truth**: we capture external bookings by
**watching the calendar**, not by wiring two provider webhooks. (No direct Calendly/HubSpot
integration — deferred; rationale in the handoff. Reschedules/cancellations propagate for
free as the event moves/disappears.)

**Schema.** Extends `appointments` (not a parallel table): `source`
(native|calendly|hubspot|external — best-effort/cosmetic, never gates matching),
`attendee_email` (match key), `title`, `raw_event` (jsonb audit), plus
`coaches.calendar_sync_token`/`calendar_synced_at` (the incremental cursor). `client_id`
is now **nullable** — an external booking we captured but couldn't tie to a client sits as
a `client_id`-null row (the review queue). Idempotency = a unique index on
`(coach_id, google_event_id)`. Status gains `ignored` (coach-dismissed unmatched booking;
terminal, never resurfaced).

**Sync (`lib/booking-sync.ts#syncExternalBookings`).** Pulls the calendar **delta**
(`lib/calendar.ts#listCalendarDelta` — incremental `events.list` with the stored
`syncToken`; `410 Gone` → full resync + fresh token; `showDeleted: true` so cancellations
surface), classifies each changed event (`matchEventToClient`: non-coach guest email →
fuzzy name → title, reusing the transcript matcher), detects the source
(`detectBookingSource`, cosmetic), and **upserts** into `appointments` keyed by
`(coach_id, google_event_id)`. Gap-fill semantics: never overwrites a native row's
`source`/an already-resolved `client_id` with null, and an `ignored` row stays ignored.
A timed event with a non-coach guest that doesn't resolve to a client → **unmatched row**
(nothing silently dropped). All-day events and guest-less events are skipped. Cancellations
update the known row by id (a delete has no time, so it can't be upserted into the
NOT-NULL `scheduled_at`). The existing per-appointment reconcile
(`syncAppointmentFromCalendar`) then tracks moves/cancels of these rows like any other.

**Runs two ways:** hourly **`GET /api/cron/calendar-sync`** (`CRON_SECRET` Bearer, every
coach with a refresh token) and on demand **`POST /api/bookings/sync`** (the dashboard
panel's "Sync now" button, current coach). "Next Appointment" stays one source-agnostic
query (`GET /api/clients/[id]/appointments`, future `scheduled` rows) so native, Calendly,
and HubSpot bookings all surface the same way. **Unmatched review queue:** `GET
/api/bookings/unmatched` + `PATCH /api/bookings/[id]` (assign to a client → it becomes
their Next Appointment; or `action:'dismiss'` → `ignored`), surfaced on the dashboard
**Unmatched bookings** panel (`UnmatchedBookingsPanel`). Uses the already-granted
`calendar.readonly`/`events` scopes — **no new env, no re-consent.** Needs
`025_external_booking_capture.sql` applied + `CRON_SECRET` set.

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
Stripe (billing): `STRIPE_SECRET_KEY` (from Stripe Dashboard → Developers → API keys;
use the test key `sk_test_…` in dev, live key `sk_live_…` in production),
`STRIPE_WEBHOOK_SECRET` (from Stripe Dashboard → Developers → Webhooks → signing
secret for the `POST /api/billing/webhooks/stripe` endpoint).
See `.env.example`.

## Stripe integration

All Stripe interaction is in `lib/billing/stripe.ts` (singleton + helpers) and
`lib/billing/send.ts` (the one send path). Key facts:

- **All billing modes use hosted invoices.** Stripe emails the client a link to a
  hosted payment page where they enter their card, can save it for future payments,
  and can enable auto-pay. No payment method needs to be on file upfront. The
  off-session PaymentIntent path (which required a saved card) was removed — that
  was the source of the "no payment method on file" error.
- **Required env vars:** `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`. If either
  is missing, `getStripe()` throws at send time, surfaced as a Stripe error on the
  invoice card.
- **Webhook endpoint:** `POST /api/billing/webhooks/stripe` — handles
  `invoice.paid` (marks invoice `paid` in Supabase). Must be registered in the
  Stripe Dashboard pointing at `https://theleadershipwell.online/api/billing/webhooks/stripe`.
- **Customer creation:** `getOrCreateStripeCustomer` creates one Stripe customer
  per `billing_accounts` row on first send; persists `stripe_customer_id` back to
  the row so subsequent sends reuse it.
- **Days until due:** hosted invoices are set to `days_until_due: 30`.

### Stripe go-live checklist
1. Add `STRIPE_SECRET_KEY` (live) and `STRIPE_WEBHOOK_SECRET` to Vercel env vars.
2. In Stripe Dashboard → Developers → Webhooks, add endpoint:
   `https://theleadershipwell.online/api/billing/webhooks/stripe`
   Events to listen for: `invoice.paid`, `invoice.payment_failed`.
3. Copy the webhook signing secret → `STRIPE_WEBHOOK_SECRET` in Vercel.
4. Deploy (merge to `main`) — Vercel picks up the new env vars on next deploy.
5. Test with a real billing account: assemble a run → approve → send. The client
   should receive a Stripe-hosted invoice email. Check the Stripe Dashboard →
   Payments to confirm it appears.
6. To verify the webhook is firing: Stripe Dashboard → Developers → Webhooks →
   select the endpoint → Recent deliveries.

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
index over the vault repo; **superseded by 024**) · 024 garden (`garden_notes` +
`garden_edges` — the node+edge garden index; **drops the empty `frameworks` table**) ·
025 external booking capture (extends `appointments` with `source`/`attendee_email`/
`title`/`raw_event`, makes `client_id` nullable, adds the `(coach_id, google_event_id)`
unique index, and `coaches.calendar_sync_token`/`calendar_synced_at` — the Calendly/
HubSpot → Next Appointment calendar-watch pipeline; additive) · 031 billing CC +
invoice message (`billing_accounts.billing_cc` optional CC email; `invoices.client_message`
free-text note shown to the client at the top of the invoice; both additive/nullable) ·
032 billing skip + warnings (`engagements.skip_billing` boolean; `billable_sessions.appointment_id`
FK; `billing_run_warnings` table for calendar cross-check and subscription no-sessions warnings) ·
033 billing settings (`coaches.billing_settings` jsonb — preview_before_approve, auto_send_on_approve,
cc_self_on_send; additive, NULL = defaults) · 034 transcript title (`transcripts.title` — human-readable
title proposed at ingest from the calendar-slot match / Plaud summary / non-timestamp filename, coach-editable
in the review queue; additive, nullable, NULL = UI falls back to filename/"Untitled"; **applied**) ·
035 nudge PDF attachment (`nudges.pdf_resource_id` + `garden_notes.pdf_resource_id`
— framework nudges attach a Library PDF to the email; additive, nullable; **apply
before the Nudges pages are used — the nudge routes now select/insert the column**) ·
036 engagement length (`engagements.length_months` — the "6-Month Engagement" label
on the roster-card / workspace engagement bars; additive, nullable — the label falls
back to the billing mode until set. Note: for a **subscription** engagement,
`engagements.session_count` means **sessions per year** and the bar tracks sessions
received this calendar year; for other modes it stays total sessions in the
engagement — shared math in `lib/billing/engagement-progress.ts`; **applied**).

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
jsonb — additive; **apply before the Nudge Queue is used**), and `024_garden.sql`
(the `garden_notes` + `garden_edges` index over the vault repo; **drops the empty
`frameworks` table from 023** and is what vault sync now uses — apply before vault
sync is used; if 023 was already applied, 024 cleans it up), and
`025_external_booking_capture.sql` (extends `appointments` + `coaches` for the
Calendly/HubSpot calendar-watch capture — additive; **apply before the calendar-sync
cron / Unmatched bookings panel are used**), and `035_nudge_pdf_attachment.sql`
(nudge/garden PDF-attachment columns — **apply before deploying the nudge changes;
the nudge list/create routes now reference the columns**). `036_engagement_length.sql`
is **applied** (confirmed July 11 2026). ⚠️ **015 must be run BEFORE
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
- **External booking capture → Next Appointment (migration 025)** — Calendly/HubSpot
  bookings (which both write to the coach's Google Calendar) are captured by an hourly
  calendar-watch cron (`/api/cron/calendar-sync` + on-demand `/api/bookings/sync`),
  upserted into `appointments` keyed by the Google event id, and surfaced as the
  client's Next Appointment alongside native bookings — no per-provider webhook. Bookings
  that can't be matched to a client land in the dashboard **Unmatched bookings** review
  panel to assign or dismiss. Uses the already-granted calendar scopes; needs `025`
  applied + `CRON_SECRET`.
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

#### Billing & Business Center

- **Business Center — top-level area (to build).** A dedicated `/business` section
  in the sidebar surfacing revenue, coaching hours, invoicing, and firm-level
  analytics in one place. The billing infrastructure (`session_fee`, `billing_accounts`,
  `invoices`) is partially built; the Business Center consolidates it with the coaching
  hours log (below) and communications summary.

- **Billing run — enterprise client grouping.** When running a billing cycle,
  enterprise clients (accounts with multiple associated clients) currently appear
  flat in the list alongside individual clients. Fix: group by `billing_accounts`
  so the enterprise account name appears as a header row with its associated clients
  indented beneath it. Individual (non-enterprise) clients appear ungrouped as before.
  The billing run UI (`/business` or wherever billing is surfaced) should make it
  visually unambiguous that an enterprise is being billed at the account level, not
  each client individually.

- **Coaching hours card + ICF log (dashboard, Practice, Business Center).** A new
  card that appears in three places — the **dashboard**, the **Practice** area, and
  the **Business Center**. Features:
  - Toggle between **past week / past month / past year** totals (derived from
    `notes.duration_minutes` for completed sessions + scheduled appointment lengths
    for upcoming hours).
  - A **"View log"** button opens a modal/drawer listing every logged coaching
    session (client name, date, duration) in chronological order — structured for
    ICF credential reporting. The log is exportable (CSV at minimum).
  - Requires no new migration if built from existing `notes.duration_minutes` +
    `appointments`; a dedicated `coaching_hours_log` table may be worth adding
    for clean ICF-report queries.

#### Coach Workspace Enhancements

- **Actions card — previous actions visible + new ones at top.** In the notes-panel
  `CaptureGroup`, the actions list should show the **last 5 prior open actions** (from
  the `actions` table, not just the current note) as checkable items at the bottom of
  the list. Newly captured actions in the current note appear at the **top**. Checking
  a prior action marks it complete via `PATCH /api/clients/[id]/actions/[actionId]`
  (same as the workspace `ActionsCard`). "Show all" expander behavior unchanged.

- **Insights card — most recent 5 insights.** In the same notes-panel capture area
  (alongside the actions list), surface the **5 most recent INSIGHT: lines** from
  prior notes (not just the current note), as a read-only reference list using the
  existing ✦ icon. Helps the coach see patterns without leaving the note editor.

- **Coaching map — clickable framework viewer.** ✅ Built: the assigned map's name
  opens a structure pop-up whose content is drawn live from the vault repo
  (`/api/vault/map` + `lib/vault/maps.ts`; built-in `MAPS` copy = offline fallback —
  see the Session-notes panel section). Still open: the **"Send to client"** button
  that emails the client a formatted list of that framework's components as a quick
  reminder (uses the existing Gmail send path, `POST /api/email/send`; no note
  attachment), and an eventual graphical rendering.

- **Dashboard — Emails Sent card clickable.** The "Emails Sent" summary card on the
  dashboard becomes clickable and opens a modal listing all sent emails (from
  `communications` where `type='email'`), most recent first, with subject, client
  name, and date. Each row is clickable and navigates to that client's workspace
  Recent Communication card (already exists), where the individual email is viewable.

- **Dashboard — Nudges card clickable.** Same pattern as Emails Sent: the nudges
  summary card opens a modal listing all sent/scheduled nudges, each row navigating
  to the client workspace `NudgesCard`.

- **Send to client — terser output.** The `/api/notes/client-email` prompt that drafts
  the client-facing narrative should default to **bullet points and lists** wherever
  possible (action items, insights, key takeaways). Reduce paragraph prose; favor
  scannable structure. Update the system prompt in that route handler.

- **Nudge editor — coach note field.** In the `NudgeItem` edit area (both the Nudge
  Queue and the per-client `NudgesCard`), add a **"Coach note"** text field (maps to
  a new `nudges.coach_note` text column, migration required). This note is **not
  sent** to the client — it's private context the coach attaches before sending (e.g.
  "reference the Skydive story"). Displayed in the edit panel below the body editor,
  labeled "Private note (not sent)". Save via the existing `PATCH /api/nudges/[nudgeId]`.

#### Previously Tracked Open Items

- **SMS delivery for nudges and reminders (roadmap).** Allow the coach to send
  nudges and appointment reminders via text message in addition to (or instead of)
  email. Planned approach: integrate Twilio (or similar — Twilio has a free trial
  and a simple REST API) as the SMS transport. `clients` would gain a
  `phone` field (E.164 format) set via the edit-client modal. The send path in
  `lib/nudges/send.ts` and `lib/appointments.ts#sendAppointmentReminder` would
  check a per-nudge/per-reminder delivery preference (`email | sms | both`) and
  route accordingly; the `communications` log already has a `type`/`direction`
  structure that accommodates a new `type='sms'`. The NudgeItem review UI
  (`NudgesCard`, Nudge Queue) would surface a channel toggle so the coach can
  choose before sending. Public action-completion links (action checkboxes) still
  work over SMS since they're plain URLs. Requires: Twilio account +
  `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` env vars; a
  `clients.phone` column (new migration); and an SMS send helper
  (`lib/sms.ts#sendSms`) mirroring the `lib/gmail.ts` pattern.
- **Background prep-sheet generation (roadmap).** Currently the session prep
  page blocks for ~45 s while fetching notes + calling Claude. Planned: a global
  `PrepContext` in the auth layout starts the fetch and immediately redirects the
  coach to the dashboard; a pulsing header toast ("Preparing [client]'s prep
  sheet…") persists while the coach does other work in the browser; when the
  fetch resolves a `PrepModal` slides up over the current view with the full
  editable sheet + Send button (same Editable fields, Regenerate, back links).
  The old `/session/[id]` page stays for direct links. Files: new `PrepContext`
  provider + `PrepToast` in the auth layout, new `PrepModal` component,
  `UpNextPanel` generate buttons become context triggers instead of `<Link>`s.
  Optional upgrade: add a `prep_jobs` Supabase table + Vercel background function
  so the job survives closing the tab entirely.
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
- **External booking capture — near-real-time push path (future work).** The
  capture pipeline (migration 025) currently runs on the **hourly polling cron**
  (`/api/cron/calendar-sync`) — deliberately chosen for v1 (no new infra/consent).
  The upgrade, when sub-hour latency is wanted, is Google's `events.watch` push
  channel instead of polling. The orchestrator (`lib/booking-sync.ts#syncExternalBookings`,
  syncToken-based) and the schema already support it — only the *trigger* changes.
  To build: (1) a public webhook endpoint (e.g. `POST /api/webhooks/google-calendar`)
  that **validates Google's channel token/headers** (store a per-channel secret) and,
  on a ping, calls `syncExternalBookings` for the owning coach — the ping carries no
  event data, so we still pull the delta; (2) a `calendar.events.watch` registration
  per coach (store `channel_id`/`resource_id`/`expiration` on `coaches`); (3) a
  **renewal cron** to re-register before the ~7-day primary-calendar channel expiry
  (and `events.stop` the old channel). Keep the hourly poll as a safety-net backstop
  even with push on, so a missed/expired channel never silently drops bookings.

#### Client-Facing Portal (Major Build — highest complexity)

The client portal is a **separate authenticated area** (`app/(client)/*` or
`app/portal/*`) distinct from the coach's app shell. Clients log in via a
**magic-link or password flow** (not Google OAuth — clients won't have Google
accounts on file). Every data access is **hard-scoped to the authenticated client's
`client_id`** — they can never see another client's data. The portal is the highest-
security surface in the app: no coach-private fields (especially `clients.key_info`)
ever cross the boundary.

**Authentication.** A separate NextAuth provider (email magic-link, or a lightweight
`client_tokens` table with time-limited signed tokens — same pattern as agreements/
agenda). Session carries `clientId` (not `coachId`). All portal API routes validate
this session; no coach session is accepted. Rate-limit magic-link sends.

**Portal workspace layout.** Mirror the card-grid feel of the coach workspace.
Cards:
- **Next appointment** — shows the upcoming session date/time (from `appointments`)
  with a "Schedule / reschedule" link pointing to Jeff's **HubSpot booking link**
  (configurable per coach). Read-only display of the booked slot.
- **Coaching goals** — read-only view of `clients.coaching_goals`. Same
  `{title, description, metrics}` structure, displayed cleanly (no edit in v1).
- **Transcripts** — list of the client's session transcripts (date, title). Each
  is viewable (the transcript text). Used as source material for the AI chat.
- **Notes** — list of session notes the coach has shared/sent to this client
  (from `communications` where `type='email'` or a new `shared_notes` flag on
  `notes`). Viewable in-portal.
- **Frameworks** — cards for each coaching framework discussed with this client
  (sourced from `garden_notes` where `nudge_eligible = true` and linked to this
  client via nudge history or coach-explicit assignment). Each card is clickable
  and opens a **pop-up** with a brief explanation (the leaf's `summary`) and a
  button to **open/download the associated PDF** from the Library (if one is
  linked). The garden leaf → Library PDF link needs a new `garden_notes.pdf_resource_id`
  nullable FK (or a separate mapping table).
- **Recent communication** — last few emails/nudges sent to the client, read-only.
- **Contact coach** — a simple compose form to email Jeff directly (sends via the
  app's Gmail path, logged to `communications` with `direction='inbound'`).

**AI chat (the core value).** A full-width chat interface at `/portal/[clientId]/chat`
(or as a dominant section of the portal workspace):
- Left sidebar: conversation history list (persisted in a new `portal_conversations`
  table — `id`, `client_id`, `title` (auto-generated from first message), `created_at`).
  Clicking a past conversation loads its messages.
- Main area: a large chat box. The system context fed to Claude includes the client's
  transcripts, shared notes, and coaching goals — scoped strictly to their data.
  Claude never sees `key_info` or any other coach-private field.
- **Document upload**: clients can attach a PDF or text file to a conversation turn.
  Stored temporarily (Supabase Storage, `portal-uploads` bucket, TTL-purged) and
  included in the Claude context for that turn only.
- Conversations are persisted message-by-message (`portal_messages` table:
  `conversation_id`, `role`, `content`, `created_at`). Token budgets: cap context
  window to the last N turns + full transcript corpus (summarize older turns if
  needed).

**Quick search.** A search bar (top of portal, similar to the coach workspace search)
that queries transcripts and notes full-text. Results appear as a list with the
client's search term highlighted and ~2 lines of surrounding context. Clicking a
result opens the full transcript or note. Implemented via Postgres full-text search
(`tsvector` on `transcripts.content` + `notes.content`), scoped by `client_id`.
Speed is the design priority — results should appear in under 1 second.

**Onboarding tour.** On first login (tracked via a `portal_onboarded` boolean on
the client record or in `localStorage` keyed by `clientId`), a **guided tour**
walks through each card using step-by-step dialog boxes (consider `react-joyride` or
a lightweight custom implementation). Each card also carries a persistent **ⓘ icon
button** (top-right corner) that opens a small popover describing what the card is
and 2–3 suggested ways to use it. The tour hits these same popovers in sequence.

**Security requirements:**
- All portal routes under a separate middleware guard (`middleware.ts` — match
  `/portal/**`, validate `clientSession` not `coachSession`).
- No cross-client data access — every DB query explicitly filters on the
  authenticated `clientId`.
- `key_info`, `coach_clients`, coach-internal fields never queried from portal routes.
- Magic-link tokens: single-use, 24h TTL, stored hashed in `client_tokens` table.
- Rate-limit: max 5 magic-link sends per client per hour.
- CSRF protection on all portal POST routes (NextAuth handles this for its own
  routes; custom routes need explicit token validation).
- Portal API routes prefixed `/api/portal/**` — separate from `/api/clients/**`
  (coach routes) to make the access boundary explicit and auditable.

**Migrations needed:** `portal_conversations`, `portal_messages`, `client_tokens`
(if magic-link), `garden_notes.pdf_resource_id` (framework → PDF link),
`clients.portal_onboarded` bool, optional `clients.phone` (for SMS magic-link).

**Build order (suggested phases):**
1. Auth layer (magic-link + `client_tokens` + portal session middleware)
2. Read-only workspace cards (goals, transcripts list, notes list, next appointment,
   contact-coach email)
3. AI chat (conversations + messages tables, Claude integration, transcript context)
4. Quick search (full-text index + results UI)
5. Frameworks card + PDF pop-up (garden leaf → PDF link)
6. Document upload in chat
7. Onboarding tour + per-card ⓘ popovers

#### Groups (Major Build — architecture TBD)

A dedicated `/groups` section (sidebar item already stubbed as ComingSoon) for
managing cohorts, mastermind groups, team engagements, or any multi-person
coaching context. Architecture to be designed in a follow-on session; what
follows is the product intent.

**Core concepts.**
- A **group** is a named, coach-owned container with a `status` of `active` or
  `past` (archived). Active groups appear at the top of the Groups list; past
  groups are collapsible below.
- **Members** may be existing `clients` (linked by `client_id`) or **non-client
  participants** (e.g. a team sponsor, an HR administrator, or an observer) stored
  separately — they have an email address and a display name but no individual
  coaching relationship. Both kinds are first-class group members.
- **Roles within a group:** `member` (standard participant), `admin` (group
  administrator — can receive all group communications, see aggregate summaries, and
  co-manage the group's settings), and `coach` (Jeff, always present as owner).
  A non-client can hold the `admin` role; a client can hold either `member` or
  `admin`. Roles are per-group (the same person can be a member in one group and
  an admin in another).

**Groups workspace (`/groups/[id]`).**
- **Group overview card** — name, description, start/end dates, status, member
  count. Edit in place. Archive → moves to past groups.
- **Members card** — roster of all members with role badges. Add a member (search
  existing clients or enter a new name + email for a non-client participant). Remove
  or change role. Clicking a client member navigates to their individual workspace.
- **Sessions card** — group sessions (shared appointments). Schedule a group
  session (creates a single Google Calendar event with all members as guests).
  Upcoming and past group sessions listed with attendance notes.
- **Notes card** — shared session notes for the group (same `notes` table, keyed
  to `group_id` instead of `client_id`, or a parallel `group_notes` table — TBD).
  Coach writes notes during or after group sessions; these are group-scoped and
  never appear in an individual client's workspace unless explicitly linked.
- **Actions card** — group-level commitments and follow-ups, similar to the
  individual `ActionsCard`. Actions can be assigned to the whole group or to a
  named member.
- **Communications card** — log of all group emails and nudges sent (same
  `communications` table, with a `group_id` FK). "View all" expander.

**Notifications & reminders.**
- **Group email compose** — send a message to all members (or a subset filtered by
  role) in one action. Uses the existing Gmail send path; logs one `communications`
  row per recipient. Cc the coach by default.
- **Group nudges** — same review-before-send pattern as individual nudges, but
  targeted to the group. Draft via Claude with group context (shared notes,
  group goals). Coach reviews and sends. Spacing rule applies per-recipient (a
  member who recently received an individual nudge is flagged).
- **Group reminders** — appointment reminders for group sessions fire via the
  existing cron, one email per member, using their individual email addresses.
- **Announcement blast** — a one-off message to the full group (or role subset)
  with no scheduling logic. Plain compose → review → send. Useful for logistics,
  resource shares, or between-session prompts.

**Group goals & frameworks.**
- A group can carry its own **group goals** (separate from any individual client's
  goals) — shared outcomes the cohort is working toward.
- Frameworks from the vault garden can be associated with a group and will appear
  in group communications and (eventually) a group-facing portal view.

**Past groups (archive).**
- Archiving a group sets `status = 'past'` and freezes it — no new sessions,
  notes, or communications. All historical data remains readable.
- Past groups appear in a collapsible section on the Groups list page, sortable
  by end date.

**Data model sketch (to be finalized in architecture session).**
- `groups` — `id`, `coach_id`, `name`, `description`, `status` (active|past),
  `start_date`, `end_date`, `goals` (jsonb), `created_at`.
- `group_members` — `group_id`, `member_type` (client|external), `client_id`
  (nullable FK → clients), `external_name`, `external_email`, `role`
  (member|admin), `joined_at`.
- `group_notes` — `group_id`, `coach_id`, `title`, `content` (HTML), `created_at`
  (or reuse `notes` with a nullable `group_id`; TBD).
- `group_actions` — `group_id`, `description`, `assigned_to` (member or whole
  group), `status`, `due_date`.
- `communications` already has extensible `type`/`direction` — add `group_id`
  nullable FK (migration additive).
- `appointments` already supports group sessions if `client_id` is nullable;
  a `group_id` FK would tie a session to the group.

**Build order (suggested phases):**
1. Schema + migrations (groups, group_members, group_notes, group_actions; extend
   communications + appointments with `group_id`)
2. Groups list page — active/past toggle, create group modal
3. Group workspace — overview, members card (client + non-client), roles
4. Group sessions — schedule, upcoming/past list, calendar event with all guests
5. Group notes + actions
6. Communications — group email compose, log card
7. Group nudges + reminders (extend nudge pipeline with group context)
8. Group goals + framework associations
9. Announcement blast UI
10. (Future) Group-facing portal view — members access shared materials, session
    notes, and group goals through the client portal auth layer
