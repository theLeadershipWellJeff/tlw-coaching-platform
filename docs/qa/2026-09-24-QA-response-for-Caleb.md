# QA batch 2026-09-24: what changed, and what to re-test

**To:** Caleb
**From:** Jeff
**Re:** your QA report "theLeadershipWell — QA Report & Fix Batch" (Sep 8–24)

Thank you. The report was clear and easy to act on, and the privacy canary checks were exactly right. Here's what happened to each item and what to re-test.

---

## How we worked your batch

1. **Triage.** We worked by area, highest severity first: the Blocker (TLW-001), then the three Majors (002, 003, 004), then the Minors.
2. **Root cause, not symptoms.** We traced each issue to its cause in the code before changing anything. Several of your issues turned out to share one cause:
   - TLW-001 caused most of TLW-002. Every stray empty note became a "billable hour."
   - TLW-009 (rescore "does nothing") was the Claude desktop browser silently blocking a confirmation pop-up. The rescore itself was fine.
3. **Fix, then check.** Every fix passed a typecheck and a production build. We also added a small automated check script (13 checks) for the new rules around notes, hours, actions and tables. None of it has been tested in a real browser yet. That's your part.
4. **Ship.** Everything went live in two releases:
   - PR #272: TLW-001 to TLW-014
   - PR #273: TLW-015 and TLW-020
5. **Privacy held.** No fix widened what reaches a client. Key info still never feeds a client-facing email, nudge or recap.

---

## Status of every issue

| ID | Issue | Status | What changed |
|---|---|---|---|
| TLW-001 | Notes open blank or the wrong note | ✅ Fixed | Every note link now carries that note's ID and opens that exact note. Going back or refreshing no longer creates an extra empty note. Delete now names the note it will delete. |
| TLW-002 | Empty notes counted as paid ICF hours | ✅ Fixed | A note counts as a session only if it has text. Two notes for the same calendar event count once. The hours log, ICF PDF, revenue tiles and billing all use this same rule. The hours widget's "Past week" was really this week, so it now says "This week". |
| TLW-003 | Dashboard greeting in UTC | ✅ Fixed | The greeting and date now use the coach's timezone. |
| TLW-004 | Two action clicks, one recorded | ✅ Fixed (likely cause) | The editor and the server read the note's text slightly differently (spacing). That could make the server delete and re-create an action, which broke the link already sent in the email. Both sides now read the text the same way, and actions on a note already sent to the client are never deleted. |
| TLW-005 | Actions list in reverse order | ✅ Fixed | Actions now show in the order you type them. |
| TLW-006 | Typed timezone city silently dropped | ✅ Fixed | If what you typed clearly matches one city, it's saved. Otherwise a message says it wasn't saved. Also fixed "DenverCO" → "Denver CO". |
| TLW-007 | Map table shows raw pipes | ✅ Fixed | Tables now read as sentences, e.g. "Start-Up — What It Is: Build from scratch; …". |
| TLW-008 | Two "for quick reference" lines | ✅ Fixed | Only one lead-in line now. |
| TLW-009 | Rescore gives no feedback | ✅ Fixed | The confirmation now appears on the page instead of a pop-up. It shows "Analyzing… Ns (about 2 min)", then "Rescored just now". |
| TLW-010 | Calendar card a month behind | ✅ Fixed | The heading now matches the month shown. |
| TLW-011 | Duplicate upload says "Imported 1" | ✅ Fixed | It now says "Nothing imported — <file> is already on file," and a duplicate is never re-scored. |
| TLW-012 | Transcript rows look identical | ✅ Fixed | Each row shows the session date (or the date filed) plus "scored 3.2" or "not scored". |
| TLW-013 | "Thanks for our time today" on bookings | ✅ Fixed | Now reads "Our next session is booked…". |
| TLW-014 | Sync vault does nothing when empty | ✅ Fixed | The button explains that a folder path is needed. A typed but unsaved path is saved before syncing. |
| TLW-015 | No branded cancellation email | ✅ Built | Cancelling in the app now sends a branded "Our session is cancelled" email to the client, copied to the coach. The button reads **"cancel & notify client"**. Google's own cancel email still goes too (see "Decided" below). |
| TLW-020 | Plan questions assume an open action is done | ✅ Fixed | The planner now knows which actions are open and which are done, and won't word an open action as if it happened. |
| TLW-016 | See all open actions across sessions | 💡 Idea, logged | Not built yet. |
| TLW-017 | Scroll, rename and delete on the Session Notes card | 💡 Idea, logged | Partly covered: notes now open by ID and Delete names the note. |
| TLW-018 | Undo when a card is removed | 💡 Idea, logged | Not built yet. |
| TLW-019 | Drag and drop transcripts | 💡 Idea, logged | Not built yet. |

