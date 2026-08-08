# Staging Environment Setup

_theLeadershipWell Coaching Platform — Phase 0.1. A staging environment where
destructive changes can be rehearsed without touching the live coaching practice._

**Executor:** Jeff (Supabase / Vercel / Google Cloud consoles — Claude cannot
create cloud projects or set env vars). Claude produced the two SQL artifacts this
runbook references.

> **The one inviolable rule:** **no production data in staging, ever.** Copying real
> transcripts/notes doubles the breach surface and creates a second dataset subject
> to GDPR erasure. Staging uses the **synthetic seed only**.

---

## Artifacts (already in the repo)

- `supabase/staging/000_full_baseline.sql` — migrations `001`–`041` concatenated in
  order; reproduces production **structure** with **no data**.
- `supabase/staging/001_synthetic_seed.sql` — fictional multi-tenant seed (2 orgs,
  3 coaches, 6 clients, 2 transcripts + 2 notes per client, one agreement /
  appointment / billing account per org).

---

## Step 1 — Create the staging Supabase project

1. Supabase Dashboard → **New project** in the **same organization and region** as
   production. Name it **`tlw-coaching-platform-staging`**.
2. Generate a strong database password and **store it in Jeff's password manager**
   (not in this repo, not in chat).
3. Once provisioned, from **Project Settings → API** capture and store securely:
   - **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`)
   - **anon / publishable key** (`SUPABASE_API_PUBLISHABLE_KEY`)
   - **service-role / secret key** (`SUPABASE_API_SECRET_KEY`) — **secret**
   - **JWT secret** (Project Settings → API → JWT Settings) — needed for the
     Phase 1 JWT-minting work; capture it now.

## Step 2 — Build the schema

1. Supabase → **SQL Editor** on the staging project.
2. Paste all of `supabase/staging/000_full_baseline.sql` → **Run**. This replays
   `001`–`041` in order. (It creates the `frameworks` table in `023` and drops it
   in `024` — that is the correct ordered replay, not an error.)
3. Paste all of `supabase/staging/001_synthetic_seed.sql` → **Run**.
4. Verify the seed (run in the SQL editor):
   ```sql
   select (select count(*) from coaches)          as coaches,        -- 3
          (select count(*) from clients)          as clients,        -- 6
          (select count(*) from transcripts)      as transcripts,    -- 12
          (select count(*) from notes)            as notes,          -- 12
          (select count(*) from billing_accounts) as billing_accts;  -- 2
   ```

## Step 3 — Point a Vercel Preview at staging (Production untouched)

1. Create a **`staging`** git branch (`git checkout -b staging` from the Phase 0
   branch or `main`, then push).
2. In Vercel → Project → **Settings → Environment Variables**, add the staging
   Supabase values **scoped to Preview only** (uncheck Production):
   - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_API_PUBLISHABLE_KEY`,
     `SUPABASE_API_SECRET_KEY` → the **staging** values.
   - Add a Preview-scoped `NEXTAUTH_URL` = the staging preview URL (see Step 4).
   - Leave all **Production** variables **exactly as they are**.
3. **Env-diff validation (required):** before and after, export both scopes
   (Vercel CLI: `vercel env pull .env.production --environment=production` and
   `--environment=preview`) and diff them. Record in `ISOLATION_AUDIT.md` (or a
   commit note) that **Production values are byte-for-byte unchanged** and only
   Preview gained the staging Supabase pointers. Delete the pulled `.env.*` files
   afterward — they contain secrets and are gitignored, but don't leave them lying
   around.

## Step 4 — Google OAuth redirect for the staging URL

Sign-in will fail on staging until its URL is a registered redirect:

1. Google Cloud Console → **APIs & Services → Credentials** → the OAuth 2.0 client.
2. Add to **Authorized redirect URIs**:
   `https://<your-staging-preview>.vercel.app/api/auth/callback/google`
   (and the matching `Authorized JavaScript origins` entry).
3. Set the Preview-scoped `NEXTAUTH_URL` to `https://<your-staging-preview>.vercel.app`.

> A stable preview alias (Vercel → Settings → Domains, assign a fixed alias to the
> `staging` branch) avoids re-registering a new redirect URI on every deploy.

## Step 5 — Cron / integration secrets on staging (optional but recommended)

If you want the crons/webhooks exercised on staging, set Preview-scoped
`CRON_SECRET`, `INGEST_SECRET`, and (test-mode) `STRIPE_*` values **distinct from
production**. Otherwise leave them unset — the cron routes refuse to run without
`CRON_SECRET`, which is a safe default for a data-free environment.

---

## Free-tier pause & wake-up

Free-tier Supabase projects **pause after ~7 days of inactivity**. If the staging
app returns connection errors after a quiet period:

1. Supabase Dashboard → the staging project → it will show **Paused**.
2. Click **Restore / Resume project**; it wakes in a minute or two.
3. Data persists across a pause (it is not deleted) — just re-run nothing; the seed
   is still there.

Confirm current free-tier terms at the time of setup (Supabase changes these), and
note any deviation here.

---

## Validation checklist (Phase 0.1 exit criteria)

- [ ] Staging app loads, Google sign-in succeeds, roster renders the seeded clients.
- [ ] Production env vars provably unchanged (env-diff recorded — Step 3).
- [ ] Staging DB contains **zero** rows traceable to a real client (synthetic only).
- [ ] A trivial schema change (e.g. `alter table clients add column staging_probe text;`)
      can be applied to staging and rolled back (`alter table clients drop column
      staging_probe;`) with no production impact.
