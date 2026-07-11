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
