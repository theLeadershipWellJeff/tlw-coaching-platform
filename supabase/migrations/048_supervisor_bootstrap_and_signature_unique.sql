-- 048: Supervisor bootstrap + one-signature-per-coach index.
--
-- (1) Supervisor bootstrap. /api/coaches (list/add/edit/delete coaches) is now
--     gated by requireSupervisor — but coaches rows default to role='coach', so
--     without at least one supervisor NOBODY can reach coach management (the
--     promote action is itself gated). Promote the founding coach: the row with
--     email jeff@jeffkholmes.com, else the earliest-created coach. No-op if a
--     supervisor already exists. Idempotent.
--
-- (2) Unique signature per coach. The Account → Email signature editor upserts
--     the coach's email_signatures row; without a uniqueness guarantee a save
--     race can duplicate rows. NULLs stay allowed (the historical global row).
--     Duplicate coach rows (if any ever appeared) are collapsed to the newest
--     before the index is created.

-- (1) Bootstrap a supervisor if none exists.
update coaches
set role = 'supervisor'
where id = (
  select id from coaches
  order by (email = 'jeff@jeffkholmes.com') desc, created_at asc
  limit 1
)
and not exists (select 1 from coaches where role = 'supervisor');

-- (2) Collapse any duplicate per-coach signature rows (keep the newest) …
delete from email_signatures es
where es.coach_id is not null
  and exists (
    select 1 from email_signatures newer
    where newer.coach_id = es.coach_id
      and (newer.updated_at > es.updated_at
           or (newer.updated_at = es.updated_at and newer.id > es.id))
  );

-- … then guarantee one row per coach (NULL coach_id rows are not constrained).
create unique index if not exists email_signatures_coach_uidx
  on email_signatures (coach_id);
