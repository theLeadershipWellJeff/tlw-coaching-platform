# Client Portal — gap analysis

**Date:** 2026-08-15 · **Branch:** `claude/client-portal-gap-analysis-apaycj`
**Scope:** Jeff's client-portal vision statement vs. what is actually in the code
today (`app/portal/**`, `app/api/portal/**`, `lib/portal/**`, migrations 044/045).

Portal Phases 1–7 shipped (PRs up to #200). Roughly **60% of the vision is
built**, but three of the load-bearing pieces — **notes**, **billing**, and
**self-scheduling** — do not exist at all, and the two features Jeff called the
"main feature" and "where the power will lie" (AI over notes+transcripts, and
fast search) are each built against **transcripts only**.

> **Decisions recorded 2026-08-15** (Jeff). The four open questions are settled —
> see [Decisions](#decisions-settled-2026-08-15) at the end. In short: the portal
> shows **only notes sent via "Send to client"**; **enterprise coachees see no
> billing**; **username/password is added alongside magic-link**, with the coach
> able to resend the link; frameworks appear when **nudged *or* mentioned in a
> session**; **ACH is deferred**. The sections below have been revised to match.

---

## Scorecard

| # | Requirement (from the brief) | Status | Where |
|---|---|---|---|
| 1 | "Well password protected very secure area" (+ username/password, coach resend) | ⚠️ Partial | `lib/portal/session.ts`, `middleware.ts` |
| 2 | Check scheduled appointments | ⚠️ Partial | `lib/portal/data.ts:29` |
| 3 | Ability to schedule with me (HubSpot link, at the top) | ❌ Missing | — |
| 4 | Notes (those sent to the client) available in the workspace | ❌ Missing | — |
| 5 | Transcripts available in the workspace | ⚠️ Partial | `app/portal/page.tsx:132` |
| 6 | AI chat over **transcripts and notes** | ⚠️ Partial | `lib/portal/chat.ts` |
| 7 | Conversation sidebar (Claude-style) | ✅ Built | `app/portal/chat/page.tsx:131` |
| 8 | Upload documents into conversations | ✅ Built | `app/api/portal/chat/upload/route.ts` |
| 9 | Coaching goals card | ✅ Built | `app/portal/page.tsx:107` |
| 10 | Frameworks card → pop-up → open/download PDF (nudged **or** mentioned) | ⚠️ Partial | `app/portal/FrameworksCard.tsx` |
| 11 | Email the coach from the portal | ✅ Built | `app/portal/ContactCoachCard.tsx` |
| 12 | Quick search **over transcripts and notes**, fast, with context lines | ⚠️ Partial | `app/api/portal/search/route.ts` |
| 13 | Tour guide — dialogue boxes walking each card | ⚠️ Partial | `app/portal/PortalOnboarding.tsx` |
| 14 | ⓘ icon on each card: what it is + a few ways to use it | ⚠️ Partial | `app/portal/InfoPopover.tsx` |
| 15 | Billing: card/ACH on file at setup, bills paid, change billing | ❌ Missing | — |

---

## 1. Security — "well password protected very secure area"

**What exists.** The boundary itself is sound and deliberately built:

- Separate signed cookie (`tlw_portal_session`) carrying **only** `clientId`,
  HMAC-SHA256 via Web Crypto, keyed on `NEXTAUTH_SECRET`
  (`lib/portal/session.ts`). A coach's NextAuth session is never accepted here
  and vice-versa.
- Edge `middleware.ts` guards `/portal/**`, allowing only `/portal/login` and
  `/portal/verify`.
- Magic-link tokens stored as **sha256 hashes only**, single-use with a race-safe
  claim (`is('used_at', null)`), 24h TTL, 5 sends/client/hour
  (`lib/portal/tokens.ts`).
- Anti-enumeration: `/api/portal/auth/request` always returns a generic `ok`
  (`app/api/portal/auth/request/route.ts:20`).
- Verify is a **POST** from the page, so email scanners can't burn the token.
- Every portal query is hard-scoped to the authenticated `clientId`; `key_info`
  is never selected in any portal read path (verified across `lib/portal/*`).

**Gaps against the brief:**

| Gap | Detail |
|---|---|
| **No password at all** *(decided: build it)* | Sign-in is magic-link only — no password, no reset, no 2FA. **Decision: add username + password alongside magic-link**, which stays as the recovery path. Build: a `client_credentials` table (`client_id`, `username` unique, `password_hash`, `created_at`, `last_login_at`, `failed_attempts`, `locked_until`) hashed with bcrypt/Argon2 — never on `clients`, so a stray `select *` in a portal read can't leak the hash. Offer "create a password" at first login and from a portal settings page. Needs login throttling (lockout after N failed attempts) — the current magic-link rate limit does not cover a password form. |
| **Coach-side credential view + resend** *(decided: build it)* | **Decision: the coach can see the client's login state and resend the link.** Half of this exists — `InviteToPortalButton` → `POST /api/clients/[id]/portal-invite` already mints and emails a fresh magic link, so "resend when they lose credentials" is essentially done and just needs surfacing as such. What's missing is the **status view**: username, whether a password is set, and last portal login, on the client workspace. Note for the UI copy: the coach can **never** see the password itself (it's a one-way hash) — the affordances are *resend link* and *trigger a password reset*, not *reveal password*. |
| **7-day session, no rotation** | `PORTAL_SESSION_TTL_SECONDS = 7 * 24 * 3600` with no sliding renewal, no server-side revocation list, and no "sign out everywhere." A stolen cookie is valid for up to 7 days with no kill switch. |
| **No CSRF token on portal POSTs** | Mitigated in practice by `sameSite: 'lax'` (cross-site POSTs don't carry the cookie), but there's no explicit token — worth noting since the brief calls this the highest-security surface. |
| **No rate limiting past login** | `/api/portal/chat` (a paid Claude call), `/api/portal/contact` (sends email as the coach), and `/api/portal/chat/upload` have **no** per-client rate limit. A logged-in client can loop the chat endpoint. Only the magic-link send is limited. |
| **No audit log** | No record of portal logins, chat sessions, or PDF opens. For a surface holding full transcripts, a `portal_access_log` is cheap insurance. |
| **Email is the whole trust root** | A client whose email is compromised gets the full transcript archive. A password (or a short numeric code alongside the link) would be defence in depth. |

---

## 2–3. Appointments and self-scheduling

**Exists:** the home page shows a single **next** appointment, read-only —
date/time in the client's timezone plus duration (`lib/portal/data.ts:29-36`,
rendered `app/portal/page.tsx:95`).

**Missing:**

- **The HubSpot scheduling link — the feature Jeff named as the hook that gets
  them into the portal — is not surfaced anywhere in the portal.** No
  `booking_url` field on `coaches`, no link in the portal UI. (The other HubSpot
  references in the repo are cosmetic booking-*source* detection in
  `lib/booking-sync.ts`.)

  Useful find: **Jeff's actual booking link already lives in the repo** —
  `https://meetings-na2.hubspot.com/dr-jeff`, as the "Book a session →" line in
  the seeded email signature
  (`supabase/migrations/017_email_signatures_communications.sql:52`), and the
  signature builder has an optional `bookingUrl` field for it
  (`lib/signature.ts:57`). So this is a per-coach value that already exists in
  one place and just needs promoting to a real `coaches.booking_url` column that
  both the signature and the portal read.
- **Not at the top.** The brief puts scheduling at the top of the page; today
  the top is the search box and a chat CTA.
- **Only one appointment, no history.** No list of upcoming sessions, no past
  sessions, no reschedule/cancel affordance.
- **`InfoPopover` copy is wrong today** — the Next-session card says "Ask your
  coach to schedule," which contradicts the intended self-serve flow.

**Effort:** small. Add `coaches.booking_url` (migration), surface it via
`resolveClientCoach`, render a prominent "Schedule your next session" button at
the top of the portal, and expand the appointment card to a short list.

---

## 4–5. Notes and transcripts in the workspace

This is the biggest structural gap.

**Notes: entirely absent.** The `notes` table is **never queried by any portal
route** (confirmed: zero references across `app/portal`, `app/api/portal`,
`lib/portal`). The card titled "Messages from your coach" is
`communications` — a log of *emails/nudges sent*, not session notes
(`lib/portal/data.ts:43`). Jeff's brief names notes three separate times: in the
workspace, in the AI context, and in search.

**Decision: the portal shows only notes the coach actually sent** via the
"Send to client" button at the end of a session. Raw coach notes never cross the
boundary. This is the right gate — it needs no new coach workflow, and the thing
the client sees is identical to the email they already received.

**But the record it depends on does not exist yet.** `POST /api/clients/[id]/send-note`
sends the email and returns — it **does not log to `communications` and does not
stamp anything on the note** (verified: no `logCommunication` call in the route;
it persists action links, builds the HTML, calls Gmail, returns). So today there
is **no record anywhere of which notes were sent to a client, or what they said**.
Two consequences:

- The portal has nothing to read from — this must be built before §4 is possible.
- It's a **coach-side gap too**: sent notes don't appear in the workspace "Recent
  Communication" card, unlike every other send path (`/api/email/send`, nudges,
  billing) which all log. Fixing it closes both at once.

**The design.** Store the **sent version**, not the raw note — the AI-drafted
client-facing narrative plus its Insights and Actions sections. The raw note
contains `ACTION:`/`INSIGHT:` markers and coach shorthand that were deliberately
stripped for the client. `communications` already has the right shape, including
a `body_html` column holding the full sent HTML
(`supabase/migrations/017_email_signatures_communications.sql:33`).

1. Make `send-note` call `logCommunication` with `type='session_note'` (the
   column is unconstrained text — no DDL), `body_html` = the sent HTML.
2. Add `notes.sent_to_client_at` (+ optionally `communication_id`) so the coach's
   note editor can show "sent ✓" and the portal can order by session.
3. Portal reads `communications` where `type='session_note'` — a **Session notes**
   card, a viewer page, a search source, and AI context, all from one gate.
4. Backfill is not possible (the data was never recorded), so the portal's notes
   history starts from the day this ships. Worth telling clients in the tour copy.

**Transcripts: listed but not readable.** The sessions card shows title + date
for the 20 most recent (`app/portal/page.tsx:132`) — rows are **not clickable**,
and there is **no transcript detail page**. The client can see that a session
exists but cannot open it. Search results are likewise dead text. Given the
brief's stated primary use case — "they can't remember something and want to
share it out to their team" — being unable to open the session is a hard block.

**To close:**
1. Log sent notes (above) — `send-note` → `communications`, plus
   `notes.sent_to_client_at`.
2. `GET /api/portal/transcripts/[id]` and `/api/portal/notes/[id]` (ownership-
   checked), plus `/portal/sessions/[id]` and `/portal/notes/[id]` viewer pages.
3. Make the session list, notes list, and every search result link to them.
4. Add a proper **Session notes** card to the home grid — distinct from the
   existing "Messages from your coach" card, which should stay as the
   general email/nudge log.

---

## 6. AI chat — "the main feature"

**Built and working:** `lib/portal/chat.ts` + `app/api/portal/chat/route.ts` —
conversations persist, ownership is checked on every read, the system prompt is
well-written (reflective, non-clinical, "never invent facts"), and the
key-info wall is respected.

**Gaps:**

| Gap | Detail |
|---|---|
| **Notes are not in context** | `buildChatContext` reads `coaching_goals` + `transcripts.raw_md` only (`lib/portal/chat.ts:20-36`). The brief says "query their transcripts **and my notes** in dialogue with AI." |
| **Hard 40k-char truncation** | `TRANSCRIPT_CHAR_BUDGET = 40000` fills newest-first and stops (`chat.ts:11,37-47`). A client 10+ sessions in **silently loses their older sessions** — and the older material is exactly what they came to remember. Worse, a single long transcript can consume the whole budget. Fix: retrieval (embed/chunk sessions, or reuse the search index to pull only relevant passages per turn) rather than stuffing the corpus. |
| **Also caps at 30 sessions** | `.limit(30)` — a multi-year engagement is invisible past that. |
| **No streaming** | Non-streaming `messages.create` with a 50s timeout; the UI shows "Thinking…" for the whole wait (`chat.ts:77`, `chat/page.tsx:189`). For a "main feature," streaming matters a lot perceptually. |
| **`max_tokens: 1024`** | Short answers; a "summarize what we covered on delegation" request will get clipped. |
| **No citations** | Replies can't link back to the session they came from — which is the bridge to the "share it with my team" use case. |
| **No rate limit / cost cap** | See security above. |
| **Sidebar is desktop-only** | `hidden w-52 … md:block` (`chat/page.tsx:131`) — no conversation history on a phone, which is likely where clients are. |
| **No rename / delete / search of conversations** | Titles are the first 48 chars of the first message, forever. |

---

## 7–8. Conversation sidebar and uploads — built

Sidebar matches the Claude-style brief (list, click to reopen, "+ New chat",
active highlight). Upload works: paperclip → `POST /api/portal/chat/upload` →
text extracted via `lib/transcripts/extract.ts`, spliced into that turn only,
with a `📎 filename` marker persisted. 4 MB cap; the file itself isn't stored.

Minor gaps: the extracted text is available for **one turn only** (a follow-up
question about the same document sees nothing); no images; no drag-and-drop; no
list of previously attached documents.

---

## 9. Coaching goals — built

`clients.coaching_goals` rendered read-only with title, description, and metrics
(`app/portal/page.tsx:107-129`). Matches the brief exactly.

---

## 10. Frameworks card — built, but the source is narrow

Pop-up with summary + "Open PDF" is exactly as briefed
(`app/portal/FrameworksCard.tsx`), and authorization is properly tight: the PDF
route re-checks the slug against **this client's own nudges** before issuing a
short-lived signed URL (`lib/portal/frameworks.ts:51`).

Gaps:
- **Only frameworks sent as a `type='framework'` nudge appear**
  (`frameworks.ts:20-26`). A framework Jeff *talked about in session* but never
  nudged is invisible. **Decision: nudged OR mentioned in a session both surface
  it.**

  The detection already exists and is being thrown away. The nudge pipeline's
  extraction step already identifies when a session **named** a leaf — that's the
  `framework_basis: named` → `origin: 'mentioned'` path in `lib/nudges/`. But a
  mention only becomes visible if it survives `applyDedupAndCap` (**cap of 2 per
  window**, priority action > framework > insight), so most mentions are
  discarded. Build: persist every detected mention to a new
  `client_frameworks` table (`client_id`, `framework_slug`, `source`
  nudged|mentioned, `transcript_id`, `first_seen_at`) at scoring time,
  independent of whether a nudge is drafted. `loadPortalFrameworks` then reads
  that table UNION the nudge history, still gated on `nudge_eligible` so a
  non-surfaceable leaf can never leak.

  Two notes: the mention detector runs on transcripts, so mentions only appear
  for **scored** sessions; and a coach-side override (assign/remove a framework
  for a client) is worth adding so a false positive can be cleared.
- "Open PDF" opens in a tab; no explicit **download** affordance (brief says
  "open and download").
- No ⓘ popover on this card; the modal has no Esc-to-close or focus trap.

---

## 11. Email the coach — built

`ContactCoachCard` → `POST /api/portal/contact` sends from the coach's Gmail and
logs an **inbound** `communications` row. Gaps: no subject line, no attachment,
no copy to the client, no rate limit, no ⓘ popover, and the client can't see
what they've previously sent.

---

## 12. Quick search — "where the power will lie"

**Exists:** search box on the home page, dedicated `/portal/search` results page
with highlighted terms and a snippet of surrounding context
(`app/api/portal/search/route.ts`, `app/portal/search/page.tsx`) — the shape the
brief asked for.

**Gaps, and they're the important ones:**

| Gap | Detail |
|---|---|
| **Notes are not searched** | Transcripts only (`search/route.ts:21`). The brief explicitly asks for "an option to search transcripts and notes." |
| **No option/filter UI** | No toggle between transcripts and notes, because there's only one source. |
| **Not full-text — and this is the speed risk** | `ilike('raw_md', '%term%')` (`route.ts:24`) is a leading-wildcard match: **no index can serve it**, so Postgres sequentially scans every one of the client's transcripts and reads the full `raw_md` of each into the app. Jeff's stated priority is "speedy access." This works fine at 10 sessions and degrades steadily after. Fix: a `tsvector` GIN index over transcripts + shared notes, `websearch_to_tsquery`, and `ts_headline` for the snippet. |
| **Substring, not word search** | "leadership" won't match "leadership's" ranking-wise, multi-word phrases match only as an exact contiguous string, no stemming, no relevance ordering (results sort by date, not by match quality). |
| **One snippet per session** | `makeSnippet` returns the **first** hit only (`route.ts:37`); a term appearing 8 times shows once. |
| **Results aren't clickable** | See §5 — the client finds the moment and then can't open it. This is the single highest-value fix in the document. |
| **Ranking/pagination** | Hard `limit(20)`, no paging. |

---

## 13–14. Tour guide and ⓘ buttons

**Exists:** `PortalOnboarding` — a one-time welcome modal listing four bullets,
dismissal stored in `localStorage` (`tlw-portal-onboarded`). `InfoPopover` gives
a ⓘ button with one line of copy.

**Gaps:**
- **Not a tour.** The brief describes dialogue boxes walking the client **through
  each card in sequence**. What exists is a single static modal — no
  step-through, no anchoring/highlighting of the card being described, no
  back/next, no progress.
- **ⓘ is on 4 of 7 cards.** Present on Next session, Goals, Sessions, Messages
  (`app/portal/page.tsx:95,107,132,150`). **Missing** on Frameworks, Contact
  coach, the Chat entry point, and Search.
- **Copy is one line**, not "what the card is **and a few ways you could use
  it**."
- **Dismissal is per-browser, not per-client** — the tour re-fires on a new
  device or in incognito, and a client who dismissed it can never replay it
  (no "Take the tour again" link). Consider `clients.portal_onboarded`.

---

## 15. Billing in the portal — entirely missing

**Zero billing code exists in the portal**: no references to billing, invoices,
or Stripe anywhere under `app/portal`, `app/api/portal`, or `lib/portal`.

The brief asks for three things, none of which are present:
1. **Put a card on file** (or ACH) when setting up the workspace.
2. **See the bills they've paid.**
3. **Change their billing.**

**The good news — most of the machinery already exists coach-side** and can be
reused rather than rebuilt:

- Stripe hosted Checkout in `setup` mode, already PCI SAQ-A safe (no card entry
  on a TLW page): `lib/billing/stripe.ts:214`.
- A **public, token-authenticated authorization page** that does almost exactly
  this flow today: `app/billing/authorize/[token]/page.tsx` + `AddCardButton`,
  backed by `lib/billing/payment-methods.ts`.
- Mandate state on `billing_accounts` (`payment_method_status`, brand, last4,
  exp, authorization snapshot), an append-only `billing_authorization_events`
  audit, and remove/reconfirm routes.
- `invoices` with status, amounts, `receipt_token`, `received_at`, and the
  webhook-driven paid transition.

**What actually has to be built:**

| Piece | Notes |
|---|---|
| **Client → billing account resolution** | `coachees` links `client_id` → `billing_account_id`, UNIQUE on `(coach_id, client_id)` (`supabase/migrations/028_billing.sql:19`). **Decision: an enterprise coachee sees no billing at all.** The schema makes this a clean one-line rule — `billing_accounts.type` is already `CHECK (type IN ('solo','enterprise'))` (`028_billing.sql`), so the portal shows the billing card **only when the resolved account is `type='solo'`**; on `'enterprise'` the card does not render and every `/api/portal/billing/*` route returns 404 (not 403 — don't confirm an account exists). Enforce it in **one** helper (`lib/portal/billing.ts#resolvePortalBillingAccount`) that every route calls, so the rule can't be forgotten on a later endpoint. |
| **Portal payment-method routes** | `/api/portal/billing/*` — status, start a Checkout setup session, remove/replace. Should reuse `lib/billing/payment-methods.ts`, not duplicate it. Note the **agreement gate** (`accountPassesAgreementGate`) currently governs coach-initiated authorization sends; decide whether a client-initiated add is subject to it. |
| **Invoice history card** | Paid/outstanding list with amounts and dates, and "view invoice" via the existing hosted-invoice/receipt-token path. |
| **ACH — deferred** *(decided)* | `payment_method_types: ['card']` (`lib/billing/stripe.ts:217`). **Decision: build ACH later.** For the record when it comes up: it needs `'us_bank_account'` added, mandate-text handling, the micro-deposit/instant-verification flow, and a **pending-settlement state** — ACH is not instant, so `handlePaidTransition` would need a `processing` status between sent and paid. A genuine build, not a flag flip. Card-on-file ships first. |
| **Onboarding hook** | The brief wants the option offered "when a client sets up their workspace" — i.e. a step in the first-run flow, which today is a single dismissible modal. |

---

## Suggested build order

Ordered by value-per-effort against the brief's own stated priorities.

**Tier 0 — the prerequisite (do this first)**
0. **Log sent notes.** `send-note` → `logCommunication(type='session_note')` with
   `body_html`, plus `notes.sent_to_client_at`. A small change to one route that
   unblocks items 2, 4, and 5 below — and fixes the coach-side Recent
   Communication gap on the way. Nothing in the notes track can start until this
   is recording.

**Tier 1 — makes the portal deliver on its promise**
1. **Transcript + note viewer pages**, and make session-list and search results
   clickable. (Unblocks the #1 stated use case; small.)
2. **Sent notes in the portal** — Session notes card, viewer, search source, AI
   context. (Closes the largest structural gap; depends on Tier 0.)
3. **HubSpot scheduling link at the top** + expanded appointments card. Promote
   the link to `coaches.booking_url` (it already exists in the signature seed).
   (The stated hook; smallest item on this list.)
4. **Real full-text search** (`tsvector` + GIN over transcripts and sent notes,
   `ts_headline` snippets, transcripts/notes toggle). (The stated "power," and
   today's implementation won't hold speed at scale.)

**Tier 2 — the main feature, properly**
5. **Retrieval-based chat context** (kill the 40k truncation), sent notes in
   context, streaming responses, higher `max_tokens`, citations back to sessions.
6. **Rate limiting** on chat/contact/upload, and a portal access log.
7. Mobile conversation sidebar; rename/delete conversations.

**Tier 3 — the brief's remaining asks**
8. **Username + password** (`client_credentials`, set at first login, magic-link
   as recovery), login throttling, session rotation/revocation, and the
   **coach-side login-status view** next to the existing resend-link button.
9. **Billing in the portal:** solo-only account resolution, card-on-file via the
   existing Checkout setup flow, invoice history. ACH deferred.
10. **Frameworks from session mentions** — persist mentions to `client_frameworks`
    at scoring time; union with nudge history; coach override.
11. **Real step-through tour** + ⓘ on every card with 2–3 usage ideas, dismissal
    moved to `clients.portal_onboarded`, replayable.

---

## Decisions (settled 2026-08-15)

| Question | Decision | Consequences |
|---|---|---|
| **Which notes can the client see?** | **Only notes sent via the "Send to client" button** at the end of a session. Raw coach notes never cross the boundary. Sent notes are stored in the portal. | Needs the send-note logging fix first (§4) — **today nothing is recorded**, so this is a prerequisite, not a nicety. Also fixes the coach-side "Recent Communication" gap. History starts at ship date; no backfill is possible. |
| **Billing on an enterprise engagement?** | **No — the coachee sees no billing.** | One rule, one helper: show billing only when the resolved `billing_accounts.type = 'solo'`; enterprise → card hidden, routes 404. The `solo`/`enterprise` CHECK already exists, so no migration for the gate itself. |
| **Password, or magic-link?** | **Both.** Client can create a username + password; magic-link stays. **The coach can view the client's login state and resend the login link** when credentials are lost. | New `client_credentials` table (never on `clients`). Resend already exists as `portal-invite` — needs surfacing. Coach sees username / password-set / last-login, **never the password** (one-way hash) — reset, not reveal. Add login throttling. |
| **How do frameworks reach the portal?** | **Nudged *or* mentioned in a session.** | Mention detection already runs in the nudge pipeline but is discarded by the 2-per-window cap. Persist mentions to a `client_frameworks` table at scoring time, independent of nudge drafting. Mentions require a **scored** session. Add a coach override to clear false positives. |
| **ACH?** | **Later.** Card-on-file first. | Needs `us_bank_account`, mandate text, verification flow, and a pending-settlement state in `handlePaidTransition`. |

### Net effect on the plan

The notes decision **moves work earlier**: logging sent notes is now a
prerequisite for the notes card, the search source, *and* the AI context — three
Tier-1/2 items that all depend on one small route change. It's the highest
leverage item in the document and should ship first.

The frameworks and billing decisions both got **cheaper** than the original
analysis assumed: framework mentions are already detected (just discarded), and
the enterprise rule is already expressible via an existing CHECK constraint.
The password decision is the one item that got **more expensive**, adding a
credentials table, a login form, throttling, and a coach-side status view.
