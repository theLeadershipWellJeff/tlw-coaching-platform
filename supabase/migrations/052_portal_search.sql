-- Migration 052 — Client Portal full-text search  (UP)
--
-- The portal's search was `ilike '%term%'` over `transcripts.raw_md`. A leading
-- wildcard can't use an index, so every search sequentially scanned all of the
-- client's transcripts and pulled each full `raw_md` into the app. It also
-- couldn't reach session notes at all, matched substrings rather than words
-- (no stemming, no ranking), and returned only the FIRST hit per session.
--
-- This replaces it with real Postgres full-text search over both sources the
-- client is allowed to see:
--   * their own session transcripts
--   * the session notes the coach SENT them (communications, migration 050)
-- Coach-private notes are never indexed — the `notes` table is not touched here.
--
-- Both vectors are GENERATED ... STORED, so they stay correct with no write-path
-- change and no backfill: Postgres computes them for existing rows as part of
-- this migration and for every future insert/update.
--
-- Reversible via 052_portal_search_down.sql.

-- Lets a GIN index carry `client_id` alongside the tsvector, so a search scans
-- only THIS client's rows instead of matching every tenant's rows for a common
-- word and filtering afterwards. Verified with EXPLAIN: client_id lands in the
-- Index Cond rather than a post-scan Filter.
create extension if not exists btree_gin;

-- ---------------------------------------------------------------------------
-- Transcripts: title carries extra weight ('A') over the body ('B'), so a hit in
-- a session's title ranks above a passing mention inside another session.
-- ---------------------------------------------------------------------------
alter table transcripts
  add column if not exists search_vector tsvector
    generated always as (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(raw_md, '')), 'B')
    ) stored;

create index if not exists transcripts_search_idx
  on transcripts using gin (client_id, search_vector);

-- ---------------------------------------------------------------------------
-- Communications: `body_html` is an email document, so tags are stripped before
-- indexing or every row would match on "table", "td", "style", etc. The index is
-- partial — only sent session notes are ever searched from the portal.
-- ---------------------------------------------------------------------------
alter table communications
  add column if not exists search_vector tsvector
    generated always as (
      setweight(to_tsvector('english', coalesce(subject, '')), 'A') ||
      setweight(
        to_tsvector('english', regexp_replace(coalesce(body_html, ''), '<[^>]*>', ' ', 'g')),
        'B'
      )
    ) stored;

create index if not exists communications_session_note_search_idx
  on communications using gin (client_id, search_vector)
  where type = 'session_note';

-- ---------------------------------------------------------------------------
-- One ranked query across both sources.
--
-- Highlights are delimited with SENTINEL TEXT, not <mark> tags: the caller
-- splits on them and renders the highlight itself, so transcript content can
-- never inject markup into a client-facing page.
--
-- `websearch_to_tsquery` is used deliberately — it accepts anything a person
-- types (quotes, OR, bare punctuation) without raising, unlike `to_tsquery`.
--
-- Scoped by p_client_id. The caller passes the authenticated portal client id;
-- there is no path here that reads another client's rows.
-- ---------------------------------------------------------------------------
create or replace function portal_search(
  p_client_id uuid,
  p_query     text,
  p_limit     int default 20
)
returns table (
  kind        text,
  id          uuid,
  title       text,
  occurred_on date,
  snippet     text,
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
      'StartSel="[[hl]]", StopSel="[[/hl]]", MaxWords=45, MinWords=20, MaxFragments=2, FragmentDelimiter=" … "'
    )                                                 as snippet,
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
      'StartSel="[[hl]]", StopSel="[[/hl]]", MaxWords=45, MinWords=20, MaxFragments=2, FragmentDelimiter=" … "'
    ),
    ts_rank(c.search_vector, q.tsq)
  from communications c, q
  where c.client_id = p_client_id
    and c.type = 'session_note'
    and c.direction = 'outbound'
    and c.status = 'sent'
    and c.search_vector @@ q.tsq

  order by rank desc, occurred_on desc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;
