-- theLeadershipWell — client key info + coaching map
--
-- Two more persistent, per-client fields surfaced on the session-notes panel
-- (alongside the live ACTION/INSIGHT capture and the engagement goals):
--
--   key_info      — freeform reference the coach wants in front of them every
--                   session (boss's name, spouse, kids, context to remember).
--   coaching_map  — the map assigned to this client from theLeadershipWell's
--                   core practice (e.g. "6 Components"). Stored as text so any
--                   map can be named; nullable so existing clients are unchanged.

alter table clients
  add column if not exists key_info text,
  add column if not exists coaching_map text;
