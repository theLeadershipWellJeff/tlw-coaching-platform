#!/bin/sh
# Build or refresh the STAGING database. Run by .github/workflows/staging-db.yml
# (or by hand with psql on PATH): DATABASE_URL=<staging session-pooler URI> sh scripts/staging/apply.sh <mode> [migration-file]
#
# Modes
#   build      empty database → marker + sink, full schema baseline, synthetic seed
#   reseed     re-run the sink + seed (idempotent; restores anything a bot changed)
#   migrate    apply ONE file from supabase/migrations/ (keep staging in step with prod)
#
# SAFETY: refuses any database that already has a `coaches` table but no
# tlw_environment 'staging' marker — i.e. anything that looks like production.
set -eu
cd "$(dirname "$0")/../.."
MODE="${1:-}"
: "${DATABASE_URL:?DATABASE_URL is not set}"
PSQL="psql -v ON_ERROR_STOP=1 -q -X"
export PGCONNECT_TIMEOUT=15
# Fail loud if the database can't be reached — never guess about what it is.
psql "$DATABASE_URL" -X -tAc "select 1" >/dev/null || { echo "Cannot connect to the staging database. Check the STAGING_DATABASE_URL secret (use the Session pooler URI)." >&2; exit 5; }
q() { $PSQL "$DATABASE_URL" -tAc "$1"; }
run() { $PSQL "$DATABASE_URL" -f "$1"; }

has_coaches=$(q "select to_regclass('public.coaches') is not null")
has_marker=$(q "select to_regclass('public.tlw_environment') is not null")
is_staging=f
if [ "$has_marker" = "t" ]; then
  is_staging=$(q "select exists(select 1 from tlw_environment where name = 'staging')")
fi
if [ "$has_coaches" = "t" ] && [ "$is_staging" != "t" ]; then
  echo "REFUSING: this database has app tables but no staging marker. It looks like PRODUCTION. Nothing was changed." >&2
  exit 2
fi

case "$MODE" in
  build)
    if [ "$has_coaches" = "t" ]; then
      echo "Already built (staging marker present). Use 'reseed' or 'migrate'." >&2; exit 3
    fi
    run supabase/staging/003_test_email_sink.sql   # marker first, so a half-built DB is still marked staging
    run supabase/staging/000_full_baseline.sql
    run supabase/staging/001_synthetic_seed.sql
    ;;
  reseed)
    [ "$is_staging" = "t" ] || { echo "Not built yet — run 'build' first." >&2; exit 3; }
    run supabase/staging/003_test_email_sink.sql
    run supabase/staging/001_synthetic_seed.sql
    ;;
  migrate)
    [ "$is_staging" = "t" ] || { echo "Not built yet — run 'build' first." >&2; exit 3; }
    FILE="${2:-}"
    case "$FILE" in [0-9][0-9][0-9]_*.sql) ;; *) echo "Give a migration file name like 075_example.sql" >&2; exit 4;; esac
    [ -f "supabase/migrations/$FILE" ] || { echo "No such file: supabase/migrations/$FILE" >&2; exit 4; }
    run "supabase/migrations/$FILE"
    ;;
  *) echo "usage: apply.sh build|reseed|migrate [file]" >&2; exit 1;;
esac

q "select 'staging ok — coaches=' || (select count(*) from coaches) || ' clients=' || (select count(*) from clients) || ' canaries=' || (select count(*) from clients where key_info like 'PRIVATE-CANARY-KEYINFO-%')"
