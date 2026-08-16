-- Migration 053 — Client Portal access log, onboarding flag, chat retrieval  (UP)
--
-- Three additive pieces, all serving the portal:
--
-- 1. `portal_access_log` — one row per notable portal action. Serves two jobs at
--    once: an audit trail for the surface that holds a client's full session
--    history, and the counter behind per-client rate limiting. Rate limiting has
--    to be durable rather than in-process because the app runs serverless, where
--    an in-memory counter resets on every cold start and isn't shared between
--    concurrent instances.
--
-- 2. `clients.portal_onboarded` — moves the first-visit tour flag off
--    localStorage (per-browser, so it re-fires on every new device and can never
--    be replayed deliberately) and onto the client record.
--
-- 3. `portal_chat_context` — the retrieval function behind the AI chat. The chat
--    previously stuffed the newest ~40k characters of transcripts into every
--    request and stopped, so a client more than a handful of sessions in
--    silently lost their oldest material — exactly what they come to the chat to
--    remember. This returns the passages relevant to the question asked,
--    drawn from the client's whole history, using the search vectors added in
--    migration 052.
--
-- Reversible via 053_portal_access_log_down.sql.

create table if not exists portal_access_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default '00000000-0000-4000-8000-000000000001'
                references organizations(id),
  client_id   uuid not null references clients(id) on delete cascade,
  -- 'login_request' | 'login_verify' | 'login_password' | 'password_set'
  -- | 'chat' | 'contact' | 'upload' | 'note_view' | 'session_view' | 'pdf_view'
  action      text not null,
  -- Optional detail (a row id, a failure reason). Never the content itself.
  detail      text,
  ok          boolean not null default true,
  created_at  timestamptz not null default now()
);

-- The rate-limit query: "how many <action> rows for this client since <time>".
create index if not exists portal_access_log_rate_idx
  on portal_access_log (client_id, action, created_at desc);
create index if not exists portal_access_log_org_id_idx
  on portal_access_log (org_id);

alter table portal_access_log enable row level security;

-- First-visit tour, per client rather than per browser. NULL/false = not yet
-- taken; the portal also offers a "take the tour again" affordance.
alter table clients
  add column if not exists portal_onboarded boolean not null default false;

-- ---------------------------------------------------------------------------
-- Retrieval for the AI chat.
--
-- Same two sources and the same hard client scoping as `portal_search`, but
-- tuned for feeding a model rather than rendering a result list: bigger
-- fragments, more of them, and no highlight sentinels. Ordered by relevance so
-- the caller can take the top N under a character budget.
-- ---------------------------------------------------------------------------
create or replace function portal_chat_context(
  p_client_id uuid,
  p_query     text,
  p_limit     int default 8
)
returns table (
  kind        text,
  id          uuid,
  title       text,
  occurred_on date,
  excerpt     text,
  rank        real
)
language sql
stable
as $$
  with q as (
    select websearch_to_tsquery('english', p_query) as tsq
  )
  select
    'session'::text                                   as kind,
    t.id                                              as id,
    coalesce(nullif(btrim(t.title), ''), 'Session')   as title,
    t.session_date                                    as occurred_on,
    ts_headline(
      'english',
      coalesce(t.raw_md, ''),
      q.tsq,
      'StartSel="", StopSel="", MaxWords=160, MinWords=80, MaxFragments=4, FragmentDelimiter=" … "'
    )                                                 as excerpt,
    ts_rank(t.search_vector, q.tsq)                   as rank
  from transcripts t, q
  where t.client_id = p_client_id
    and t.search_vector @@ q.tsq

  union all

  select
    'note'::text,
    c.id,
    coalesce(nullif(btrim(c.subject), ''), 'Session notes'),
    c.sent_at::date,
    ts_headline(
      'english',
      regexp_replace(coalesce(c.body_html, ''), '<[^>]*>', ' ', 'g'),
      q.tsq,
      'StartSel="", StopSel="", MaxWords=160, MinWords=80, MaxFragments=4, FragmentDelimiter=" … "'
    ),
    ts_rank(c.search_vector, q.tsq)
  from communications c, q
  where c.client_id = p_client_id
    and c.type = 'session_note'
    and c.direction = 'outbound'
    and c.status = 'sent'
    and c.search_vector @@ q.tsq

  order by rank desc, occurred_on desc nulls last
  limit greatest(1, least(coalesce(p_limit, 8), 20));
$$;
