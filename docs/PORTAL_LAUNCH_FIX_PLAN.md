# Portal Launch Fix Plan — 360 cohort (prepare early, upload, then invite)

**Date:** 2026-10-07 · **Baseline:** commit `51feb8e` (= main) · **Source:** the four-seat
go/no-go review of 2026-10-06 (CTO, VP Eng, VP Product, QA), every finding verified in code.

**The operating decision this plan is built around (Jeff, 2026-10-07):** participants'
accounts are created **now**, their 360 reports are uploaded **as they arrive**, and the
**invitation goes out only after a person's report is complete**. The invitation is
therefore also the "your report is ready" notice.

---

## 0. What the new sequence already takes care of (no code needed)

- **Creating accounts early sends nothing.** The reminder cron's `decideReminder`
  returns null for a never-invited, never-signed-in client
  (`lib/portal/reminders.ts:142-143` — the welcome ladder requires an invitation;
  comeback/quarterly/weekly all require a prior sign-in). Companies, cohorts, and
  participants can sit fully prepared for weeks with zero client-facing effect.
  **Just don't click any invite button** — including the cohort "Send invitations"
  blast, whose default targets exactly the uninvited.
- **The tour/chat "where's my report?" findings drop to safety-net priority.**
  With a completed report on file before first sign-in, the tour's 360 step is
  true, the 360 starters appear, and the assistant is grounded. They only matter
  now if someone is invited while their report is held (name mismatch / failed
  extraction) — which the playbook below says not to do.
- **The missing "report ready" notification is moot.** The invite IS the notice.
  The `report_ready` reminder kind moves to post-launch.

## 1. What the new sequence does NOT fix (these still fire on invited people)

The welcome-reminder ladder targets **invited-but-never-signed-in** clients — exactly
the state every participant enters at launch. The access-window gap and the invite
batch timeout are also unchanged. These are the P0s.

---

## P0 — must land before the first invitation

### F1 · Welcome reminders repeat every 3 days forever (the launch-critical defect)

- **Defect:** the ladder (day 3, day 10, stop) anchors on `invitedAt` = the **latest**
  `client_tokens` row with `purpose='login'` (`lib/admin/portal-status.ts:60`), but every
  reminder send **mints a fresh login token** (`lib/portal/reminders.ts:281`,
  `createLoginToken` → `lib/portal/tokens.ts:25` always writes `purpose: 'login'`).
  Day-3 send → anchor moves to day 3 → day-6 cron sees age 3 with a fresh period key
  (`welcome-3d-<inviteDay>`, `reminders.ts:148`) → sends again → forever. The ledger's
  unique `(client_id, kind, period_key)` guard can't help because the key moves.
- **Fix (no migration — `client_tokens.purpose` is unconstrained text, 044:16):**
  1. Reminder sends mint `purpose: 'reminder_login'`: add an optional `purpose`
     arg to `createLoginToken` (`lib/portal/tokens.ts:25`, default `'login'`) and pass
     it at `lib/portal/reminders.ts:281`.
  2. Token consumption accepts both: the two `.eq('purpose', 'login')` filters in
     `lib/portal/tokens.ts` (lines ~40 and ~59 — the recent-count and the consume)
     become `.in('purpose', ['login', 'reminder_login'])`, so the emailed reminder
     link still signs people in and still counts against the 5/hour mint cap.
  3. `invitedAt` keeps filtering `purpose='login'` (`lib/admin/portal-status.ts:44`)
     — unchanged — so reminder links no longer move the anchor, while a **manual
     re-invite still deliberately restarts the ladder** (that behavior is intended).
