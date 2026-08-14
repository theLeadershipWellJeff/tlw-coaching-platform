-- Migration 049 — Coaching hours entries  (DOWN)
-- Drops the imported-hours table. Note-derived sessions are untouched.

drop table if exists coaching_hours_entries;
