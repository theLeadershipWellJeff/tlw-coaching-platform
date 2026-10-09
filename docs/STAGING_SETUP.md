# Staging Setup — Jeff's three tasks

_theLeadershipWell Coaching Platform · testing system Phase 1 (`docs/TESTING_SYSTEM.md`) · rewritten 2026-10-09._

Staging is a parallel copy of the app at **staging.theleadershipwell.online** with a
**separate** Supabase project holding **fake data only**. Production is never touched.

> **The one inviolable rule:** no production data in staging, ever. The seed is
> synthetic. The build script refuses to touch any database that looks like production.

What Claude already did (in the repo): the schema baseline (migrations 001–074), the
fake seed (`supabase/staging/001_synthetic_seed.sql`), the email sink
(`003_test_email_sink.sql`), the `APP_ENV=staging` guards (every email lands in the
sink, every calendar call is a no-op), the build gate, and the **Staging database**
GitHub workflow that applies all of it.

**Your total time: about 25 minutes.** Do the tasks in order.

---

## Task 1 — Create the staging Supabase project (≈10 min)

1. Open https://supabase.com/dashboard → click **New project**.
2. Organization: the same one as production. Name: **`tlw-staging`**.
3. Database password: click **Generate a password**, then **copy it** into your
   password manager. You need it in step 7.
4. Region: the same as production. Plan: **Free**. Click **Create new project**.
   Wait until the page says the project is ready (1–2 min).
5. Left sidebar → **Project Settings** (gear) → **API**. You'll copy two values
   into Vercel in Task 2, so leave this tab open:
   - **Project URL**
   - **Secret key** (`sb_secret_…`; on older screens "service_role") — click reveal
6. Top of the dashboard → click **Connect** → tab **Session pooler** (not Direct, not
   Transaction). Copy the URI. It looks like
   `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:5432/postgres`.
7. In that URI, replace `[YOUR-PASSWORD]` with the password from step 3.
8. Open https://github.com/theLeadershipWellJeff/tlw-coaching-platform/settings/secrets/actions
   → **New repository secret** → Name **`STAGING_DATABASE_URL`** → Secret = the URI
   from step 7 → **Add secret**.
9. Open https://github.com/theLeadershipWellJeff/tlw-coaching-platform/actions →
   left list → **Staging database** → **Run workflow** → mode **`build`** → green
   **Run workflow** button.
10. Click the run that appears. In about a minute it goes green and the last log
    line reads **`staging ok — coaches=4 clients=7 canaries=7`**.
    If it says *REFUSING … looks like PRODUCTION*, the secret holds the wrong URI —
    nothing was changed; fix the secret and re-run.

**You should see:** in Supabase → **Table Editor**, a `clients` table with 7 fake
people (Indy Individual, Ellis Enterprise, Zoe Participant, …).

---

## Task 2 — Point Vercel's Preview environment at staging (≈10 min)

Vercel has three environment scopes. **Production stays exactly as it is.** You
only add values to **Preview**, which is what the `staging` branch deploys as.

1. Open https://vercel.com → the project (**tlw-prep-app**) → **Settings** →
   **Environment Variables**.