- **Optional (decide):** a client's own `/api/portal/auth/request` also mints
  `'login'` and so also restarts the ladder. Arguably fine (they're engaging);
  if not wanted, mint `'self_login'` there and add it to the consume/count `.in()`.
- **Acceptance:** extend `scripts/spikes/verify-portal-reminders.js`: with
  `invitedAt = day 0` fixed and `welcome-3d-day0` in the ledger, day 6–9 → null and
  day 10 → `welcome-10d-day0`, day 11+ → null. Plus a live
  `curl -H "Authorization: Bearer $CRON_SECRET" …/api/cron/portal-reminders?dryRun=1`
  after an invite on production.
- **Size:** ~10 lines + spike additions.

### F2 · Enforce `portal_access_expires_at` (access windows are currently cosmetic)

- **Gap:** only the reminders cron reads it (`lib/portal/reminders.ts:136`). Nothing
  on the auth/session path does: `lib/portal/server.ts#getPortalClientId` checks only
  `portal_features.archived`; `app/api/portal/auth/request`, `auth/login`, and
  `auth/verify` never look at it. An expired enterprise participant keeps full
  portal + AI chat indefinitely.
- **Fix:**
  1. `getPortalClientId` (`lib/portal/server.ts:21`): extend the existing select to
     `portal_features, portal_access_expires_at`; return null when
     `expires && Date.parse(expires) < Date.now()` — same fail-open posture and the
     same per-request revocation semantics as archived.
  2. `auth/request` and `auth/login`: refuse expired clients with the **same generic
     responses** they already use (no enumeration). `auth/verify` needs nothing extra
     once `getPortalClientId` gates every data read, but adding the same check there
     keeps the control consistent (the CTO's M2 notes archived has the same hole).
  3. `createPortalParticipant` (`lib/admin/debrief.ts:204-209`): refuse — or return a
     warning for — a `cohortId` whose `status` is archived or whose
     `access_expires_at` has passed; today the API accepts what the UI hides.
- **Note for this cohort:** set the cohort access window to the **program** window
  (it denormalizes onto participants at creation); it can be edited later per user.
- **Acceptance:** expired test client → magic-link request returns the generic OK but
  mints nothing; existing session 401s on the next request. Non-expired unaffected.
- **Size:** ~20 lines.

### F3 · Cohort invite batch can be killed mid-send

- `app/api/admin/cohorts/[id]/invite/route.ts:7` sets `maxDuration = 60`; a 25-send
  batch on the Gmail fallback (~17 s of throttle sleep + ~2 s/send) can exceed it.
- **Fix:** `maxDuration = 300`, matching the other long admin routes. One line.
  (Recoverable even unfixed — `onlyUninvited` skips completed sends on retry — but
  there's no reason to carry the risk.)

## P1 — small hardening, same PR

### F4 · Duplicate-email rows break two guards silently

- Two `clients` rows sharing an email make `.ilike(email).maybeSingle()` **error**, and
  both call sites discard the error:
  - `lib/admin/debrief.ts:197-200` — the dup check reads as "no duplicate" and inserts
    a **third** row instead of the 409.
  - `app/api/portal/auth/request/route.ts:29-33` — returns the generic OK while never
    sending a link, with no diagnostic anywhere; that person can never sign in.
- **Fix:** replace both with `.limit(2)` + explicit handling: any row(s) found →
  treat as existing (409 with the first id / send to the first match, and log a
  server-side warning naming the duplicate ids so it gets cleaned up).
- **Size:** ~15 lines across two files.

### F5 · "Support has been notified" can be false

- `portalOutcomeMessage` tells a client with a failed document that support was
  notified, but `notifyDocumentFailure` silently no-ops when Resend is unconfigured,
  even with `SUPPORT_NOTIFY_EMAIL` set (`lib/documents/notify.ts:29-32`), and callers
  ignore the returned `notified:false`.
- **Fix (either, prefer the first):** give `notifyDocumentFailure` the same Gmail
  fallback `lib/portal/send.ts` uses (house coach via `sendCoachHtmlEmail`); or thread
  `notified` into the copy ("…support has been notified" vs "…ask your coach to take
  a look"). Mostly moot once Resend is verified — which the ops checklist requires
  anyway — but the honest path costs little.
- **Size:** ~20 lines.

## P2 — safety nets, recommended in the same PR (low-stakes under the new sequence)

### F6 · Tour 360 step: add a no-report variant

- `app/portal/PortalTour.tsx:67-72` asserts "ready to view or download… the assistant
  has read it too" whenever the flag is on. Under invite-after-upload this is normally
  true — fix it anyway as the safety net for anyone invited while a report is held.
- **Fix:** pass a `hasReport` flag from `app/portal/page.tsx` (server-side
  `loadPortalAssessments` — today only the client-side card fetches it) through
  `PortalShell` like the existing three flags, and give the step a no-report body
  mirroring the `noCoach` mechanism: "…will live at the top of the page — it's being
  added for you; once it's in, the assistant will have read it too."

### F7 · Chat: no-report status line + neutral starters

- With zero document rows `loadAssessmentStatusForChat` returns null
  (`lib/portal/assessments.ts:138`), and the preamble's document fallback
  (`lib/portal/prompt.ts:148`) sends the assistant to "add it under Your documents" —
  i.e., it tells the client to upload the report themselves. The chat page also shows
  the three session-centric coaching starters to people with no sessions
  (`app/portal/chat/page.tsx:40-44, 156-160`).
- **Fix:** (a) in `loadAssessmentStatusForChat`, when `assessmentsEnabled` and no rows
  exist, return "Their 360 report has not been uploaded yet — it will be added for
  them. Do not suggest they upload it; say it's on its way." (~10 lines); (b) a
  neutral starter set when `enabled && documents.length === 0`: "How does a 360
  work?" / "What should I expect from my report?" / "What should I reflect on while
  I wait?"

### F8 · Invitation copy: one line of program context (optional)

- `buildMagicLinkEmailHtml` (`lib/portal/email.ts:7-39`) says only "your coaching
  portal" — no program, no company, no mention that the report is waiting. Under the
  new sequence the invite doubles as the report-ready notice, so one optional line
  ("Your portal for the <Company> leadership program is ready — your 360 report is
  inside.") earns real trust/deliverability. Thread an optional `contextLine` from
  the admin invite routes. **Alternative at zero code:** the sponsor pre-announcement
  plus Jeff's personal note carry this — defer if the week is tight.

## P3 — post-launch (tracked, not blocking)

- **Privacy page accuracy** (`app/portal/privacy/page.tsx`): "Nothing else about you"
  is untrue — the assistant also reads My notes, uploaded documents, sent session
  notes, sessions, weekly plans, and company documents. Tighten before any sponsor
  procurement review.
- **`report_ready` reminder kind** + a "Tell them it's ready" button on the per-user
  page — now only needed for *re*-engagement (someone already active when a new
  report lands). All rails exist (`buildReminderEmailHtml`, `deliverPortalEmail`).
- **Invite sign-off consistency:** `sendPortalLoginEmail` signs portal participants'
  invites with the house coach's personal name while the reminders path deliberately
  uses the firm (`lib/portal/send.ts:56-63` vs `lib/portal/reminders.ts:289`). Apply
  the same `client_type !== 'portal'` guard in `sendPortalLoginEmail`.
- **Chat empty-state copy** ignores `hasCoach` (`app/portal/chat/page.tsx:499-502`).
- **Runbook staleness:** `docs/DEBRIEF_SUPPORT_RUNBOOK.md` navigation path predates
  the Command Center → Client Portal rename. 5-minute doc edit.
- **Scale note:** `listPortalUsers` / `loadCandidates` build `.or('…id.in.(…)')`
  filter strings that grow with every invited client (`lib/admin/debrief.ts:90-91`,
  `lib/portal/reminders.ts:200-201`) — fine at ~113 seats, a URL-length failure in a
  year. Note only.

---

## Suggested PR shape

- **PR 1 (code, before invites):** F1 + F2 + F3 + F4 + F5, plus the spike additions.
  One reviewable PR, all portal-scoped, no migration. Verify: `npx tsc --noEmit`,
  `npm run build`, `node scripts/spikes/verify-portal-reminders.js`, and the two
  production checks below. Tier 2: Jeff merges.
- **PR 2 (copy/UX safety nets):** F6 + F7 (+ F8 if wanted) + the runbook path fix.
  Can trail PR 1 by days without risk given invite-after-upload.

## Production verification after PR 1 deploys

1. Reminders dry run: `curl -H "Authorization: Bearer $CRON_SECRET"
   "https://theleadershipwell.online/api/cron/portal-reminders?dryRun=1"` — expect
   zero decisions for the prepared-but-uninvited cohort; after a test invite, exactly
   `welcome-3d` on day 3 and `welcome-10d` on day 10, nothing between.
2. One end-to-end test participant (your own alias): create → upload a known-good
   360 → invite → phone sign-in → tour → chat "what does my report say?" → budget
   row appears in `ai_usage`.
3. Expiry: set the test participant's access window to yesterday → magic-link
   request yields no email; existing session 401s.

## Ops checklist (unchanged from the review — do before invite day, none blocks account prep)

- Resend: `RESEND_API_KEY` + `PORTAL_FROM_EMAIL` set, domain DNS **verified**; test
  deliverability to Gmail / Outlook / a corporate alias.
- Set `SUPPORT_NOTIFY_EMAIL`; confirm `DEFAULT_COACH_EMAIL` resolves the house coach.
- House coach: Google refresh token live; `booking_url` set.
- Budgets live in SQL: `select scope_id, cap_micros, enabled from ai_budgets where
  scope='client'` → `default:portal` 3,000,000 enabled. (Expect the $3 cap's
  soft-degrade/pause during a heavy debrief week; Extend is on the workspace card.)
- Every real 360 PDF through `verify-batch-360.js <folder>` offline **before** upload
  day — extraction is calibrated on five layouts; a sixth lands as `unsupported`.
- Caleb: supervisor sign-in confirmed; runbook in hand (note the renamed tabs).
- Sponsor pre-announcement: sender name, subject "Your coaching portal invitation",
  and the week invites will arrive.

## The revised playbook (prepare now → upload → invite)

1. **Now:** Companies → create company (vision/values; logo optional). Create cohort
   (seats, access window = the program window, debrief coach name). Add each
   participant under the company: name **exactly as the report cover will read it**,
   email, **Coach = "No coach (portal / 360 only)"** unless genuinely coached. Leave
   the 360 picker empty. Existing coaching clients: take the 409 → "Set up
   <name>'s portal", never a second row. **Send no invites.**
2. **As reports arrive:** per-user page upload with the name-check confirm (or the
   Documents tab bulk upload for a batch — it name-matches and holds ambiguous ones).
   Verify Report = **complete**. A held/mismatched report = no invite for that person
   until resolved.
3. **Invite day(s), only people whose report is complete:** per-person invites, a
   handful per day for two weeks (the warm-up rule) — the invite is the "your report
   is ready" moment, so send it in the morning of the recipient's day (24 h
   single-use link). Save the cohort blast for after warm-up.
4. **Daily:** Portal users tab (invited / last-seen / send warnings), Support tab.
