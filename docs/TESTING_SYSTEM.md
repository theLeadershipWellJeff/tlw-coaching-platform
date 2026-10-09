# TESTING_SYSTEM.md — Always-On Test Bots for theLeadershipWell

_Brief for Claude Code · Owner: Dr. Jeff Holmes · Drafted 2026-10-09 · Status: Ready for Phase 0_

---

## 0. How to use this file (read first, Code)

Jeff is non-technical but operationally sharp. **Make this as easy for him as possible.**

- **You do the work.** Use CLIs (Vercel, Supabase via `npx supabase`, GitHub `gh`) for everything you can. Only ask Jeff to click when a dashboard or secret truly requires a human.
- **When Jeff must act, give numbered steps**: exact page, exact button, exact value. Use one step per line. Tell him what he should see when it worked.
- **Never ask Jeff to paste secrets into chat.** Tell him where to paste them, usually Vercel env vars or GitHub repository secrets.
- **File-plan first.** Before writing code in any phase, show the list of files you'll create or change and wait for "go".
- **Stop and confirm at every phase gate (marked 🛑).** Don't pull later phases forward.
- **Log deferred ideas** to `APP_STATE.md`, and log decisions in §12 Implementation Notes at the bottom of this file.
- **Keep it simple.** Prefer one tool doing one job over clever architecture. If a step feels complicated, propose the simpler version first.

---

## 1. Objective

A set of bots that test the app around the clock and tell Jeff, in plain language, whether the front doors are open.

**v1 scope (decided):**
- **Coach app login** and **client portal login**, covering every flow that exists in production today
- **Tenant isolation**: a coach or client can never see another's data, and coach-private data never reaches the portal

Everything else (billing, scheduling, transcript ingest, nudges) is v2. See §10 Non-goals.

---

## 2. The big picture (one screen)

```
                 ┌──────────────── GitHub Actions (scheduler + runner) ────────────────┐
                 │                                                                       │
 every 3h  ──►   Functional bots ─┐                                                      │
 every 3h  ──►   Breaker bots ────┼──► results.json ──► Status Engine ──► 🟢🟡🔴         │
 every 3h  ──►   Prod canary bots ┤                         │                            │
 nightly   ──►   Visual bots ─────┤                         ├──► Daily email 6:00am MT    │
 nightly   ──►   AI Explorer ─────┘                         ├──► 🔴 Immediate alert       │
                 │                                          └──► GitHub Issue per finding │
                 │                                                        │               │
                 │                       Claude Fixer picks up issue ◄────┘               │
                 │                       → opens PR → emails Jeff "PR ready to merge"     │
                 └───────────────────────────────────────────────────────────────────────┘
   Bots test:  STAGING (staging.theleadershipwell.online)  +  light read-only checks on PRODUCTION
```

**Tools (deliberately few):**

| Job | Tool | Why |
|---|---|---|
| Run bots on a schedule | GitHub Actions cron | Already where the code lives, free minutes, logs and screenshots kept per run |
| Drive the browser | Playwright | Industry standard; built-in screenshot diffing for the visual bots |
| Send email | Resend (already in stack) | One API call. If domain verification is still pending, Code fixes that first or uses a fallback (§8) |
| Tickets | GitHub Issues | Code can read and fix them directly |
| Auto-fix | Claude Code GitHub Action | Reads the issue, opens a PR, never merges |
| AI explorer | Claude API, nightly, hard-capped | The only always-on AI cost |

---

## 3. The parallel space ("staging")

The last attempt stalled on **setup**. This time Code drives the setup and Jeff does only the steps listed in each phase.

**What staging is:**
- **Vercel:** a `staging` git branch in the *same* Vercel project. It deploys to the stable domain `staging.theleadershipwell.online`. Use a stable domain, not random preview URLs, because changing URLs are what break logins.
- **Supabase:** a **separate** Supabase project (`tlw-staging`). The schema is copied from production. **The data is 100% fake. Never copy production data.**
- **Vercel Preview environment variables** point at staging Supabase, Stripe **test** keys and the email sink.
- **Deployment Protection:** keep it on, and give the bots a bypass token (Vercel "Protection Bypass for Automation").

