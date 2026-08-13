# theLeadershipWell Coaching Platform — Product Tester Guide

**Welcome, and thank you for being our first tester.** This document is your
map of the whole app and a step-by-step script for exercising every part of
it. It's organized into **phases** that build on one another the way the
software was built — start at Phase 0 and work down. Later phases assume the
data you created in earlier ones (a client, a note, a transcript), so please
don't skip ahead.

> **How to use this with Claude:** Add this file to a Claude Project. As you
> test, paste the relevant phase into the chat, describe what you did and what
> you saw, and Claude can help you write up a clean bug report to send to
> Jeff. When something breaks or feels wrong, capture it using the **Bug
> Report Template** at the bottom of this document.

---

## Before you start — how to report what you find

For **every** issue, note these five things (template at the end):

1. **Where** — the page/screen and the button or field.
2. **What you did** — the exact steps, in order.
3. **What you expected** to happen.
4. **What actually happened** — copy any error text, take a screenshot.
5. **How bad** — Blocker (can't continue) / Major (feature broken) / Minor
   (cosmetic or annoyance) / Idea (works, but could be better).

**A few ground rules while testing:**

- This is the **live production app** connected to real Gmail, Google
  Calendar, and Stripe. **Emails you send will actually be delivered** and
  **invoices/charges are real money.** Use **your own email addresses** and
  test people you control as "clients." For any billing test, use Stripe
  **test mode** only if Jeff has set that up for you — otherwise **stop and
  ask Jeff before sending an invoice or charging a card.**
- Prefer making **test clients** with obvious fake names (e.g. "Test Client
  Alpha") and your own email so you can see what lands in the inbox.
- Note the **date and time** of anything time-sensitive (reminders,
  scheduled nudges) so we can confirm the follow-up fires.

---

## The big picture — what this app does

theLeadershipWell is a coaching platform with a few connected pillars. Here's
the whole surface so you know what you're looking at:

| Area (sidebar) | What it's for |
|---|---|
| **Dashboard** | Your home base — "up next" sessions, revenue, emails sent, nudges, to-dos. |
| **Practice** | The scored-session workflow: transcript review queue, scorecards, coaching-hours log. |
| **Clients** | The roster (Active / Inactive / Archived) and each client's **workspace**. |
| **Nudges** | The between-session nudge queue — draft, review, schedule, and send short client messages. |
| **Groups** | *(Coming soon — a stub for now.)* |
| **Library** | Note templates, PDF resources, and the master coaching agreement. |
| **Business Center** | Billing: accounts, invoices, billing runs, coaching-hours reporting. |
| **Account** *(top-right menu)* | Your settings — timezone, scheduling/availability, reminders, signature, vault. |

Plus **public pages** clients see (no login): the **e-sign** page, the
**agenda** fill-in, action-item **completion** links, invoice **pay** links,
and the **Client Portal** (a separate client login).

---

# PHASE 0 — Sign in & account setup

**Goal:** get you into the app and confirm the foundational settings are right.
Everything else depends on this.

### 0.1 Sign in
1. Go to the app URL Jeff gave you (`theleadershipwell.online`).
2. Click **Sign in with Google** and use the Google account Jeff expects you
   to test with.
3. **Expect:** you land on the **Dashboard**. A coach profile is created for
   you automatically on first sign-in.
4. ⚠️ **Grant all requested permissions** (Gmail, Calendar) when Google asks.
   If you skip any, scheduling and email tests later will fail.

### 0.2 Set your timezone
1. Open the **top-right user menu → Account**.
2. Find **Timezone** and set it to your local zone. Save.
3. **Expect:** it saves without error and the value sticks after a refresh.

### 0.3 Scheduling settings (availability + reminders)
1. In **Account → Scheduling**:
   - Set your **weekly availability** (e.g. Mon–Fri 9–5).
   - Confirm the **reminders** section shows a confirmation toggle and at
     least one "X hours before" nudge.
   - Optionally set a **meeting (Zoom) link**.
2. Save and refresh — settings should persist.

### 0.4 Email signature
1. In **Account** (or Library, wherever the signature lives), confirm there's
   a **locked signature preview** with the theLeadershipWell logo.
2. **Expect:** the logo renders as an image (not broken), text is correct.

### 0.5 Re-consent check (important)
- Scheduling writes to your Google Calendar. If a later scheduling step says
  something like "insufficient permissions," **sign out and back in** to
  re-grant the calendar scope, then retry.

**➡️ Report anything that blocks sign-in, any settings that won't save, or a
broken signature logo before continuing.**

---

# PHASE 1 — Clients & the roster

**Goal:** create the core record everything hangs off — a client.

### 1.1 Create a test client
1. Go to **Clients**.
2. Create a new client — name it obviously (e.g. **"Test Client Alpha"**) and
   use **your own email**.
3. Fill in as much as you can: email, phone, timezone, address.
4. **Expect:** the client appears in the **Active** list.

### 1.2 The roster toggle
1. Confirm the segmented **Active / Inactive / Archived** toggle at the top,
   each with a count.
2. Create a second client, then on the **Inactive** tab use the hover
   **Archive** button (you may need to set a client inactive first via the
   workspace edit modal).
3. Check the **Archived** tab shows a **Restore** button on hover.
4. **Expect:** Archived clients disappear from Active/Inactive **and** from the
   Dashboard's Clients panel, but their data is still reachable.

### 1.3 Search
1. Use the roster **search** box to filter by name.
2. **Expect:** results filter live; the Active/Inactive/Archived toggle still
   applies.

### 1.4 Email all (bulk email)
1. With a couple of test clients visible, click **Email all**.
2. Compose with the `{{first_name}}` merge token, review the personalized
   preview, then send **only to addresses you control**.
3. **Expect:** each recipient gets an **individual** email (not a group To
   line), a progress bar runs, and any failures list a "Retry failed" option.

**➡️ Common things to catch here:** a client that won't save, the toggle
counts being wrong, search missing a client, or the merge token not filling in.

---

# PHASE 2 — The client workspace

**Goal:** exercise the per-client hub where most day-to-day coaching lives.
Open **Test Client Alpha** from the roster.

### 2.1 Name card & edit
1. Click the **gear** on the name card → edit modal.
2. Change name/email/phone/timezone/status and the **Coaching map** pulldown.
3. Save. **Expect:** changes reflect immediately.

### 2.2 Notes — write a session note
1. Click **New note**. The title should default to `"<client> · <date>"`.
2. In the rich editor, try the toolbar: **bold/italic**, **Title (H2)**,
   **Sub-title (H3)**, **bullet list**, **numbered list**, the **Harvard
   outline** (I. A. 1. …), and **Tab / Shift-Tab** to indent.
3. Type some real content, then add capture lines on their own lines:
   - `ACTION: Send the client the reading list`
   - `INSIGHT: Client lights up when talking about their team`
   - `NEXT TIME: Revisit the delegation goal`
4. Let it autosave (or save). **Expect:** the ACTION line becomes a
   **checkable box**, the INSIGHT shows with a **✦**, and NEXT TIME is
   captured for session planning.

### 2.3 Right-rail context cards
1. **Key info** — add private reference notes (boss/spouse/kids). Save.
   - ⚠️ Key info is **private to you** — it must never appear in any
     client-facing email or AI draft. (We'll verify this in later phases.)
2. **Coaching map** — pick a map, then **click the map's name** to open the
   structure pop-up. **Expect:** it lists the map's components/questions.
3. **Engagement goals** — open **Client goals**, add a goal with a title,
   description, and up to three **metrics**. Save.

### 2.4 Coaching goals card + AI generation
1. On the workspace **Coaching goals** card, try **Generate from notes**.
2. **Expect:** a "generating…" state, then goals appear (fire-and-forget — you
   can navigate away and come back). If it times out, a retry appears.

### 2.5 Actions card
1. Confirm your `ACTION:` line shows in the workspace **Actions card**.
2. Check the box to complete it. **Expect:** status flips to done.

### 2.6 Recent Communication card
- Leave this for now — it fills in once you send emails (Phase 4).

**➡️ Watch for:** editor formatting glitches, capture lines not turning into
actions/insights, goal generation hanging with no retry, or the map pop-up
being blank.

---

# PHASE 3 — Transcripts & scoring (the scorecard pipeline)

**Goal:** get a session transcript into the system and score it. This is the
most complex pipeline, so go slowly.

### 3.1 Import a transcript file
1. In the client workspace, on the **Transcripts** card, click **+ Import**.
2. Upload a file (md / txt / vtt / srt / docx / pdf, under 4 MB). A short fake
   coaching transcript in a `.txt` is perfect for testing.
3. Leave **"Score this session"** checked.
4. **Expect:** the file is attached to this client and a **dark scoring
   progress bar** appears (scoring takes ~2 minutes). You can navigate away —
   it keeps running.

### 3.2 Watch the score land
1. Wait for the progress bar to complete (it holds near the end until the
   report is ready).
2. **Expect:** the transcript row shows as **scored** and links to a report.
3. If it errors, there should be a **retry** — try it.

### 3.3 Read the report
1. Open the scored report (from the client's transcripts list or **Practice →
   Scorecard**).
2. **Expect to see:** eight competency scores, an overall, band explanations,
   any **gate** notes (red flags where a competency was capped), suggested
   moves, and metrics (talk-time, question:statement ratio, etc.).
3. Try the **Rescore** button. **Expect:** the machine score refreshes in
   place; no email is sent on a rescore.

### 3.4 Add without scoring
1. Import another transcript but **uncheck "Score this session"** (a teaching
   session, say).
2. **Expect:** it files on the client as **"not scored"** with a **"score
   now"** button you can use later.

### 3.5 The review queue (Practice)
1. Go to **Practice**. Look for the transcript **review queue**.
2. **Expect:** any unmatched/needs-review transcripts show here with an
   opening-line **preview**, and buttons to **confirm & score** or **add,
   don't score**, plus a way to assign the right client.

### 3.6 Coach self-scoring
1. On a report, add your own **self-scores / notes** at the top.
2. **Expect:** your assessment saves **alongside** (never overwrites) the
   machine score, and survives a rescore.

**➡️ This phase has the most moving parts. Report:** scoring that never
finishes, a wrong client match, a report missing sections, rescore wiping your
self-scores, or the progress bar getting stuck.

---

# PHASE 4 — Communications (email to clients)

**Goal:** confirm the email rails work and that private info stays private.

### 4.1 Compose a branded email
1. In the client workspace, click **Compose Email**.
2. Fill To (prefilled), Cc, Subject, body. Note the **locked signature
   preview**.
3. Review, then send to **your own address**.
4. **Expect:** you receive a branded HTML email with the signature appended,
   Cc'd to the coach; it lands in your Gmail **Sent** folder.

### 4.2 Recent Communication card
1. Back in the workspace, check the **Recent Communication** card.
2. **Expect:** the send is logged (✉ icon, subject, preview, relative time). A
   failed send would show a red "failed" chip.

### 4.3 Send a note to the client
1. Open a note that has `ACTION:` and `INSIGHT:` lines. Click **Send to
   client**.
2. **Expect:** Claude drafts a clean, client-facing narrative (bulleted where
   possible). The insights show as a ✦ list and the actions as a **checklist**.
3. 🔒 **Privacy check:** confirm your **Key info** text does **NOT** appear
   anywhere in the draft. This is critical — report immediately if it does.
4. Send to yourself.

### 4.4 Action completion loop
1. In the email you received, click an **action checkbox** link.
2. **Expect:** a branded confirmation page, and back in the workspace
   **Actions card** that action now shows **done**.

**➡️ Highest-priority bug to report in this phase:** any coach-private field
(especially **Key info**) leaking into a client-facing email.

---

# PHASE 5 — Scheduling & reminders

**Goal:** book a session and confirm calendar + reminder emails fire.
(Requires the calendar permission from Phase 0.)

### 5.1 Book the next session
1. In the client workspace **Sessions card**, pick a date/time/length.
2. As you pick, watch the **conflict check** and the **dual-timezone read-out**
   (your zone and the client's).
3. **Expect:** a real calendar conflict greys out the button; a free slot turns
   the button **blue**; a pick outside your set hours shows an amber warning
   but still lets you book.
4. Book it.
5. **Expect:** a Google Calendar event is created with the client as guest, a
   **confirmation email** is sent (with a **Join the Zoom room** button), and
   the session appears in the **Sessions card** and compactly on the name card.

### 5.2 Reschedule from Google Calendar
1. In **Google Calendar**, drag the event to a new time.
2. Wait for the hourly sync (or ask Jeff to trigger it). **Expect:** the app's
   appointment updates to match; a move over an hour re-arms the reminders.

### 5.3 Cancel
1. In the Sessions card, **cancel** the appointment.
2. **Expect:** the calendar event is removed, the row marks cancelled, and any
   pending reminder won't fire.

### 5.4 Reminders (may need Jeff to trigger the cron)
- Reminders fire on an hourly schedule. To test quickly, book a session whose
  reminder window is **now** (e.g. within the next 24h if you have a 24h
  reminder), and confirm the nudge email arrives. Note the time you expect it.

**➡️ Report:** an event not appearing in Google Calendar, no confirmation
email, a broken Zoom link, or reminders that double-send or never arrive.

---

# PHASE 6 — Coaching agreements & e-sign

**Goal:** issue an agreement, sign it as the "client," and confirm the coach
side updates.

### 6.1 Review the master template
1. Go to **Library → Agreement**. Confirm the two-column editor with
   **locked** ICF/legal blocks and a live preview. Make a small edit, save.

### 6.2 Issue an agreement
1. In the client workspace **Agreement card**, click **Issue**.
2. Walk the flow: details → payment → **review (scroll-to-bottom gate)** →
   send.
3. **Expect:** the client (you) gets a branded email with a **Review & sign**
   button linking to a `/sign/<token>` page.

### 6.3 Sign it (as the client)
1. Open the emailed link. **Expect:** the full agreement renders.
2. Choose a **recording authorization** option and type your name to accept.
3. Submit. **Expect:** a confirmation, and you (as coach) get a notification
   email; the client gets their signed copy.

### 6.4 Coach side updates
1. Back in the workspace, the **Agreement card** should now show **active**,
   the recording status, and (if you chose "do not record") a **compliance
   banner**.
2. **Expect:** `agreement on file` and `recording authorized` are now set on
   the client — this is what the scoring **Gate 1** reads.

### 6.5 External acknowledgment (no re-issue)
1. In the edit-client modal's **Agreement & recording** section, toggle
   **"Signed coaching agreement on file"** and pick a recording choice.
2. **Expect:** it saves without issuing a platform agreement.

**➡️ Report:** the sign page erroring, the scroll gate not enforcing, or the
coach side not updating after signing.

---

# PHASE 7 — Nudges (between-session messages)

**Goal:** draft, review, and send a nudge. Nothing auto-sends — you always
review first.

### 7.1 Draft nudges from a session
1. After scoring a session (Phase 3), nudges may be drafted automatically. Or
   in the workspace **Nudges card**, click **Draft nudges**.
2. **Expect:** draft nudges appear (action check-in / insight / framework
   types), capped at 2 per window.

### 7.2 The Nudge Queue
1. Go to **Nudges**. Confirm the grouped view: **Needs review** / **Scheduled**
   / a read-only **Sent** panel.
2. Open a nudge and edit the subject/body/time. Add a **Coach note** (private —
   never sent to the client).

### 7.3 Create a nudge manually
1. Click **+ Create nudge**, pick a working client, and try the tiles:
   **action**, **insight**, **framework**, and **goals**.
2. For a **goals** nudge, pick a goal (or "All goals") and an **angle**
   (reminder / assessment / win). **Expect:** the selected goal is listed
   verbatim in the body.

### 7.4 Send / schedule / snooze / skip
1. Try **Send now** to your own address. **Expect:** it sends via your Gmail,
   logs to communications, and moves to **Sent**.
2. Try **Schedule** for a future time. **Expect:** it moves to **Scheduled**
   and the hourly cron sends it when due.
3. **Spacing rule:** if you just emailed this client, a nudge send should be
   **refused** if it's inside the spacing window (default 4 days).

**➡️ Report:** nudges leaking Key info, the goal block missing/duplicated,
the coach note showing up in the client email, or spacing not enforced.

---

# PHASE 8 — Library (templates, PDFs, merge fields)

**Goal:** exercise the Library folder system.

### 8.1 Templates
1. **Library → Templates.** Create a folder, then a **note template** inside it.
2. Embed **merge fields**: `{{client_name}}`, `{{today}}`,
   `{{unfinished_actions}}`, `{{recent_insights}}`, `{{coaching_goals}}`.
3. In a client note, use the editor's **Templates** dropdown to insert it.
4. **Expect:** the merge fields resolve to that client's live data.

### 8.2 PDF resources
1. **Library → PDF Resources.** Create a folder and **upload a PDF** (under
   4 MB). View it (signed URL) and delete it.
2. **Expect:** upload/view/delete all work; a too-large file is rejected
   cleanly.

### 8.3 Custom labels
1. Use the inline **pencil** to rename a Library home tile (Templates / PDF /
   Agreement / Unfiled). **Expect:** the display label persists per coach.

**➡️ Report:** merge fields not resolving, PDF upload failing, or a rename not
sticking.

---

# PHASE 9 — Session prep & planning

**Goal:** the prep tools that get you ready for the next session.

### 9.1 Plan next session
1. In the client workspace action bar, click **Plan next session** (orange).
2. **Expect:** a card opens with any **NEXT TIME** flags up front, a quick
   summary, three opening questions, and collapsible supporting context
   (goals / actions / insights). It's ephemeral — nothing is saved.

### 9.2 Agenda fill-in (client-facing)
1. When a session-prep email goes out it includes a **"Help shape our
   agenda"** link. Open the public agenda page and submit answers.
2. **Expect:** the workspace **Agenda card** shows the client's answers.

**➡️ Report:** the plan card failing to generate (it should still show the
deterministic lists even if the AI part fails), or agenda answers not showing.

---

# PHASE 10 — Business Center (billing) ⚠️ REAL MONEY

**Goal:** exercise billing. **Do not send a real invoice or charge a real card
without clearing it with Jeff first.** Read each step, but **pause before any
"send" or "charge" action** and confirm the environment.

### 10.1 Explore, read-only first
1. Go to **Business Center**. Look at **Accounts**, **Invoices**, the
   coaching-hours reporting, and the **Run** (billing run) screen.
2. **Expect:** the layout loads, accounts/invoices list correctly, and an
   enterprise account groups its clients under an account header.

### 10.2 Assemble a billing run (stop before sending)
1. Open a **billing run** and assemble sessions for a test account.
2. **Expect:** sessions roll up correctly with the right amounts.
3. **⛔ STOP** before **approve → send** unless Jeff has confirmed test mode.

### 10.3 Invoice detail
1. Open a draft invoice. Confirm you can edit the **client message** while
   it's draft/approved, and that it locks once sent.

### 10.4 Payment on file (only with Jeff)
1. The authorization flow emails the client a link to add a card via Stripe's
   hosted page. **Only test with Jeff present** and a Stripe **test** card.
2. Note the **agreement gate**: an authorization link can't be sent unless
   **every** client on the account has an agreement on file.

**➡️ Report:** wrong totals, enterprise grouping not working, the client
message not locking, or the coaching-hours numbers looking off. **Escalate any
real charge or send you didn't intend immediately.**

---

# PHASE 11 — Coaching hours & ICF log

**Goal:** the hours widget for ICF reporting.

1. Find the **Coaching hours** widget (it appears on the **Dashboard**, in
   **Practice**, and in the **Business Center**).
2. Toggle **past week / month / year**.
3. Click **View log** — a chronological list of sessions (client, date,
   duration).
4. **Export CSV.** **Expect:** the CSV opens cleanly and totals match the
   widget.

**➡️ Report:** totals that don't reconcile, missing sessions, or a broken CSV.

---

# PHASE 12 — Dashboard (ties it all together)

**Goal:** confirm the home dashboard reflects everything you've done.

1. Go to **Dashboard**. Check the panels:
   - **Up next** — upcoming sessions in your timezone; try a **Skip** button.
   - **Revenue** cards (Past / Projected / Annual) — click one to open the
     **by-client donut** breakdown.
   - **Emails Sent** — click → modal list → a row links into the client
     workspace.
   - **Nudges** — click → modal list → row links to the client's Nudges card.
   - **Unmatched bookings** — external (Calendly/HubSpot) bookings that need a
     client assigned.
   - **To-dos / today.**
2. **Expect:** numbers match what you created in earlier phases.

**➡️ Report:** a card showing stale or wrong numbers, or a link that goes to
the wrong place.

---

# PHASE 13 — Client Portal (the client's own login)

**Goal:** the separate, client-facing area. This is a walled-off login — a
coach session is never accepted here, and no coach-private data crosses over.

### 13.1 Invite & sign in
1. In the client workspace action bar, click **Invite to portal**.
2. As the "client" (your email), open the magic link and sign in at
   `/portal`. **Expect:** a magic-link login (no Google), single-use, ~24h TTL.

### 13.2 Read-only cards
1. **Expect to see:** next appointment, coaching goals (read-only),
   transcripts/sessions list, recent messages, and a **Contact your coach**
   form.
2. 🔒 **Privacy check:** you should **never** see Key info or coach notes here.

### 13.3 AI chat
1. Open **/portal/chat**. Ask a reflective question about your coaching.
2. **Expect:** Claude answers using only *your* goals + transcripts. Try the
   **paperclip** to attach a PDF/Word/text file for that turn.
3. Conversation history persists in the left sidebar.

### 13.4 Search
1. Use the portal **search** to find a word from a transcript. **Expect:**
   fast results with highlighted matches, scoped to your data only.

### 13.5 Frameworks
1. If any framework was surfaced to you (via a framework nudge), the
   **Frameworks** card shows it; open the pop-up and the **PDF** if attached.
2. **Expect:** you can only ever open a framework/PDF that was actually
   surfaced to you.

### 13.6 Onboarding
1. On first visit, a **welcome modal** appears (dismissal remembered). Each
   card has an **ⓘ** tip popover.

**➡️ Highest-priority bug in this phase:** any cross-client data (seeing
another client's info) or any coach-private field appearing in the portal.
Report instantly.

---

# PHASE 14 — Vault / garden sync (framework source)

**Goal:** the coach's "mind garden" that feeds framework nudges.

1. In **Account → Vault**, confirm the **vault folder path** setting and a
   **Sync vault** button.
2. Click **Sync vault**. **Expect:** a summary like "Indexed N leaves (X
   surfaceable, Y edges)."
3. Below, confirm the indexed leaves list with type/themes/eligibility.

**➡️ Report:** sync failing, a count of zero when you expect content, or leaves
not listing. *(This one may need Jeff to confirm the vault repo is connected.)*

---

# PHASE 15 — Coming soon / stubs (quick check)

1. Click **Groups** in the sidebar. **Expect:** a clean "Coming soon"
   placeholder — no error.
2. Note any other tiles marked as stubs behave the same.

---

## Suggested testing order (summary)

```
Phase 0  Sign in & account setup      ← do first, everything depends on it
Phase 1  Clients & roster             ← creates the core record
Phase 2  Client workspace             ← notes, goals, key info, map
Phase 3  Transcripts & scoring        ← the scorecard pipeline
Phase 4  Communications (email)       ← + privacy checks
Phase 5  Scheduling & reminders       ← needs calendar permission
Phase 6  Agreements & e-sign
Phase 7  Nudges
Phase 8  Library
Phase 9  Session prep & planning
Phase 10 Business Center (billing)    ← ⚠️ real money, clear with Jeff
Phase 11 Coaching hours & ICF log
Phase 12 Dashboard                    ← confirms everything reflects
Phase 13 Client Portal                ← separate client login
Phase 14 Vault / garden sync
Phase 15 Coming-soon stubs
```

---

## Bug Report Template (copy this for each issue)

```
TITLE: <one-line summary>

PHASE / SCREEN: <e.g. Phase 4 — Compose Email>
SEVERITY: Blocker | Major | Minor | Idea

STEPS TO REPRODUCE:
1.
2.
3.

WHAT I EXPECTED:

WHAT ACTUALLY HAPPENED:
<paste any error text>

EVIDENCE: <screenshot / the email I received / etc.>

NOTES: <timezone, time of day, which client, anything else>
```

---

## Things to watch across the whole app (a checklist)

- 🔒 **Privacy:** Key info and coach notes must **never** reach a client
  (emails, note-to-client, nudges, the portal). This is the #1 thing to catch.
- 💸 **Real money & real email:** every send/charge is real. Use your own
  addresses; clear billing with Jeff.
- ⏱️ **Background jobs:** scoring (~2 min), goal generation, and nudge sends
  run in the background — you can navigate away, but confirm they finish (or
  offer a retry).
- 🕑 **Timezones:** confirm times show correctly in both your zone and the
  client's, and that reminders fire when expected.
- 🔁 **Idempotency:** re-doing an action (rescore, mark-paid, resend) shouldn't
  duplicate emails or double-charge.
- 🖼️ **Branding:** logos should render as images, not broken/blank boxes.

**Thank you!** Your reports are exactly how we make this solid. When in doubt,
write it down and send it to Jeff — a "maybe it's nothing" note is always
welcome.
