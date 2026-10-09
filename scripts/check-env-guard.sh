#!/bin/sh
# Build gate for the testing system (docs/TESTING_SYSTEM.md). Runs as part of
# `prebuild`, so Vercel enforces it on every deploy.
#
# 1. Outbound guard: Gmail and Google Calendar clients may be built ONLY in
#    lib/outbound-guard.ts (gmailClient / calendarClient), and the Resend API
#    may be called ONLY from lib/email/transactional.ts. That is what lets
#    staging capture every email in test_email_sink and stub every calendar
#    call — a new direct call site would send real mail from staging.
# 2. Environment: a PRODUCTION build must never carry APP_ENV=staging, and
#    (Phase 2) never the staging-only test-login secret.
set -eu
cd "$(dirname "$0")/.."
fail=0

hits=$(grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
  -e "google\.gmail(" -e "google\.calendar(" \
  app lib components middleware.ts 2>/dev/null \
  | grep -v '^lib/outbound-guard\.ts:' || true)
if [ -n "$hits" ]; then
  echo "ERROR: Gmail/Calendar client built outside lib/outbound-guard.ts — use gmailClient()/calendarClient():" >&2
  echo "$hits" >&2
  fail=1
fi

hits=$(grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
  -e "api\.resend\.com" \
  app lib components middleware.ts 2>/dev/null \
  | grep -v '^lib/email/transactional\.ts:' || true)
if [ -n "$hits" ]; then
  echo "ERROR: Resend called outside lib/email/transactional.ts:" >&2
  echo "$hits" >&2
  fail=1
fi

if [ "${VERCEL_ENV:-}" = "production" ]; then
  if [ "${APP_ENV:-}" = "staging" ]; then
    echo "ERROR: APP_ENV=staging on a PRODUCTION build — remove it from Vercel's Production environment variables." >&2
    fail=1
  fi
  if [ -n "${E2E_TEST_LOGIN_SECRET:-}" ]; then
    echo "ERROR: E2E_TEST_LOGIN_SECRET is set on a PRODUCTION build — the test login must never ship to production. Remove it from Vercel's Production environment variables." >&2
    fail=1
  fi
fi

[ "$fail" -eq 0 ] || exit 1
echo "check-env-guard: ok (outbound calls guarded; no staging-only settings on production)"
