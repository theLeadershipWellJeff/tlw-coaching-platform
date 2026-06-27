-- 026: Coach Growth Areas — coach-defined development focuses + per-session assessments
--
-- Two tables, both coach-scoped with RLS. The supervisor read-only path is built
-- into the policy from day one (filter by coach role or a future supervisor_of
-- relation) even though no supervisor UI exists yet. Client-facing exposure is
-- never permitted — these are coach-internal records.
--
-- coach_growth_areas: the coach's personal development focuses (up to 5 active).
--   band_scale: JSON array of 5 band objects, band 1 anchored to the coach's
--     "least proficient" wording, band 5 to "most proficient", 2-4 AI-interpolated.
--     Each band carries a coach_edited flag so AI re-gen never clobbers a hand-edit.
--   definition_version: increments on any edit to title/description/anchors/band_scale
--     so trend charts can mark where a growth area was redefined.
--
-- growth_area_assessments: one row per growth area per scored session.
--   observed: the Observed Gate — false means no opportunity in this session, null
--     band, and the session is excluded from trend math.
--   definition_version_snapshot: the area's version at scoring time; immutable.
--
-- The 5-active cap is enforced in code (POST /api/growth-areas), not in the DB,
-- for flexibility. Apply this migration before the growth-areas APIs are used.

create table if not exists coach_growth_areas (
  id                      uuid primary key default gen_random_uuid(),
  coach_id                uuid not null references coaches(id) on delete cascade,
  title                   text not null,
  description             text not null default '',
  least_proficient_when   text not null default '',
  most_proficient_when    text not null default '',
  -- Array of 5 band objects: {band: 1..5, description: string, coach_edited: bool}
  band_scale              jsonb not null default '[]'::jsonb,
  status                  text not null default 'active' check (status in ('active', 'archived')),
  definition_version      integer not null default 1,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table coach_growth_areas enable row level security;

-- Coach can read + write their own areas.
create policy "coach_growth_areas_coach_rw" on coach_growth_areas
  for all
  using (
    coach_id = (
      select id from coaches where email = current_setting('request.jwt.claims', true)::jsonb->>'email'
    )
  );

-- Index for the common query: list active areas for a coach.
create index if not exists growth_areas_coach_status_idx on coach_growth_areas (coach_id, status);


create table if not exists growth_area_assessments (
  id                          uuid primary key default gen_random_uuid(),
  growth_area_id              uuid not null references coach_growth_areas(id) on delete cascade,
  session_id                  uuid not null references session_reports(id) on delete cascade,
  coach_id                    uuid not null references coaches(id) on delete cascade,
  -- The Observed Gate: false = no opportunity in this session; band is null.
  observed                    boolean not null,
  -- null when observed = false.
  band                        integer check (band between 1 and 5),
  -- Array of {quote_or_paraphrase: string, timestamp: string|null}
  evidence                    jsonb not null default '[]'::jsonb,
  developmental_note          text not null default '',
  -- Snapshot of the area's definition_version at scoring time; never updated.
  definition_version_snapshot integer not null,
  -- One row per area per session; re-scoring replaces this row.
  unique (growth_area_id, session_id),
  created_at                  timestamptz not null default now()
);

alter table growth_area_assessments enable row level security;

create policy "growth_area_assessments_coach_rw" on growth_area_assessments
  for all
  using (
    coach_id = (
      select id from coaches where email = current_setting('request.jwt.claims', true)::jsonb->>'email'
    )
  );

create index if not exists growth_assessments_coach_idx on growth_area_assessments (coach_id);
create index if not exists growth_assessments_session_idx on growth_area_assessments (session_id);
create index if not exists growth_assessments_area_idx on growth_area_assessments (growth_area_id);
