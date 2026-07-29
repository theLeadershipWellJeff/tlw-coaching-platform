/**
 * Billing domain types — mirrors the 026_billing.sql schema.
 * Hand-written; keep in sync with lib/supabase/types.ts Database entries.
 */

type Timestamp = string // ISO 8601
type DateString = string // YYYY-MM-DD

export type BillingAccountType = 'solo' | 'enterprise'
export type BillingMode = 'arrears' | 'subscription' | 'per_engagement'
export type BillingOwner = 'CA' | 'TLW'
export type EngagementStatus = 'active' | 'paused' | 'ended'
export type InvoiceStatus = 'draft' | 'approved' | 'sent' | 'paid' | 'overdue' | 'failed' | 'void'
export type ReminderStatus = 'scheduled' | 'sent' | 'cancelled'
export type LineSource = 'session' | 'subscription' | 'engagement_installment'

// ── Payment on File (migration 038) ─────────────────────────────────────────────

/** Stored-mandate state on a billing account. */
export type PaymentMethodStatus = 'none' | 'active' | 'dormant' | 'expired' | 'removed'
/** How an invoice collects: hosted invoice (client pays) vs. off-session card charge. */
export type CollectionMethod = 'send_invoice' | 'charge_automatically'
/** Result of a coach-triggered card charge. */
export type ChargeStatus = 'none' | 'succeeded' | 'failed' | 'action_required'
/** Whether a run charges the card automatically on approve (Phase B, unused). */
export type ChargeMode = 'manual' | 'auto'
/** Adjustment instrument — credit note (with refund/credit) or invoice void. */
export type AdjustmentType = 'refund' | 'credit_to_balance' | 'void'
export type AdjustmentStatus = 'pending' | 'succeeded' | 'failed'
export type ChargeAttemptStatus = 'claimed' | 'succeeded' | 'failed'
/** Append-only authorization audit-trail event names. */
export type AuthorizationEvent =
  | 'link_sent'
  | 'page_viewed'
  | 'authorized'
  | 'payment_method_updated'
  | 'marked_dormant'
  | 'reconfirmed'
  | 'removed'
  | 'expired'
  | 'auto_detached'
  | 'charge_disputed'

export type InstallmentScheduleEntry = {
  due_date: DateString
  amount: number
  label: string
}

