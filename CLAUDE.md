# CLAUDE.md — theLeadershipWell Coaching Platform

Working notes for Claude (and Jeff) on this codebase. Keep this current as the
app evolves.

## What this is

A coaching platform for Dr. Jeff Holmes (theLeadershipWell). Two pillars:

1. **Session prep** — pulls a client's history (Coach Accountable notes, Zoom/
   transcript context) and uses Claude to generate a personalized prep email,
   sent via Gmail.
2. **Coaching scorecard** — scores recorded sessions against the ICF 2025 Core
   Competencies refined by theLeadershipWell's standards. Spec lives in
   `spec/theLeadershipWell_Session_Report_Spec_v0.3.md` — read it before
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
Prompts Claude with the rubric, then **enforces the §17 gates in code**
(feeling-explorations cap on Competency 6, consultant-move math + >3 mode-drift
flag, threshold flags, equal-weighted overall, band derivation). Output shape =
spec §16 (`lib/scoring/types.ts`). `lib/scoring/aggregate.ts` rolls reports into
the dashboard/scorecard headline numbers.

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
  populates `coaches.google_refresh_token`.
- **Vercel deploys from `main`.** Open a PR → merge → Vercel auto-deploys.
- **Branch hygiene:** PRs are squash-merged, so the long-lived dev branch
  (`claude/practical-allen-uh4ckg`) diverges from `main`. Before pushing a new
  PR, reconcile with: `git fetch origin main && git merge -X ours origin/main`
  (branch content is the superset; this avoids phantom add/add conflicts).
  Verify `git diff --stat origin/main..HEAD` shows only the intended files.

## Migrations applied (001–005; 006 pending)

001 init (clients/notes/actions) · 002 scorecard (coaches/transcripts/
session_reports) · 003 coach calendar (refresh token + timezone) · 004 client
workspace (address + coaching_goals) · 005 CA notes (ca_session_id) · 006
supervisor email (coaches.supervisor_email — run this one in Supabase). Run new
migrations by hand in the Supabase SQL editor.

## Roadmap

### Shipped
- Plaud transcript import (Drive list + per-client import; unmatched transcripts
  surface in the Practice review queue with preview + delete).
- Emailed scorecard — auto-emails the coach after each scored session, plus an
  on-demand "Email this report" from a report (to me / supervisor / other).
- Scorecard now lives under **Practice** (Scorecard sidebar item removed).
- Per-competency **suggested moves** on a report (Claude-generated, persisted).
- Coach self-scoring (top of report) and supervisor email (`coaches.supervisor_email`,
  set on Account).

### Open — keep these tracked (also GitHub issues)
- **Band definitions (spec §18) — PRIORITY, authoring task.** Full band
  definitions for Competencies 1 and 3–8 (only the general bands + Competency 2
  are written). These are the scoring foundation; fold each into the engine
  prompt (`lib/scoring/engine.ts` SYSTEM/rubric) as it locks. Jeff is drafting
  the language.
- **Supervisor cross-coach roll-up view (Phase 3).** Firm-facing dashboard
  rolling up reports across coaches + a Claude-vs-coach comparison. Schema is
  ready (`coach_id` + `role`), and coach self-scores are now captured, so the
  comparison data exists. Needs: a supervisor-scoped aggregate API and a
  `/supervision`-style page (gate on `role = 'supervisor'`).
