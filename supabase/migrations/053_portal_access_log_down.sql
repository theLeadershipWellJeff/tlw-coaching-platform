-- Migration 053 — Client Portal access log, onboarding flag, chat retrieval  (DOWN)

drop function if exists portal_chat_context(uuid, text, int);

alter table clients drop column if exists portal_onboarded;

drop index if exists portal_access_log_org_id_idx;
drop index if exists portal_access_log_rate_idx;
drop table if exists portal_access_log;
