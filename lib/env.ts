/**
 * Which environment is this deployment? (testing system, docs/TESTING_SYSTEM.md)
 *
 * Staging = APP_ENV=staging on a NON-production Vercel deployment. Both halves
 * are required, so a stray APP_ENV on production can never switch production's
 * email or calendar off (and `scripts/check-env-guard.sh` fails that build).
 * On staging, every outbound email lands in `test_email_sink` and every Google
 * Calendar call is a no-op stub — see lib/outbound-guard.ts.
 */
export function isStaging(): boolean {
  return process.env.APP_ENV === 'staging' && process.env.VERCEL_ENV !== 'production'
}
