# theLeadershipWell Coaching Platform — Current State

> **Purpose of this doc.** A plain-language, strategic snapshot of what the app
> *is* and *does today*, written to drop into a Claude Project (or any chat) so
> the assistant has full context for strategy and prompt-building work — without
> needing to read the codebase. For engineering-level detail, the canonical
> source remains `CLAUDE.md` in the repo root; the scoring rubric source of truth
> is `spec/theLeadershipWell_Session_Report_Spec_v0.4.md`.
>
> _Last updated: 2026-06-21._

---

## 1. What this is

A coaching platform for **Dr. Jeff Holmes (theLeadershipWell)**. It is the
operating system for a one-coach (extensible to multi-coach) executive-coaching
practice. The app has grown from two original pillars into a full client
lifecycle hub.

**The two founding pillars:**

1. **Session prep** — pulls a client's history (Coach Accountable notes, Zoom /
   transcript context) and uses Claude to generate a personalized prep email,
   sent via Gmail.
2. **Coaching scorecard** — scores recorded sessions against the **ICF 2025 Core
   Competencies**, refined by theLeadershipWell's own standards (the "v0.4 rubric").

**Everything else** has been built around those two to run the whole practice:
client workspace, roster, scheduling, agreements/e-signing, branded email,
communication logging, between-session nudges, and a connection to Jeff's
personal knowledge "garden."

---

## 2. Who uses it

- **The coach (Jeff)** — the primary user. Signs in with Google. Runs the entire
  practice from here.
- **Clients** — never log in. They interact only through **public, token-gated
  pages** sent to them by email: sign an agreement, fill in a prep agenda,
  one-click "mark this action done," and receive nudges / prep emails / their
  signed copies.
- **Supervisor (future)** — schema is ready (`role = supervisor`) for a
  cross-coach roll-up view; not built yet.

---

## 3. Tech stack (so prompts are realistic about constraints)

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind**.
- **Supabase** (Postgres) — all tables RLS-enabled with **no public policies**;
  reached only via the service-role key server-side. **Tenant isolation is
  enforced in application code by the signed-in coach, not by Supabase RLS.**
- **NextAuth** (Google OAuth) — also the source of Gmail / Calendar / Drive
  access tokens and the stored refresh token for unattended sends.
- **Anthropic SDK (Claude)** for all generation and scoring.
- Deployed on **Vercel** (production builds from `main`), domain
  `theleadershipwell.online`. Hourly **Vercel Cron** jobs drive reminders,
  nudges, vault sync, and calendar sync.
- **No automated test suite.** Verification = `npx tsc --noEmit` + `npm run build`,
  plus throwaway node scripts for pure logic.

---

## 4. The big picture — what the app can do today

### A. Roster & client workspace
- A **roster** of clients (linked to Coach Accountable via `ca_client_id`),
  importable in bulk.
- A per-client **workspace hub** (`/clients/[id]`) that pulls everything about a
  client into one screen: name/contact card, coaching goals, transcripts + notes
  summaries, actions, agreements, scheduling, communications, agenda answers, and
  nudges.
- A right-hand **session-notes panel** for live capture during/after a session:
  `ACTION:` and `INSIGHT:` lines, plus persistent per-client context — **Key info**
  (private to the coach), **Coaching map** (which framework the client is on), and
  **Engagement goals**.

### B. Note-taking system
- A rich **TipTap editor** (bold/italic, headings, lists, a **Harvard outline**
  mode, Tab-to-indent).
- **Note templates** with **merge fields** (`{{client_name}}`, `{{today}}`,
  `{{unfinished_actions}}`, `{{recent_insights}}`, `{{coaching_goals}}`), organized
  in the Library.
- `ACTION:` lines in a note auto-sync into a real `actions` table and become
  checkable items; `INSIGHT:` lines surface as insights. These flow to the
  workspace and into client emails.

### C. Coaching goals = the source of truth
- `clients.coaching_goals` is the sacred list: each goal is `{title, description,
  metrics?}`. It is edited in two synced places and **directly feeds the
  session-prep email's coaching plan** (the email uses stored goals rather than
  inventing them).

### D. Session prep & client-facing email
- Generates a personalized **prep email** from goals + notes + Zoom context.
- **"Send to client"** turns a note into a clean, client-facing narrative (via
  Claude), with an interactive **action checklist** (each box is a one-click
  "log this as done" link) and an **insights** list.
- **Compose Email** — a raw compose → review → send flow with a locked,
  server-appended **branded signature**. Every send is logged.

