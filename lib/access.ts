/**
 * Coach access = the paywall rule, in ONE place.
 *
 * `coaches.plan` (migration 057, unconstrained text) is the switch:
 *   beta    — hand-invited, free until the supervisor converts or removes them
 *   paying  — a live Stripe subscription (active / trialing / past_due), or a
 *             hand-set comp
 *   lapsed  — no subscription (cancelled, trial expired unpaid, failed for
 *             good). The legacy value `free` reads the same way.
 *
 * A locked coach signs in fine (Google + the coaches-table allowlist are
 * untouched) and lands on the wall (`/subscription`): subscribe, download
 * their data, or sign out. Nothing else — every API route resolves the coach
 * through `getSessionCoach`, which returns null for a locked coach unless the
 * caller opts in with `allowLocked` (the subscription + export routes do).
 * A supervisor is never locked — the firm can't wall itself out.
 */
import type { Coach } from '@/lib/supabase/types'

export const COACH_PLANS = ['beta', 'paying', 'lapsed'] as const
export type CoachPlan = (typeof COACH_PLANS)[number]

export type CoachAccess = {
  locked: boolean
  plan: CoachPlan
  reason: 'supervisor' | 'beta' | 'paying' | 'lapsed'
}

/** Normalize the stored plan text (legacy `free` → `lapsed`; unknown → lapsed). */
export function normalizePlan(plan: string | null | undefined): CoachPlan {
  if (plan === 'beta' || plan === 'paying') return plan
  return 'lapsed'
}

export function coachAccess(
  coach: Pick<Coach, 'role' | 'plan'> & { plan?: string | null }
): CoachAccess {
  const plan = normalizePlan(coach.plan)
  if (coach.role === 'supervisor') return { locked: false, plan, reason: 'supervisor' }
  if (plan === 'beta') return { locked: false, plan, reason: 'beta' }
  if (plan === 'paying') return { locked: false, plan, reason: 'paying' }
  return { locked: true, plan, reason: 'lapsed' }
}

export function coachIsLocked(coach: Pick<Coach, 'role' | 'plan'> & { plan?: string | null }): boolean {
  return coachAccess(coach).locked
}

/** Pricing copy, shared by the join page, the wall, and the Account card. */
export const COACH_PRICING = {
  monthlyUsd: 95,
  annualUsd: 950,
  trialDays: 14,
} as const