**Seed data (fake, deterministic, fixed dates so screenshots don't drift):**
- Org A "Northwind Coaching": owner coach, associate coach, supervisor
- Org B "Contoso Leadership": one coach. This org exists so the breakers have someone to try to spy on.
- Clients in Org A, one per flow: individual client, enterprise coachee (single payer), ZF 360 participant, post-engagement (read-only grace period) client
- One client in Org B
- Every seeded record carries `key_info` text containing the marker `PRIVATE-CANARY-<id>`. If that string ever appears in a portal response, that is a 🔴 leak.
- All test emails use `@bots.theleadershipwell.test`, which is not a real domain.

**Outbound safety on staging:**
- Email is captured in a `test_email_sink` table, so nothing reaches a real inbox.
- Calendar, Gmail and Zoom calls are stubbed when `APP_ENV=staging`.
- Stripe runs in test mode only.

**Keep staging awake:** free Supabase projects pause when idle. The every-3h bot runs keep it active. If it still pauses, the email reports "🟡 Staging asleep" rather than red.

---

## 4. Making logins testable (the key design decision)

**Problem:** bots cannot sign in through real Google OAuth, because Google blocks automation and 2FA.

**Solution: a staging-only test login.**
- Add a NextAuth Credentials provider, `e2e-test-login`. It is registered **only** when all of these are true:
  1. `APP_ENV === "staging"`
  2. `E2E_TEST_LOGIN_SECRET` is set
  3. The request carries a matching secret header
  4. The email ends in `@bots.theleadershipwell.test` **and** already exists in `coaches`
- **Build guard:** if `VERCEL_ENV === "production"` and `E2E_TEST_LOGIN_SECRET` exists, **the build fails.** This makes the bypass impossible to ship to production by accident.
- After login, the bot gets the *same* session object a real Google login produces. Everything downstream is real.

**Client portal:** no bypass is needed. Magic links are tested end to end. The bot requests a link, reads it from `test_email_sink` (on staging) or the canary inbox (on production), clicks it, and lands in the portal.

**Real Google path:** the production canary (§5) checks that "Sign in with Google" reaches Google's consent page with the correct client ID and redirect URL. That catches the most common real breakages (redirect mismatch, bad env var, OAuth app misconfigured) without needing to log in.

---

## 5. The bot roster

Each bot gets one line in the email.

### Functional bots (staging, every 3h + on every staging deploy)

| ID | Persona | Journey | Pass means |
|---|---|---|---|
| F1 | Owner coach | Test login → dashboard → client roster loads | Sees exactly the Org A roster |
| F2 | Associate coach | Login → roster | Sees only *assigned* clients |
| F3 | Supervisor | Login → supervisor view (if built) | Correct roll-up, no Org B data |
| F4 | Individual client | Request magic link → click → portal home | Own goals, next appointment, coach contact |
| F5 | Enterprise coachee | Magic link → portal | Own data only, never a co-worker's |
| F6 | ZF 360 participant | Magic link → assessment area | Own report visible, download works |
| F7 | Post-engagement client | Magic link → portal | Read-only, with no write actions available |
| F8 | Any | Logout, session expiry, back button after logout | Session truly ends |

### Breaker bots (staging, every 3h)

| ID | Attack | 🔴 if |
|---|---|---|
| B1 | Cross-tenant probe: Org A coach requests Org B client IDs on every `/api/clients/[id]/**` route, plus list and aggregate endpoints | Any response other than 404, or any Org B data in a list |
| B2 | Client session calls coach routes (`/api/clients/**`, dashboard, billing) | Anything other than 401/403/404 |
| B3 | Magic-link abuse: reused, expired, tampered, another client's token | Any of them grants access |
| B4 | Coach-private wall: crawl every portal page and `/api/portal/**` response for `PRIVATE-CANARY-` | Marker found anywhere |
| B5 | Brute force: 30 rapid magic-link requests for one email | No rate limit (🟡 for v1, 🔴 after hardening) |
| B6 | Test-login bypass reaches production: call the credentials endpoint on production | It exists or responds |

### Production canary bots (production, every 3h, read-only)

| ID | Check | Notes |
|---|---|---|
| P1 | Coach login page loads; "Sign in with Google" reaches Google consent with the correct client ID and redirect URL | No login completed |
| P2 | Client magic-link full loop with **one quarantined test client** | Link goes to a dedicated Gmail inbox the bot reads by IMAP |
| P3 | Key pages respond (home, login, portal login) under 3s | Over 3s is 🟡, down is 🔴 |

**Quarantined production test client (important):** one client record flagged `is_test = true` in a "TLW Bots" test org. Code must make sure **every** cron, roster, metric, billing run, nudge and email-all **excludes** `is_test` records. Audit this before P2 goes live. 🛑

### Visual bots (nightly)

| ID | Screens | Viewports |
|---|---|---|
| V1 | Coach app: login, dashboard, roster, client workspace, practice, business center | Desktop 1440 + mobile 390 |
| V2 | Portal: login, home, goals, assessment, AI chat shell | Desktop + mobile |
| V3 | Production login pages (coach + portal) | Desktop + mobile |

- Dynamic content (dates, counts, avatars) is masked.
- Diff over 1% of pixels on a screen counts as a "changed look". This threshold is tunable.
- **No auto-accept.** A changed look opens a GitHub issue showing before and after. Jeff approves by adding the label `approve-look`, and a workflow then updates the baseline. Jeff can do this from his phone.

### AI Explorer (staging, nightly, capped)

| ID | What | Budget |
|---|---|---|
| X1 | A Claude agent with browser access plays a curious or malicious client and coach for up to N steps, trying to reach data it shouldn't. It reports findings with reproduction steps. | Hard cap per run (see §9) |

---

## 6. Status rules (deterministic, in code, not AI judgment)

| Status | Any of these |
|---|---|
| 🔴 **Red / critical** | A login bot fails **2 runs in a row** · any B1–B4 or B6 failure (once is enough) · P1 or P2 fails 2 runs in a row · a production page is down |
| 🟡 **Yellow / at risk** | A test passed only on retry (flaky) · visual change awaiting approval · page slower than 3s · B5 missing a rate limit · a bot couldn't run (infrastructure) · staging asleep · budget over 80% |
| 🟢 **Green** | Everything passed |

- **Overall status = worst bot status.**
- A bot that is red for 2 days stays red. It never quietly decays to yellow.

---

## 7. Notifications

### Daily email: 6:00am MT, to Jeff

```
Subject: 🟢 TLW Systems GREEN — Fri Oct 9       (or 🟡 YELLOW / 🔴 RED)

OVERALL: 🟢 GREEN  ·  24 bots · 192 checks · last 24h

COACH LOGIN
  🟢 F1 Owner coach ............ passed 8/8
  🟢 F2 Associate coach ........ passed 8/8
PORTAL LOGIN
  🟡 F6 ZF participant ......... passed on retry 2x (flaky)
SECURITY
  🟢 B1 Cross-tenant ........... 0 leaks
PRODUCTION
  🟢 P1 Google handshake ....... OK · avg 1.2s
LOOKS
  🟡 V2 Portal home ............ changed — approve? [link]

OPEN FIXES
  🔧 PR #312 "Fix flaky ZF participant redirect" — ready to merge [link]

─── PASTE INTO CODE ───────────────────────
(one block per 🟡/🔴 problem; see template below)
```

### "Paste into Code" block (one per problem, plain text, copy-ready)

```
FIX REQUEST — [Bot ID] [Bot name] — [🔴/🟡] — GitHub Issue #[n]
Environment: staging | production
What failed: [one sentence]
Steps to reproduce:
  1. ...
Expected: ...
Actual: ...
Evidence: [screenshot link] [trace link] [failing HTTP status/response excerpt]
Likely files: [best guess from stack trace/route]
First seen: [time] · Runs failed: [n] of last [n]
Instruction: Read CLAUDE.md, reproduce on staging, propose a file plan, fix, add/adjust the test, open a PR. Do not merge.
```

### 🔴 Immediate alert, to Jeff **and Caleb**
- Sent within minutes of a red result, with the same format and only that problem.
- **No spam:** one alert per problem. The next alert for that problem is a "✅ Resolved" message when it goes green again.

### Fix notifications
- When the Claude Fixer opens a PR, Jeff gets a short email: "PR #n ready to merge — fixes Issue #m — tests passing on staging: yes/no".

---

## 8. Tickets and the auto-fix loop

1. Every new 🟡/🔴 finding creates **one** GitHub issue (deduplicated by bot ID and failure signature) with labels `bot-found` and `red` or `yellow`. The body is the "Paste into Code" block.
2. A repeat failure **comments** on the existing issue instead of opening a new one.
3. The issue auto-closes when the bot goes green 2 runs in a row.
4. The **Claude Code GitHub Action** triggers on `bot-found` issues:
   - It reproduces the problem on staging, fixes it, updates or adds the test, and opens a PR that links the issue.
   - **It never merges. Jeff merges.**
   - A PR touching auth, session, `client-access`, the portal middleware, or the test-login guard gets the label `security-review` and a 🔐 in the email.
   - **Limit: 3 fix attempts per day.** Red issues go first.
5. Visual-change issues (`look-change`) are **not** sent to the fixer. They wait for Jeff's `approve-look`, or Jeff labels the issue `bot-found` if the change is a bug.

**Code, confirm in Phase 0:** whether the GitHub Action can run on Jeff's Claude Max subscription (OAuth token) or needs an API key, and how that affects the budget.

**Email fallback:** if Resend domain verification is still pending, verify `theleadershipwell.online` first. Code walks Jeff through the DNS records. Until then, send from Resend's test sender to Jeff's address only.

---

## 9. Budget: $50/month hard ceiling

| Item | Target |
|---|---|
| GitHub Actions minutes | $0 if within free minutes. Code checks the repo's plan and minutes in Phase 0 and trims cadence if needed |
| Supabase staging | $0 (free tier) |
| Resend | $0 (free tier) |
| AI Explorer (X1) | ≤ $25/mo, enforced by a per-run token cap |
| Claude Fixer | ≤ $25/mo if on the API, or $0 if it runs on the Max subscription |

**Enforcement:** bots use their own Anthropic API key in a separate workspace with a **$50 monthly spend limit set in the Anthropic Console**. The email shows month-to-date spend, and spend over 80% is 🟡.

_These cost estimates have no research backing. Code verifies current pricing and limits in Phase 0._

---

## 10. Non-goals (v1): do not build

- Testing billing, scheduling, transcript ingest, nudges, prep emails (v2)
- Load or performance testing beyond the 3s page check
- Auto-merging any PR
- Copying any production data into staging
- Bots sending email to anyone except the sink or the canary inbox
- RLS policy work (separate project). Bots will *verify* isolation, not implement it.
- A dashboard UI for results. The email and GitHub are the interface.
- Testing real Google login end to end with a real account

---

## 11. Phased build (🛑 = stop and wait for Jeff's "go")

### Phase 0 — Recon and file plan (Code only, ~no Jeff time)
- Read `CLAUDE.md` and `APP_STATE.md`. Map the actual coach auth flow, portal magic-link flow, ZF participant flow and post-engagement flow.
- Check: Vercel plan, GitHub Actions minutes, Resend verification status, whether a staging Supabase project or branch already exists from the earlier attempt (reuse or delete it), the Claude Action auth option, and the Supabase CLI via `npx` (avoids the Homebrew blocker).
- Output: a short report to Jeff, the file plan, and any surprises.
- 🛑 **Gate:** Jeff says go.

### Phase 1 — Stand up staging
**Code does:** creates the `staging` branch, the schema dump from production (schema only), migrations applied to staging, the seed script, the `APP_ENV` stubs, the email sink table, and all env var lists.
**Jeff does (Code gives click-by-click steps for each):**
1. Create the Supabase project `tlw-staging` (free) and paste its keys into Vercel → Preview env vars.
2. Add the domain `staging.theleadershipwell.online` in Vercel and assign it to the `staging` branch.
3. Turn on Vercel "Protection Bypass for Automation" and paste the token into GitHub → Settings → Secrets.

**Validation:** Jeff opens the staging URL and sees the fake orgs. Production is untouched.
🛑 **Gate.**

### Phase 2 — Login bots (F1–F8) + test-login guard
- Build the `e2e-test-login` provider, the production build guard and the Playwright suite.
- **Validation:** all F bots green on staging. Code deliberately breaks login on a throwaway branch and shows the bot catches it. A production build with the secret present fails.
- 🛑 **Gate.**

### Phase 3 — Breaker bots (B1–B6)
- **Validation:** Code plants a deliberate leak on a throwaway branch and shows B1 and B4 catch it.
- Any *real* leaks found are reported to Jeff immediately and fixed before moving on.
- 🛑 **Gate.**

### Phase 4 — Production canary (P1–P3)
**Code does:** audits every cron and query for `is_test` exclusion **first**, then creates the quarantined test client.
**Jeff does:** creates the Gmail account for the canary inbox (e.g. `tlw.canary@gmail.com`), turns on 2-step verification, creates an app password, and pastes it into GitHub Secrets.
**Validation:** P1–P3 green. The test client doesn't appear in Jeff's roster, metrics, billing or nudges.
🛑 **Gate.**

### Phase 5 — Reporting: email, red alerts, GitHub issues
- Status engine, daily email, immediate red alert to Jeff and Caleb, issue create/comment/close, "Paste into Code" blocks.
- **Jeff does:** gives Caleb's email address (stored as a GitHub secret), and confirms the Resend domain if needed.
- **Validation:** Code triggers a fake red result. Jeff and Caleb each get exactly one alert, then one "✅ Resolved".
- 🛑 **Gate.**

### Phase 6 — Visual bots (V1–V3)
- Capture first baselines. Jeff approves them once via `approve-look`.
- **Validation:** Code changes a button color on a throwaway branch, an issue appears with before and after images, and approval updates the baseline.
- 🛑 **Gate.**

### Phase 7 — Auto-fix loop + AI Explorer
- Install the Claude Code GitHub Action, the fixer rules (§8) and X1 with its spend cap.
- **Validation:** a planted bug produces an issue, then a PR, then Jeff's "PR ready" email. Spend is visible in the daily email.
- 🛑 **Gate:** system live. Run for 2 weeks, then review for flakiness and noise.

**Jeff's total hands-on time:** roughly 60–90 minutes across all phases, mostly Phases 1 and 4. _This is an estimate with no research backing._

---

## 12. Decision record

| Decision | Chosen | Rejected and why |
|---|---|---|
| Parallel space | Persistent `staging` branch + stable domain + separate Supabase | Per-PR preview URLs, because changing URLs break OAuth and setup was the previous failure point |
| Coach login testing | Staging-only credentials provider + build guard; production checks the handshake only | Automating real Google login, which Google blocks and is brittle |
| Bot engine | Deterministic Playwright scripts; AI only for nightly exploration and fixes | All-AI agents running constantly, which costs more, is non-deterministic and can falsely pass |
| Status logic | Coded rules (§6) | AI judgment of severity, which is not auditable |
| Visual baselines | Manual approval until stable | Auto-accept, which hides gradual drift |
| Red alerts | Immediate to Jeff and Caleb, once per problem plus resolved | Daily-only, which is too slow for a broken front door |
| Merging | Human only | Auto-merge, which is unacceptable on auth code |
| Staging data | Fake, seeded | Production copy, which doubles breach surface and creates GDPR exposure |

**Open decisions (Code flags in Phase 0):**
- Claude Action on the Max subscription vs. an API key
- Whether the supervisor view (F3) exists yet; if not, mark the bot "skipped", not red
- Whether a canary every 3h is enough on production, or whether to add a free 5-minute uptime ping later (v2)

---

## 13. Implementation notes (Code appends here as it works)

_Format: `YYYY-MM-DD · Phase · Note (decision / surprise / deferred → APP_STATE)`_

- 2026-10-09 · P0 · **The repo is PUBLIC** on GitHub. Actions minutes are free and unlimited for that reason, but bot issues, "Paste into Code" blocks, failure traces, screenshots and visual baselines would all be public. A security finding ("B1 leaked Org B data via route X") must never be published. Decision needed (§14 D1).
- 2026-10-09 · P0 · No `.github/workflows` exist yet. The Actions setup starts from zero.
- 2026-10-09 · P0 · Staging from the earlier attempt: `docs/STAGING_SETUP.md` + `supabase/staging/000–002`. The baseline covers migrations **001–041 only** (production is at **074**). The seed uses `.example` emails, has no portal, ZF, enterprise or `key_info` canary rows, and the project has been paused since ~056. Plan: replace the baseline and seed, not patch them (§14 D4).
- 2026-10-09 · P0 · **No "post-engagement read-only grace period" exists.** Portal access is either open or blocked: `portal_features.archived` or `portal_access_expires_at` → locked out (`lib/portal/archive.ts`). F7 is redefined as "archived/expired client is refused at every door", not read-only (§14 D2).
- 2026-10-09 · P0 · The supervisor view exists (`/command-center`, `requireSupervisor`), so F3 runs and is not skipped.
- 2026-10-09 · P0 · Isolation is **coach-scoped** (`coach_clients` + `requireClientCoach`), not org-scoped. `organizations` holds one row and RLS is dormant. "Org B" in the seed = a coach with no links to Org A clients. The breakers test exactly that boundary.
- 2026-10-09 · P0 · The portal has a **second front door** the brief didn't list: username + password (`/api/portal/auth/login`, lockout after 8 failures). Added to F4 + B3.
- 2026-10-09 · P0 · The portal verify page needs a **click** to consume the token (scanner fix, 2026-10-07). The bot must click "Sign in", not just load the link. This is good: it proves the real flow.
- 2026-10-09 · P0 · The magic-link request always returns a generic 200 (anti-enumeration). B5 can't see a 429. It counts sink rows instead (expected cap 5/client/hour).
- 2026-10-09 · P0 · Outbound email leaves through **~10 call sites**, not one: `lib/gmail.ts#sendCoachHtmlEmail`, `lib/email/transactional.ts` (Resend), plus direct Gmail sends in `lib/notes/send.ts`, `lib/scorecard-email.ts`, `lib/transcript-review-email.ts`, `app/api/{email/send,send,agreements/issue}/route.ts`. The staging sink must guard every one, enforced by a build-time grep like `check-ai-imports.sh`.
- 2026-10-09 · P0 · Vercel crons run on production deployments only, so staging never fires reminders/nudges/billing. That's good. The bots keep staging awake instead.
- 2026-10-09 · P0 · GitHub cron is UTC with no DST. 6:00am MT = `0 12 * * *` in summer and 5:00am in winter (or 13:00 → 7:00am in summer). Pick one (§14 D6).
- 2026-10-09 · P0 · Could not verify from the container (Jeff to check, §14): the Vercel plan, the Resend domain status, whether the old staging Supabase project still exists and the Supabase plan, and the Anthropic Console workspace. Claude Action auth: `anthropics/claude-code-action` accepts a `claude_code_oauth_token` from `claude setup-token` (Pro/Max). It draws on the Max usage allowance, not a separate bill. Confirm in Phase 7.

## 14. Phase 0 — decisions for Jeff and file plan

### Decisions (recommended option first)

| # | Decision | Recommend | Why |
|---|---|---|---|
| D1 | Public repo vs bot output | **Make the repo private** | Security findings and coach-app internals stop being public. Cost: GitHub Free gives 2,000 Actions min/month on private repos, so cadence has to fit (see budget). Alt: keep it public and send bot issues + artifacts to a new private repo `tlw-bots`. |
| D2 | F7 post-engagement | **Test "archived/expired = refused"** | Matches what exists. A read-only grace period would be a product build (v2). |
| D3 | Claude Fixer auth | **Max OAuth token** | $0 extra. The cap is 3 fixes/day. |
| D4 | Old staging project | **Delete it, create fresh `tlw-staging`** | It's 33 migrations behind with the wrong seed. A rebuild is faster than a repair. |
| D5 | Schema source | **Replay migrations 001–074** (no prod credentials) + a one-time drift check Jeff runs in prod's SQL editor | Keeps every prod credential out of GitHub. Prod had hand-made drift once (062). |
| D6 | Daily email time | `0 13 * * *` UTC = 7am MDT / 6am MST | Or 12 UTC = 6am MDT / 5am MST. |

### Budget reality (if private, estimates, **no research backing** on run durations)
- One combined job every 3h (functional + breakers + canary, ~6 min including the Playwright install) ≈ 8 × 6 × 30 = **~1,440 min**. Nightly visual + explorer ≈ 15 × 30 = **~450**. Total **~1,890 / 2,000**, which is too tight. Plan: **every 4h** (~1,080) + nightly (~450) ≈ **1,530**, leaving headroom for fixer runs. If the repo stays public, every 3h costs $0.

### File plan by phase (nothing written until Jeff says go)

**Phase 1 — staging**
- `supabase/staging/000_full_baseline.sql` — regenerate from 001–074 (script below)
- `scripts/staging/build-baseline.sh` — new; concatenates `supabase/migrations/0*.sql` (excluding `_down`/`_TEMPLATE`)
- `supabase/staging/001_synthetic_seed.sql` — rewrite: Org A (owner, associate, supervisor), Org B coach, 4 Org A clients (individual, enterprise coachee + billing account, ZF participant with a fake 360 row, archived/expired), 1 Org B client, `PRIVATE-CANARY-<id>` in every `key_info`, `@bots.theleadershipwell.test` emails, fixed dates
- `supabase/staging/003_test_email_sink.sql` — new; `test_email_sink` table (staging only, **not** in `migrations/`)
- `lib/env.ts` — new; `isStaging()` (`APP_ENV === 'staging'` AND `VERCEL_ENV !== 'production'`)
- `lib/outbound-guard.ts` — new; `sinkIfStaging(msg)` → writes the sink row and returns a fake success
- Guard calls in: `lib/gmail.ts`, `lib/email/transactional.ts`, `lib/notes/send.ts`, `lib/scorecard-email.ts`, `lib/transcript-review-email.ts`, `app/api/email/send/route.ts`, `app/api/send/route.ts`, `app/api/agreements/issue/route.ts`; calendar stub in `lib/calendar.ts`; Stripe already uses test keys via env
- `scripts/check-outbound-guard.sh` — new; added to `prebuild`; fails if a Gmail/Resend send appears outside the guarded files
- `docs/STAGING_SETUP.md` — rewrite as Jeff's click-by-click (3 tasks)

**Phase 2 — login bots + guard**
- `lib/authOptions.ts` — conditionally add the `e2e-test-login` Credentials provider (4 conditions, §4)
- `scripts/check-test-login-guard.sh` — new; in `prebuild`: fail when `VERCEL_ENV=production` and `E2E_TEST_LOGIN_SECRET` is set
- `bots/` — new top-level folder (own `package.json`, so `@playwright/test` doesn't touch the app build): `playwright.config.ts`, `fixtures/{auth,sink,seed-ids}.ts`, `tests/functional/f1…f8.spec.ts`
- `.github/workflows/bots.yml` — new; every 4h + on a `staging` push

**Phase 3** — `bots/tests/breakers/b1…b6.spec.ts`, `bots/lib/route-inventory.ts` (route list generated from `app/api/**`, so new routes get probed automatically)

**Phase 4** — `supabase/migrations/075_is_test.sql` (+ down), `is_test` exclusion across crons, roster, metrics, billing, nudges, email-all (audit list first), `bots/tests/canary/p1…p3.spec.ts`, IMAP reader

**Phase 5** — `bots/report/{status-engine,email,issues}.ts`, `.github/workflows/bots-report.yml` (daily), state file in an Actions cache or a `bot-state` branch

**Phase 6** — `bots/tests/visual/v1…v3.spec.ts`, baselines, `.github/workflows/approve-look.yml`

**Phase 7** — `.github/workflows/claude-fixer.yml`, `.github/workflows/explorer.yml`, `bots/explorer/`

### Pre-mortem (it's 6 months later and this failed because)
1. **Staging drifted from prod schema** → bots false-red or false-green. *Warning sign:* a bot fails on a missing column. *Mitigation:* every new migration also runs on staging (a CI check that compares `migrations/` with a staging `schema_migrations` probe).
2. **A new email call site skipped the sink** → a real person got a staging email. *Warning sign:* a Gmail send outside the guarded list. *Mitigation:* the prebuild grep fails the build.
3. **Alert fatigue from flakes** → Jeff stops reading. *Warning sign:* more than 2 yellow-flaky days per week. *Mitigation:* retry once, show the flaky rate, 2-week review (Phase 7 gate).