### E. Coaching scorecard (the IP-heavy core)
- Recorded sessions (transcripts) are scored against the **v0.4 rubric**: explicit
  1–5 band definitions for all **eight ICF competencies**, plus named
  cross-competency principles (Attunement Standard, Exploration Gate, Authorship
  Hinge, Consultant Pull Signature).
- Claude makes the **judgment calls** (three-way emotion classification,
  evocative-reframe vs. consultant-move, band-4 standards); **deterministic rules
  are enforced in code** (talk-time, question:statement ratio, equal-weighted
  overall, band derivation, and **three gates**).
- **The three gates** (each caps a competency):
  - **Gate 1** — no recording consent on file *and* no verbal consent at open →
    C1 ≤ band 2.
  - **Gate 2** — no named insight at close *and* no standing engagement →
    C3 ≤ band 2.
  - **Gate 3** — zero feeling explorations → C6 ≤ band 3.
- Reports are emailable (to coach / supervisor / other), carry **per-competency
  suggested moves**, support **coach self-scoring** alongside the machine score
  (never overwritten), and can be **re-scored** in place against the current rubric.

### F. Coaching agreements (build → issue → e-sign)
- A single **structured master template per coach** with locked ICF/legal blocks
  and a live preview.
- **Issue** to a client → snapshots the rendered document, mints a 30-day
  magic-link, emails a branded CTA.
- Client **e-signs** on a public page (recording-authorization choice + typed-name
  acceptance) → writes an immutable signed snapshot, notifies the coach, sends the
  client their copy, and **promotes `agreement_on_file` + `recording_authorized`
  onto the client record** — which is exactly what scoring **Gate 1** reads.

### G. Scheduling, reminders & external booking capture
- **Book the next session** from the workspace: creates a Google Calendar event
  (client as guest), confirmation email, dual-timezone read-out, and a
  **conflict-aware picker** (Google free/busy check; warns on out-of-availability).
- **Per-coach scheduling settings**: weekly availability + configurable reminders
  (confirmation + any number of "X hours before" nudges), driven by hourly cron.
- **Calendar is the boss** — appointments reconcile to the calendar event (drag to
  reschedule in Google Calendar and the app follows; deletes cancel).
- **External booking capture** — Calendly / HubSpot links both write to Google
  Calendar, so an hourly **calendar-watch cron** captures those bookings as the
  client's "Next Appointment" too. Bookings that can't be matched to a client land
  in a dashboard **Unmatched bookings** review queue (assign or dismiss).

### H. Between-session nudges (Phases A + B + C)
- A **nudge** is a short, warm, client-facing message the system **drafts** and the
  coach **reviews before it sends** (nothing auto-sends without coach approval).
- Triggered automatically after a session is scored (and on demand). Pipeline:
  load context → Claude extracts candidates → dedup + cap (2 per window) → Claude
  drafts subject+body **in the coach's voice** → saved as `draft`.
- Three live types: **action check-in**, **insight**, and **framework**.
  (`reengagement` reserved for later.)
- **Framework nudges** connect a session back to a piece of Jeff's knowledge garden
  — proposed when the session **named** a framework, when **themes match**, or
  (Phase C) when a **graph connection** bridges what the client raised to a
  framework Jeff *didn't* mention. The draft can draw the explicit bridge.
- Reviewed in two places: a cross-client **Nudge Queue** (`/nudges`) and the
  per-client workspace card. Actions: Send now / Schedule / Snooze / Skip.
- A **spacing rule** refuses a send if the client got any outbound message within
  the configured window (default 4 days). An hourly cron dispatches scheduled
  nudges.
- The dashboard surfaces **suggested nudges** as an at-a-glance lego/panel.

### I. The "garden" — Jeff's knowledge vault as a connected index
- Jeff's **mind garden** lives in a separate GitHub repo (`TheLeadershipWell-Vault`),
  authored collaboratively (Claude Code + Obsidian).
- The app **reads it only** and builds a derived **node + edge index**
  (`garden_notes` + `garden_edges`) — **pointers and the association graph only,
  never note content** stored in the DB.
- A note is an indexable **leaf** if its frontmatter carries `nudge_eligible` /
  `themes`. **`nudge_eligible: true`** is the separate gate for whether a leaf may
  ever be shown to a client.
- Synced manually (Account → Vault) or hourly via cron. **This is what powers
  framework nudges** — at draft time the live leaf content is pulled fresh from
  GitHub.