---

## Answers to your five questions

1. **Does an ACTION line become a checkbox in the note itself?** No, and that's intended. The line stays as text in the note; the checkbox lives in the right-hand rail.
2. **Can NEXT TIME lines appear in the client recap?** Yes, that's fine.
3. **Which name signs client emails?** Each coach's own. Your emails signed "Lustarwa "Caleb" Holmes" because that's the full name on your coach profile. **Please fix it yourself:** Account → Profile, set Full name to "Caleb Holmes" and "What should the app call you?" to "Caleb". Check Account → Email signature too.
4. **What goes in the Vault folder path?** For now, leave it empty. Only coaches connecting their own GitHub notes repository need it. Jeff has decided each coach will get a small knowledge base (Wissensgarten) built into the Library, with a repo connection as an option. The design is being confirmed now. Until it ships, "Sync vault" simply tells you a folder path is needed.
5. **Why are there two Sep 9 notes?** The second one was empty, created by the old TLW-001 bug. It wasn't a copy made when you sent the note. It no longer counts as a session.

---

## What to re-test (in this order)

Please re-test in production. For each line, write **Pass / Fail** plus a sentence if it failed.

- [ ] **TLW-001** — On Alpha, click each note in the Session Notes card, then in Client History. Each opens with its own title, date and body, and the note count doesn't change. Press Back and Refresh after "+ New session notes": no new empty note appears.
- [ ] **TLW-002** — Open "+ New session notes", type nothing, leave. The hours log doesn't change. Alpha's hours log shows only real sessions (the empty Sep 9 and Sep 12 notes are gone from it). For the same week, the revenue tile and the hours widget agree.
- [ ] **TLW-003** — After 5 PM Pacific, the dashboard says "Good evening" and shows today's Pacific date.
- [ ] **TLW-004** — Send a note with `ACTION: One` / `Two` / `Three`. In the email, click only **Three**: the workspace shows only Three done. Click **One**: both show done. Click **Three** again: nothing changes. Then reopen the note in the editor and click **Two** in the email. It must still work.
- [ ] **TLW-005** — Type One / Two / Three. The rail shows them in that order while you type.
- [ ] **TLW-006** — Type "Denver", don't click the suggestion, click Save. It either saves as Denver or shows "wasn't saved — pick a city from the list".
- [ ] **TLW-007** — First 90 Days map, component 3: no pipe characters.
- [ ] **TLW-008** — Draft a Goals nudge: the goal appears once, under a single intro line.
- [ ] **TLW-009** — Click rescore: an on-page confirm appears, then "Analyzing… Ns", then "Rescored just now".
- [ ] **TLW-010** — The calendar card names the current month.
- [ ] **TLW-011** — Re-upload an existing transcript: "Nothing imported — … is already on file."
- [ ] **TLW-012** — Transcript rows show a date and "scored x.x" or "not scored" on both the card and the list.
- [ ] **TLW-013** — Book a session: the email has no "thanks for our time today".
- [ ] **TLW-014** — With an empty folder path, Sync vault is disabled and says why.
- [ ] **TLW-015** — Book, then cancel with "cancel & notify client". You get a branded "Our session is cancelled" email: the time is crossed out and there's no Zoom button. It also appears on Recent Communication. (Google's own cancel email also arrives. That's expected.)
- [ ] **TLW-020** — Leave an action open, then Plan next session. No question treats the open action as done.
- [ ] **Privacy canary** — After the tests that send email, nudges or recaps, search every client-facing output for **CANARY**. Any hit is a Blocker.

---

## Decided / not changing

- **Google's own booking and cancel emails stay on for now.** Turning them off would also stop calendar invites for clients who don't use Google Calendar (e.g. Outlook). For now the client gets both the branded email and Google's.
- **Empty notes are kept, just not counted.** Nothing was deleted. Delete stray empty notes from the notes editor if you like (Delete now names the note).

## Still open (not for this round)

- **Billing (Phase 10), client portal (Phase 13), reschedule via Google Calendar (5.2), agreements issue and sign (6.2–6.5), PDFs (8.2).** These weren't tested last round. Portal testing is next in priority after this re-test.
- **The in-app knowledge base for each coach.** Design is being confirmed; there's nothing to test yet.
- **Ideas 016–019** are logged for a future round.

## How to send results back

Use the same format as last time, one block per issue, reusing the TLW IDs. Anything new starts at **TLW-021**. Include the time, the browser, and whether you used the Claude desktop browser or Safari/Chrome. One of last round's issues (TLW-009) came down to the browser.
