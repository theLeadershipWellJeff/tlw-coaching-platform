-- theLeadershipWell — action completion tracking
--
-- The "send to client" note email renders each action item as a click-to-log
-- checkbox (a link, since email can't run live checkboxes). Clicking it hits a
-- public endpoint keyed by an unguessable token, which marks the action done.
--
--   complete_token — unguessable key embedded in the email link (one per action)
--   completed_at   — when the client marked it done (status also flips to 'done')
--   completed_via  — how it was completed (e.g. 'email')

alter table actions
  add column if not exists complete_token uuid default gen_random_uuid(),
  add column if not exists completed_at   timestamptz,
  add column if not exists completed_via  text;

create unique index if not exists actions_complete_token_idx
  on actions (complete_token) where complete_token is not null;
