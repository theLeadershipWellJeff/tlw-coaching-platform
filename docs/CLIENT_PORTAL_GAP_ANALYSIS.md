# Client Portal — gap analysis

**Date:** 2026-08-15 · **Branch:** `claude/client-portal-gap-analysis-apaycj`
**Scope:** Jeff's client-portal vision statement vs. what is actually in the code
today (`app/portal/**`, `app/api/portal/**`, `lib/portal/**`, migrations 044/045).

Portal Phases 1–7 shipped (PRs up to #200). Roughly **60% of the vision is
built**, but three of the load-bearing pieces — **notes**, **billing**, and
**self-scheduling** — do not exist at all, and the two features Jeff called the
"main feature" and "where the power will lie" (AI over notes+transcripts, and
fast search) are each built against **transcripts only**.

---

## Scorecard

| # | Requirement (from the brief) | Status | Where |
|---|---|---|---|
| 1 | "Well password protected very secure area" | ⚠️ Partial | `lib/portal/session.ts`, `middleware.ts` |
| 2 | Check scheduled appointments | ⚠️ Partial | `lib/portal/data.ts:29` |
| 3 | Ability to schedule with me (HubSpot link, at the top) | ❌ Missing | — |
| 4 | Notes available in the workspace | ❌ Missing | — |
| 5 | Transcripts available in the workspace | ⚠️ Partial | `app/portal/page.tsx:132` |
| 6 | AI chat over **transcripts and notes** | ⚠️ Partial | `lib/portal/chat.ts` |
| 7 | Conversation sidebar (Claude-style) | ✅ Built | `app/portal/chat/page.tsx:131` |
| 8 | Upload documents into conversations | ✅ Built | `app/api/portal/chat/upload/route.ts` |
| 9 | Coaching goals card | ✅ Built | `app/portal/page.tsx:107` |
| 10 | Frameworks card → pop-up → open/download PDF | ✅ Built (narrow source) | `app/portal/FrameworksCard.tsx` |
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
| **No password at all** | Jeff asked for "well password protected." Sign-in is magic-link only — there is no password, no password reset, no 2FA. Whether that's a gap or a better answer is a product call, but the brief's literal ask is unimplemented. If clients expect a password, add a set-password step at first login (Argon2/bcrypt hash on a new `client_credentials` table) with magic-link kept as the recovery path. |
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
  them into the portal — does not exist anywhere.** No `bookingLink` /
  `hubspot_url` field on `coaches`, no link in the portal UI. (The only HubSpot
  references in the repo are cosmetic booking-*source* detection in
  `lib/booking-sync.ts`.) The signature builder has an unrelated optional
  `bookingUrl` field (`lib/signature.ts:57`), not wired to the portal.
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

A product decision is needed first: **coach notes are private working documents.**
Exposing `notes.content` wholesale would put the coach's raw in-session writing
in front of the client. The safe design is a **share gate** — a
`notes.shared_with_client` boolean (plus `shared_at`), a "Share with client"
toggle in the coach's note editor, and portal reads filtered to shared notes
only. That also cleanly answers what the AI and search are allowed to read.

**Transcripts: listed but not readable.** The sessions card shows title + date
for the 20 most recent (`app/portal/page.tsx:132`) — rows are **not clickable**,
and there is **no transcript detail page**. The client can see that a session
exists but cannot open it. Search results are likewise dead text. Given the
brief's stated primary use case — "they can't remember something and want to
share it out to their team" — being unable to open the session is a hard block.

**To close:**
1. Migration: `notes.shared_with_client` + coach-side share toggle.
2. `GET /api/portal/transcripts/[id]` and `/api/portal/notes/[id]` (ownership-
   checked), plus `/portal/sessions/[id]` and `/portal/notes/[id]` viewer pages.
3. Make the session list, notes list, and every search result link to them.
4. Add a proper **Notes card** to the home grid.

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
  nudged is invisible. The brief says "frameworks we have talked about" — needs
  either coach-explicit assignment (a client↔leaf mapping) or surfacing from
  transcript mentions.
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
| **Client → billing account resolution** | `coachees` links `client_id` → billing account (`supabase/migrations/028_billing.sql:19,122`). A portal billing card needs a helper resolving the authenticated `clientId` to its account(s) — and a clear rule for **enterprise accounts**, where the payer is the company, not the client. A coachee on a corporate account must **not** see the company's invoices. This is the main security design question in the billing work. |
| **Portal payment-method routes** | `/api/portal/billing/*` — status, start a Checkout setup session, remove/replace. Should reuse `lib/billing/payment-methods.ts`, not duplicate it. Note the **agreement gate** (`accountPassesAgreementGate`) currently governs coach-initiated authorization sends; decide whether a client-initiated add is subject to it. |
| **Invoice history card** | Paid/outstanding list with amounts and dates, and "view invoice" via the existing hosted-invoice/receipt-token path. |
| **ACH is not supported today** | `payment_method_types: ['card']` (`lib/billing/stripe.ts:217`). ACH needs `'us_bank_account'` added, plus mandate-text handling, the micro-deposit/instant-verification flow, and the `payment_intent.processing` → settled states (ACH is not instant, so the "paid" transition needs a pending state). This is a genuine build, not a flag flip. |
| **Onboarding hook** | The brief wants the option offered "when a client sets up their workspace" — i.e. a step in the first-run flow, which today is a single dismissible modal. |

---

## Suggested build order

Ordered by value-per-effort against the brief's own stated priorities.

**Tier 1 — makes the portal deliver on its promise**
1. **Transcript + note viewer pages**, and make session-list and search results
   clickable. (Unblocks the #1 stated use case; small.)
2. **Notes in the portal** behind a `shared_with_client` gate — workspace card,
   search source, and AI context. (Closes the single largest structural gap.)
3. **HubSpot scheduling link at the top** + expanded appointments card. (The
   stated hook; smallest item on this list.)
4. **Real full-text search** (`tsvector` + GIN over transcripts and shared
   notes, `ts_headline` snippets, transcripts/notes toggle). (The stated
   "power," and today's implementation won't hold speed at scale.)

**Tier 2 — the main feature, properly**
5. **Retrieval-based chat context** (kill the 40k truncation), notes in context,
   streaming responses, higher `max_tokens`, citations back to sessions.
6. **Rate limiting** on chat/contact/upload, and a portal access log.
7. Mobile conversation sidebar; rename/delete conversations.

**Tier 3 — the brief's remaining asks**
8. **Billing in the portal:** account resolution (with the enterprise rule
   settled first), card-on-file via the existing Checkout setup flow, invoice
   history. ACH as a separate follow-on.
9. **Real step-through tour** + ⓘ on every card with 2–3 usage ideas, dismissal
   moved to `clients.portal_onboarded`, replayable.
10. **Password option** (set at first login, magic-link as recovery), session
    rotation, and revocation.

**Open product questions for Jeff**
- Should clients see coach notes at all, or only notes explicitly shared? (Drives
  §4, §6, §12.)
- On an enterprise engagement, should the coachee see any billing, or is that the
  company's view only?
- Password *in addition to* magic-link, or is magic-link the answer to "well
  password protected"?
- Should frameworks be coach-assignable, or stay nudge-derived?
