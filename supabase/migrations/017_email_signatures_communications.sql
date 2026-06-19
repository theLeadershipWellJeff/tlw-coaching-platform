-- 017: Email signatures + communications log (Phase 1B — branded email send)
--
-- Two tables behind the client-workspace Compose Email flow:
--   * email_signatures — the single source of truth for the branded signature.
--     It is appended at SEND time (never baked into a draft body), so editing it
--     changes every future send. coach_id is nullable: a NULL row is the global
--     default; a coach-specific row (added later) overrides it.
--   * communications — the outbound log that powers the Recent Communication
--     card. Type-discriminated and direction-tagged so reminders ('reminder')
--     and future inbound reply-capture ('inbound') slot in with no refactor.
--
-- Like every table in this app, RLS is ON with no public policies — reached only
-- via the service-role key (getSupabaseAdmin). Never queried from the browser.

create table if not exists email_signatures (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid references coaches(id) on delete cascade,  -- null = global default
  html        text not null,
  logo_url    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table email_signatures enable row level security;

create table if not exists communications (
  id                uuid primary key default gen_random_uuid(),
  coach_id          uuid references coaches(id) on delete set null,
  client_id         uuid not null references clients(id) on delete cascade,
  type              text not null default 'email',     -- 'email' | 'reminder' | 'prep_sheet'
  direction         text not null default 'outbound',  -- 'outbound' | 'inbound' (future)
  subject           text,
  preview           text,                              -- first ~140 chars of body, for the card
  body_html         text,
  status            text not null default 'sent',      -- 'sent' | 'failed' | 'scheduled'
  gmail_message_id  text,                              -- returned by Gmail send; future threading hook
  error_detail      text,                              -- populated when status = 'failed'
  sent_at           timestamptz not null default now()
);
alter table communications enable row level security;

create index if not exists communications_client_idx
  on communications (client_id, sent_at desc);

-- Seed Jeff's signature as the global default (coach_id = null). Email-safe
-- table layout with inline styles and a RASTER logo — the only thing mail
-- clients reliably render (SVG is stripped by Gmail/Outlook/Apple Mail). DM Sans
-- is declared but falls back to Arial/Helvetica in most clients; that's expected.
-- Keep this HTML in sync with DEFAULT_SIGNATURE_HTML in lib/signature.ts.
insert into email_signatures (coach_id, html, logo_url)
values (
  null,
  '<table cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #e5e0d8;padding-top:16px;font-family:''DM Sans'',Helvetica,Arial,sans-serif;"><tr><td style="padding-bottom:10px;"><img src="https://theleadershipwell.online/logo-email.png" width="200" alt="theLeadershipWell" style="display:block;border:0;height:auto;" /></td></tr><tr><td><div style="font-weight:700;font-size:14px;color:#111226;">Jeff Holmes</div><div style="font-size:12px;color:#8B8680;margin-top:1px;">Executive Coach &middot; theLeadershipWell</div><div style="font-size:12px;color:#8B8680;margin-top:4px;"><a href="mailto:jeff@jeffkholmes.com" style="color:#0C1940;text-decoration:none;">jeff@jeffkholmes.com</a>&nbsp;&middot;&nbsp;<a href="https://www.theleadershipwell.com" style="color:#0C1940;text-decoration:none;">theleadershipwell.com</a></div><div style="font-size:12px;margin-top:4px;"><a href="https://meetings-na2.hubspot.com/dr-jeff" style="color:#0C1940;text-decoration:none;font-weight:600;">Book a session &rarr;</a></div></td></tr></table>',
  'https://theleadershipwell.online/logo-email.png'
);
