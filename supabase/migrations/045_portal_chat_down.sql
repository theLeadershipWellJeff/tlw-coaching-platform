-- Migration 045 — Client Portal AI chat  (DOWN)
-- Exact reversal. portal_messages first (FK to conversations).

drop table if exists portal_messages;
drop table if exists portal_conversations;
