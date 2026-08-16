-- Migration 051 — per-coach client-facing booking link  (DOWN)

alter table coaches
  drop column if exists booking_url;