### J. Library
- A two-section **folder browser**: **Templates** (note templates) and **PDF
  Resources** (uploaded files in private Storage). Folders are coach-scoped; the
  coach can rename the fixed Library tiles.

---

## 5. The privacy & trust rules that shape everything

These are firm product constraints — keep them in mind for any strategy/prompt work:

1. **Key info is private to the coach.** `clients.key_info` must **never** feed any
   client-facing generation (prep, nudges, send-to-client drafts).
2. **The machine score never overwrites the coach's self-score** (and vice versa) —
   they are parallel.
3. **Nothing auto-sends to a client without coach review** in the nudge system.
4. **Tenant isolation is server-side by signed-in coach** — every client route
   gates on coach ownership (returns 404, not 403, on no access).
5. **Public client pages are token-gated** — the unguessable token *is* the
   credential (agreements, agenda, action-completion, signing).
6. **The vault is read-only** to the app and **never stores note content** in the DB.
7. **Signatures are appended server-side** — the client of the API is never trusted
   to include them.

---

## 6. Key automated pipelines (how data flows on its own)

- **Transcript → scored report.** Plaud.ai finishes a transcript → Zapier POSTs it
  to the app → dedupe → parse → **match client** (email → name → calendar event
  guest) → **score** → email the coach the scorecard → **trigger nudge drafting**.
  Uncertain matches go to a **needs-review** queue (never guessed).
- **Hourly crons:** reminders, nudge dispatch, vault re-index, calendar/booking sync.
- **Action completion loop:** client clicks a checkbox link in an email → public
  endpoint flips the action to done → workspace reflects it.

---

## 7. Current surface map (for orientation)

**Signed-in app:** `dashboard`, `clients` (roster), `clients/[id]` (workspace) +
`/notes` + `/transcripts`, `practice` (+ `practice/[id]` = a scored report),
`nudges` (Nudge Queue), `library` (+ `library/agreement`), `account`. Stubs:
`groups`, `templates`.

**Public (token) pages:** `sign/[token]` (e-sign agreement), `agenda/[token]`
(prep agenda fill-in), action-completion links.

**Older standalone flow:** `session/[id]` (the original prep-email generator).

---

## 8. What's shipped vs. open

### Shipped & live
Session prep · scorecard (v0.4 rubric, gates, suggested moves, coach self-scoring,
emailed reports, rescore) · client workspace + notes panel · coaching goals with
metrics · note templates + merge fields + rich editor · send-to-client + action
checkboxes · branded email + communications log · coaching agreements (build →
issue → e-sign) · prep-sheet agenda fill-ins · scheduling + reminders +
conflict-aware picker + scheduling settings · external booking capture (Calendly/
HubSpot via calendar watch) + unmatched-bookings review · between-session nudges
(Phases A/B/C incl. graph-connection framework nudges) · vault → garden index ·
Library folder system · coach timezone setting · dashboard "up next" + suggested
nudges.

### Open / planned (tracked as GitHub issues)
- **Worksheets** (client fill-in) — builder + public fill-in page (#38).
- **Supervisor cross-coach roll-up view** (Phase 3) — schema ready, needs a
  supervisor-scoped aggregate API + page (#40).
- **`reengagement` nudge type** — reserved for a later phase.
- **External booking near-real-time push** — currently hourly polling; upgrade path
  is Google `events.watch` push channels (orchestrator/schema already support it).
- **Config-driven client workspace** (block registry + slot model) — planned
  refactor; spec exists (`spec/TLW_Block_Registry_Architecture_v1.md`); not built.

---

## 9. Mental model for strategy & prompt work

If you're helping Jeff with **strategy or prompt-building**, the useful frame is:

- The app is a **practice operating system** with a strong **IP core** (the v0.4
  scoring rubric and the garden of frameworks). Most strategic leverage is in
  **the quality of Claude's judgment** (scoring, nudge drafting, prep generation)
  and in **connecting the garden to client moments** (framework nudges).
- The **coach is always in the loop** for anything client-facing — so prompts can
  be ambitious in *drafting* because there's a human review gate.
- The **privacy walls** (esp. key-info) are non-negotiable inputs to any prompt.
- The **goals list** is the spine that prep and reporting hang off of.
- New capabilities tend to be built as **extensions of existing rails** (Gmail send,
  the communications log, the token-page pattern, the calendar-as-source-of-truth)
  rather than net-new infrastructure — a good default instinct for proposals.