export type BillingAccount = {
  id: string
  coach_id: string
  name: string
  type: BillingAccountType
  billing_email: string
  stripe_customer_id: string | null
  // Status/CC (migrations 029/031).
  status?: 'active' | 'closed'
  closed_at?: Timestamp | null
  billing_cc?: string | null
  // Payment on File — the stored mandate (migration 038). All nullable/defaulted.
  stripe_payment_method_id?: string | null
  stripe_setup_intent_id?: string | null
  payment_method_type?: string | null
  payment_method_brand?: string | null
  payment_method_last4?: string | null
  payment_method_exp_month?: number | null
  payment_method_exp_year?: number | null
  payment_method_status?: PaymentMethodStatus | null
  authorization_token?: string | null
  authorization_token_sent_at?: Timestamp | null
  authorized_at?: Timestamp | null
  authorized_ip?: string | null
  authorized_by_email?: string | null
  authorization_text?: string | null
  dormant_at?: Timestamp | null
  reconfirmed_at?: Timestamp | null
  last_charge_at?: Timestamp | null
  charge_mode?: ChargeMode | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type Coachee = {
  id: string
  coach_id: string
  client_id: string
  billing_account_id: string
  created_at: Timestamp
}

export type Engagement = {
  id: string
  coach_id: string
  billing_account_id: string
  coachee_id: string
  billing_mode: BillingMode
  billing_owner: BillingOwner
  status: EngagementStatus
  // arrears
  rate_hourly: number | null
  // subscription
  monthly_amount: number | null
  billing_day: number | null
  // per_engagement
  engagement_total: number | null
  installment_count: number | null
  installment_schedule: InstallmentScheduleEntry[] | null
  // Planned number of sessions (migration 029) — drives the sessions-used
  // progress bars (roster cards, workspace name card, Billing block). For a
  // subscription this means sessions PER YEAR; otherwise sessions in the
  // engagement. See lib/billing/engagement-progress.ts.
  session_count: number | null
  // Engagement length in months (migration 036) — the "6-Month" in the
  // engagement label. NULL = label falls back to the billing mode.
  length_months: number | null
  // shared
  description_template: string | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type BillableSession = {
  id: string
  coach_id: string
  engagement_id: string
  coachee_id: string
  note_id: string | null
  occurred_on: DateString
  duration_hours: number
  amount: number
  billed_invoice_id: string | null
  created_at: Timestamp
}

export type Invoice = {
  id: string
  coach_id: string
  billing_account_id: string
  period_start: DateString | null
  period_end: DateString | null
  status: InvoiceStatus
  subtotal: number
  total: number
  currency: string
  stripe_invoice_id: string | null
  stripe_payment_intent_id: string | null
  stripe_error: string | null
  client_message: string | null
  // Receipt tracking + re-send audit (migration 037).
  receipt_token: string | null
  received_at: Timestamp | null
  last_resent_at: Timestamp | null
  // Payment on File — charge state + adjustment denormalization (migration 038).
  collection_method?: CollectionMethod | null
  charge_status?: ChargeStatus | null
  charge_attempted_at?: Timestamp | null
  charge_attempt_count?: number | null
  charge_failure_code?: string | null
  charge_failure_message?: string | null
  charge_retry_at?: Timestamp | null
  fallback_invoice_sent_at?: Timestamp | null
  receipt_sent_at?: Timestamp | null
  receipt_communication_id?: string | null
  refunded_cents?: number | null
  credited_cents?: number | null
  voided_at?: Timestamp | null
  approved_by: string | null
  approved_at: Timestamp | null
  sent_at: Timestamp | null
  paid_at: Timestamp | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type InvoiceLine = {
  id: string
  invoice_id: string
  coachee_id: string | null
  description: string
  quantity: number
  unit_amount: number
  amount: number
  source: LineSource
  created_at: Timestamp
}

export type InvoiceReminder = {
  id: string
  invoice_id: string
  send_at: Timestamp
  status: ReminderStatus
  channel: 'email'
  sent_at: Timestamp | null
  created_at: Timestamp
}

// ---- Payment on File rows (migration 038) ----

export type InvoiceChargeAttempt = {
  id: string
  invoice_id: string
  attempt_number: number
  idempotency_key: string
  status: ChargeAttemptStatus
  stripe_payment_intent_id: string | null
  failure_code: string | null
  failure_message: string | null
  created_at: Timestamp
  resolved_at: Timestamp | null
}

export type InvoiceAdjustment = {
  id: string
  invoice_id: string
  billing_account_id: string
  coach_id: string
  type: AdjustmentType
  amount_cents: number
  reason: string
  idempotency_key: string
  stripe_credit_note_id: string | null
  stripe_refund_id: string | null
  status: AdjustmentStatus
  failure_message: string | null
  created_by_email: string
  notified_at: Timestamp | null
  communication_id: string | null
  created_at: Timestamp
}

export type BillingAuthorizationEvent = {
  id: string
  billing_account_id: string
  coach_id: string
  event: AuthorizationEvent
  ip: string | null
  detail: Record<string, unknown> | null
  created_at: Timestamp
}

// ---- Enriched / joined shapes used by API responses ----

export type EngagementWithCoachee = Engagement & {
  coachee: Coachee & { client: { id: string; name: string; email: string | null } }
}

export type InvoiceWithLines = Invoice & {
  lines: InvoiceLine[]
  account: Pick<BillingAccount, 'id' | 'name' | 'type' | 'billing_email'>
}

export type AccountWithEngagements = BillingAccount & {
  engagements: EngagementWithCoachee[]
  coachees: (Coachee & { client: { id: string; name: string; email: string | null } })[]
}