2. Click **Add New** (or **Add Another**). For each row below: type the Key, paste
   the Value, and under **Environments** tick **Preview only** (untick Production
   and Development). Then **Save**.

   | Key | Value |
   |---|---|
   | `APP_ENV` | `staging` |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from Task 1 step 5 |
   | `SUPABASE_API_SECRET_KEY` | Secret key from Task 1 step 5 |
   | `NEXTAUTH_URL` | `https://staging.theleadershipwell.online` |
   | `NEXTAUTH_SECRET` | a new random string — run `openssl rand -base64 32` in Terminal, or type 40 random characters |
   | `CRON_SECRET` | another new random string |
   | `INGEST_SECRET` | another new random string |
   | `DEFAULT_COACH_EMAIL` | `owner.coach@bots.theleadershipwell.test` |
   | `DEFAULT_COACH_NAME` | `Olivia Owner` |
   | `JEFF_FROM_EMAIL` | `owner.coach@bots.theleadershipwell.test` |
   | `JEFF_CC_EMAIL` | `owner.coach@bots.theleadershipwell.test` |
   | `SUPPORT_NOTIFY_EMAIL` | `supervisor@bots.theleadershipwell.test` |
   | `PORTAL_FROM_EMAIL` | `portal@bots.theleadershipwell.test` |
   | `STRIPE_SECRET_KEY` | Stripe Dashboard → toggle **Test mode** (top right) → Developers → API keys → **Secret key** (`sk_test_…`) |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_staging_unused` (no test webhook yet — that's v2) |
   | `AI_PORTAL_CHAT_ENABLED` | `false` (the bots don't test chat; keeps AI spend at $0) |

3. **Check for leaks.** Still on the Environment Variables page, look at every
   variable that already existed and shows **Production, Preview** (or **All
   Environments**). For each of these, open it (⋯ → Edit) and **untick Preview**
   so staging never inherits it:
   `SUPABASE_API_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`,
   `NEXT_PUBLIC_SUPABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `VAULT_GITHUB_TOKEN`, `ZOOM_*`,
   `CRON_SECRET`, `INGEST_SECRET`, `NEXTAUTH_SECRET`.
   (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` may stay shared — the Google
   handshake needs them and the bots never complete a real Google login.)
   **If you added a Preview-only row for the same key in step 2, Vercel keeps both;
   the Preview-scoped one wins. Removing Preview from the shared row is still the
   safe thing to do.**
4. **Domain:** Settings → **Domains** → **Add** → type
   `staging.theleadershipwell.online` → **Add**. On the row it creates, click
   **Edit** → set **Git Branch** to **`staging`** → **Save**.
   Vercel shows a DNS record to add. Because the domain's nameservers are already
   Vercel's, it usually says **Valid Configuration** on its own within a minute.
   If it asks for a CNAME, add it in Vercel → **Domains** (top-level) →
   `theleadershipwell.online` → DNS records: `staging` CNAME `cname.vercel-dns.com`.
5. **Deployment Protection:** Settings → **Deployment Protection** → leave
   **Vercel Authentication** on for Preview → scroll to **Protection Bypass for
   Automation** → **Add secret** (let Vercel generate it) → copy it.
6. Add it as a GitHub secret (same page as Task 1 step 8): Name
   **`VERCEL_AUTOMATION_BYPASS_SECRET`**, value = the secret from step 5.

---

## Task 3 — Deploy and check (≈5 min)

Claude pushes the `staging` branch once Tasks 1–2 are done (say "pushed staging" /
"ready"). Vercel builds it as a Preview deployment on the staging domain.

1. Open **https://staging.theleadershipwell.online**. Vercel will ask you to log in
   to Vercel once (that's Deployment Protection — expected).
2. **You should see:** the public home page. Click **Sign in** → you reach Google's
   consent page (don't finish — your Google account isn't a staging coach; it would
   say "not authorized", which is correct).
3. Open **https://staging.theleadershipwell.online/portal/login** → enter
   `indy@bots.theleadershipwell.test` → **Send link**. The page says a link was
   sent. Nothing arrives anywhere real.
4. Supabase (staging) → **Table Editor** → **`test_email_sink`** → **you should see
   one row** with that email as `to_addr` and the sign-in link inside `html`.
   That row is proof the email sink works: the bots will read links from here.
5. Production check: open https://theleadershipwell.online and sign in as yourself.
   Everything is as it was. (Nothing in Tasks 1–2 touched Production scope.)

Tell Claude the result of steps 2–5. 🛑 That is the Phase 1 gate.

---

## Later: keeping staging in step with production

Every new migration Jeff applies to production also goes to staging: GitHub →
Actions → **Staging database** → mode **`migrate`** → file name (e.g.
`075_example.sql`). Rebuilding from scratch is **`build`** on an empty project;
**`reseed`** restores the fake data after the bots have changed it.

Free-tier Supabase pauses after ~7 idle days; the every-few-hours bot runs keep it
awake. If it pauses anyway: Supabase dashboard → the project → **Restore**.
