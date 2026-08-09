# Database Migration Procedure

_theLeadershipWell Coaching Platform — standing procedure. Established in Phase 0
(2026-08). This is the single source of truth for how schema changes are made._

Supabase migrations in this repo are **applied by hand in the Supabase SQL
editor** — there is no automated migration runner. That makes discipline the only
safety net, so the rules below are not optional.

---

## 1. The golden rule: staging first, always

**Snapshot → apply to staging → verify → apply to production.** No exceptions,
including for changes that look trivial. A one-line `ALTER TABLE` has taken down
production databases; "it's just a column" is exactly when a missing default or a
lock surprises you.

The full sequence for every schema change:

1. **Author the paired up- and down-scripts** (see §2) — down-script first.
2. **Snapshot the target database** before touching it (see §3).
3. **Apply the up-script to staging** (`tlw-coaching-platform-staging`) via the
   SQL editor.
4. **Verify on staging** — run the app against staging, exercise the feature,
   confirm the down-script cleanly reverses the change.
5. **Apply the up-script to production** via the SQL editor, only after staging is
   green.
6. **Record it applied** in the "Migrations applied" section of `CLAUDE.md`.

Never write application code that depends on a new column/table until Jeff has
confirmed the migration is applied in the environment that code will run against.

---

## 2. Down-script convention (required for every new migration)

Every migration ships as a **pair**, and the down-script is **authored before the
up-script is applied anywhere**:

```
supabase/migrations/NNN_name.sql          -- the up-script (forward change)
supabase/migrations/NNN_name_down.sql     -- the down-script (exact reversal)
```

Rules:

- **Down before up.** Write and review the down-script first. If you cannot write a
  clean reversal, you do not yet understand the change well enough to apply it.
- The down-script reverses **only** what its up-script did — drop the columns/
  tables/indexes/constraints the up-script added, restore what it altered. It must
  be safe to run against a database where the up-script was applied.
- **Additive-by-default.** Prefer nullable columns / new tables (the down-script is
  then a simple `DROP`). Avoid destructive changes to existing columns; if
  unavoidable, the down-script must restore the prior definition.
- New tables in the up-script must include
  `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` (no policies — the service-role key
  bypasses RLS, consistent with the rest of the app until the Phase 1 RLS rollout).
- Every schema change is also delivered as a **ready-to-paste SQL block in chat**
  so Jeff can run it without opening a file (per `CLAUDE.md`).

> Note: migrations `001`–`041` (everything that predates this convention) do **not**
> have paired down-scripts and are **not** being retrofitted — production is already
> at that state and rewriting historical reversals would be risk without benefit.
> The convention applies to **`042` onward**.

A copy/paste starting point lives at
`supabase/migrations/_TEMPLATE_up.sql` and `_TEMPLATE_down.sql`.

---

## 3. Snapshots

Before applying **any** migration in **either** environment, take a snapshot so the
change is reversible even if the down-script is imperfect:

- **Supabase Dashboard → Database → Backups** — confirm a recent daily backup
  exists, or trigger a manual one (Pro plan: point-in-time recovery; free tier:
  the daily backup).
- For a targeted safety net on a specific table, `CREATE TABLE
  <name>_backup_YYYYMMDD AS SELECT * FROM <name>;` in the SQL editor before an
  `ALTER`/`UPDATE`, and drop the backup table once verified.

Record in the migration's chat hand-off which snapshot/backup was relied on.

---

## 4. Numbering

- Migrations are numbered **strictly sequentially with no duplicates**:
  `NNN_short_name.sql`, zero-padded to three digits.
- The next migration is **`042`** (the sequence is `001`–`041` as of Phase 0).
- Never reuse or skip a number. If two migrations are authored in parallel,
  coordinate so they take distinct consecutive numbers before either is applied.

### Phase 0 renumber — old → new mapping

Phase 0 resolved two duplicate numbers (`026` and `034`) by shifting every file
after the first collision up by one, producing a strict `001`–`041`. **Production
was already at this schema state**, so this was a filename/ledger correction only —
no data changed. Files `001`–`025` and `026_coach_growth_areas` were unchanged.

| Old filename | New filename |
|---|---|
| 026_dashboard_layouts.sql | **027_dashboard_layouts.sql** |
| 027_billing.sql | **028_billing.sql** |
| 028_billing_fixes.sql | **029_billing_fixes.sql** |
| 029_billing_sessions_and_account_status.sql | **030_billing_sessions_and_account_status.sql** |
| 030_client_type.sql | **031_client_type.sql** |
| 031_billing_cc_invoice_message.sql | **032_billing_cc_invoice_message.sql** |
| 032_billing_skip_and_warnings.sql | **033_billing_skip_and_warnings.sql** |
| 033_billing_settings.sql | **034_billing_settings.sql** |
| 034_nudge_coach_note.sql | **035_nudge_coach_note.sql** |
| 034_transcript_title.sql | **036_transcript_title.sql** |
| 035_nudge_pdf_attachment.sql | **037_nudge_pdf_attachment.sql** |
| 036_engagement_length.sql | **038_engagement_length.sql** |
| 037_invoice_resend_receipt.sql | **039_invoice_resend_receipt.sql** |
| 038_payment_on_file.sql | **040_payment_on_file.sql** |
| 039_prep_sheet_pipeline.sql | **041_prep_sheet_pipeline.sql** |

Kept unchanged: `026_coach_growth_areas.sql` (the primary `026`; `dashboard_layouts`
was the duplicate and moved to `027`). The `034` pair was ordered by creation date —
`nudge_coach_note` (2026-07-01) → `035`, `transcript_title` (2026-07-02) → `036`.

> **Doc references:** the large "Migrations applied" ledger and feature notes in
> `CLAUDE.md` still cite the **old** numbers (e.g. "migration 038 = payment_on_file")
> because those numbers were how features were described as they shipped. Rewriting
> that entire ledger was deliberately **not** done in Phase 0 — it is high-churn and
> error-prone for zero schema benefit. **This table is the authoritative old→new
> bridge**; treat any old-number reference in `CLAUDE.md`/code comments as historical
> and map it here. The filenames in `supabase/migrations/` are the source of truth for
> the current sequence.
