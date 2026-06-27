/**
 * Billing settings — coach-level preferences for the billing run.
 * Stored in coaches.billing_settings (jsonb, NULL = defaults).
 */

export type BillingSettings = {
  /** Show invoice preview modal before approving. Default: true. */
  preview_before_approve: boolean
  /** When previewing, "Confirm" both approves AND sends in one step. Default: false. */
  auto_send_on_approve: boolean
  /** After Stripe sends an invoice, also email a copy to the coach. Default: true. */
  cc_self_on_send: boolean
}

const DEFAULTS: BillingSettings = {
  preview_before_approve: true,
  auto_send_on_approve: false,
  cc_self_on_send: true,
}

export function normalizeBillingSettings(raw: Partial<BillingSettings> | null | undefined): BillingSettings {
  return { ...DEFAULTS, ...(raw ?? {}) }
}
