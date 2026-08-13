-- Migration 044 — client_tokens (Client Portal magic-link auth)  (DOWN)
-- Exact reversal of 044_client_tokens.sql.

drop table if exists client_tokens;
