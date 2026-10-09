-- ============================================================================
-- theLeadershipWell — STAGING ONLY: environment marker + test email sink
-- ============================================================================
-- Never add this to supabase/migrations/ — production must not have either table.
--
-- tlw_environment: a one-row marker that says "this database is staging". The
--   staging-db workflow refuses to touch any database that has a `coaches`
--   table but no 'staging' row here — the guard against a production URL
--   pasted into the wrong secret.
-- test_email_sink: every email the app would have sent while APP_ENV=staging
--   lands here instead (lib/outbound-guard.ts). The bots read magic links out
--   of it. Nothing reaches a real inbox.
-- Idempotent.
-- ============================================================================

create table if not exists tlw_environment (
  name text primary key check (name = 'staging'),
  created_at timestamptz not null default now()
);
alter table tlw_environment enable row level security;
insert into tlw_environment (name) values ('staging') on conflict do nothing;

create table if not exists test_email_sink (
  id          uuid primary key default gen_random_uuid(),
  transport   text not null,             -- gmail | resend | gmail-direct:<site>
  from_addr   text,
  to_addr     text not null,
  cc_addr     text,
  reply_to    text,
  subject     text,
  html        text,
  text_body   text,
  attachments jsonb,                     -- [{filename, contentType, bytes}] — names/sizes only
  meta        jsonb,                     -- caller-supplied context (client id, kind)
  created_at  timestamptz not null default now()
);
create index if not exists test_email_sink_to_created_idx on test_email_sink (lower(to_addr), created_at desc);
alter table test_email_sink enable row level security;
