/**
 * Database types for the Supabase schema (see supabase/migrations/001_init.sql).
 *
 * Hand-written for now. Once the Supabase CLI is set up you can regenerate
 * this exactly with:
 *   npx supabase gen types typescript --project-id <ref> > lib/supabase/types.ts
 *
 * NOTE: these are `type` aliases, not `interface`s, on purpose. An interface
 * has no implicit index signature, so it does NOT satisfy the
 * `Record<string, unknown>` constraint the Supabase client requires — which
 * would silently collapse every table to `never`.
 */

import type { SessionReportJson } from '@/lib/scoring/types'
import type { PrepContent } from '@/lib/email-template'
import type { CardPlacement } from '@/lib/dashboard/types'
import type {
  BillingAccount,
  Coachee,
  Engagement,
  BillableSession,
  Invoice,
  InvoiceLine,
  InvoiceReminder,
} from '@/lib/billing/types'

type Timestamp = string // ISO 8601
type DateString = string // YYYY-MM-DD

export type CoachingGoal = {
  title: string
  description: string
  // Up to three measures of fulfillment for the goal (filled in with the
  // client). Optional so existing two-field goals keep working unchanged.
  metrics?: string[]
  // Provenance. 'manual' = written or edited and saved by the coach — these are
  // protected: "generate from notes" must never overwrite them. 'generated' = an
  // AI draft the coach hasn't endorsed yet, which a later generate may replace.
  // Absent on goals that predate this field — treated as protected, since we
  // can't prove they weren't hand-written.
  source?: 'manual' | 'generated'
}

export type Client = {
  id: string
  name: string
  email: string | null
  title: string | null
  company: string | null
  status: string
  phone: string | null
  timezone: string | null
  // Friendly display city for `timezone` (migration 021) — the major city the
  // coach picked (e.g. "Austin"), shown back instead of the zone's canonical city.
  // Cosmetic only; all time math uses `timezone`. null = fall back to the zone.
  timezone_label: string | null
  ca_client_id: string | null
  tags: string[]
  bio: string | null
  address: string | null
  coaching_goals: CoachingGoal[] | null
  key_info: string | null
  coaching_map: string | null
  // Flat per-session fee, in dollars. Drives the Practice revenue cards.
  session_fee: number | null
  // Distinguishes regular coaching clients from team coaches kept here for
  // note/transcript history (migration 030). Default 'client'.
  client_type: 'client' | 'coach'
  // Agreement state (migration 018) — the source of truth the workspace and the
  // scoring engine's Gate 1 read. recording_authorized: true = consented,
  // false = explicit decline (compliance flag), null = unknown / no decision.
  agreement_on_file: boolean
  recording_authorized: boolean | null
  agreement_id: string | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type Note = {
  id: string
  client_id: string
  session_date: DateString
  title: string | null
  content: string
  // Logged session length in minutes (drives past-week revenue). Default 60.
  duration_minutes: number
  calendar_event_id: string | null
  ca_session_id: string | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type Action = {
  id: string
  client_id: string
  note_id: string | null
  description: string
  due_date: DateString | null
  status: string
  complete_token: string | null
  completed_at: Timestamp | null
  completed_via: string | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type NoteTemplate = {
  id: string
  coach_id: string | null
  folder_id: string | null
  name: string
  content: string // rich-text HTML
  created_at: Timestamp
  updated_at: Timestamp
}

export type LibraryFolder = {
  id: string
  coach_id: string | null
  section: string // 'templates' | 'pdf'
  kind: string // note | agreement | worksheet | generic
  name: string
  created_at: Timestamp
  updated_at: Timestamp
}

export type Agreement = {
  id: string
  coach_id: string | null
  client_id: string
  template_id: string | null // legacy: note_templates origin (pre-018)
  agreement_template_id: string | null // structured master template (018)
  title: string
  body_html: string
  status: string // sent | active  ('none' is the absence of a row)
  sign_token: string
  // Per-issue merge values captured when the agreement is sent (018).
  client_name: string | null
  client_email: string | null
  coach_name: string | null
  zoom_link: string | null
  phone: string | null
  payment_terms: string | null
  // Signing capture (018).
  recording_authorized: boolean | null // null until signed
  signer_typed_name: string | null
  signer_ip: string | null
  signing_token_expires_at: Timestamp | null
  signed_agreement_html: string | null // immutable snapshot at signing
  sent_at: Timestamp
  signed_at: Timestamp | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type AgreementTemplate = {
  id: string
  coach_id: string
  name: string
  description_of_coaching: string
  agreement_logistics: string
  method_of_contact: string
  late_policy: string
  cancellation_policy: string
  payment_terms: string | null
  locked_coach_client_relationship: string
  locked_confidentiality: string
  locked_ai_recording: string
  locked_release_of_information: string
  locked_termination: string
  locked_limited_liability: string
  locked_standard_legal: string
  created_at: Timestamp
  updated_at: Timestamp
}

export type AgendaRequest = {
  id: string
  coach_id: string | null
  client_id: string
  token: string
  items: { q: string; a: string }[] | null
  status: string // pending | submitted
  created_at: Timestamp
  submitted_at: Timestamp | null
}

export type PdfResource = {
  id: string
  coach_id: string | null
  folder_id: string | null
  name: string
  storage_path: string
  size_bytes: number | null
  created_at: Timestamp
}

export type Coach = {
  id: string
  email: string
  name: string
  role: string // coach | supervisor
  google_refresh_token: string | null
  timezone: string
  supervisor_email: string | null
  // Per-competency improvement focus, keyed by competency id ("1".."8").
  competency_focus: Record<string, string> | null
  // Per-coach custom labels for the fixed Library nodes (migration 019), keyed by
  // node id: templates | pdf | agreement | unfiled. Absent key = built-in default.
  library_labels: Record<string, string> | null
  // Scheduling settings (migration 020). null = use the built-in defaults.
  // availability: bookable hours per weekday ("0".."6" = Sun..Sat); the scheduler
  // warns (never blocks) outside these. reminder_settings: which reminders fire.
  // Canonical shapes + defaults live in lib/scheduling.ts.
  availability: Record<string, { enabled: boolean; start: string; end: string }> | null
  reminder_settings: {
    confirmation: boolean
    reminders: { hoursBefore: number; enabled: boolean }[]
  } | null
  // Nudging settings (migration 022). null = use the built-in defaults. Canonical
  // shape + defaults live in lib/nudges/settings.ts.
  nudge_settings: NudgeSettings | null
  // Billing run preferences (migration 033). null = use the built-in defaults.
  // Canonical shape + defaults live in lib/billing/settings.ts.
  billing_settings: Record<string, unknown> | null
  // External booking capture (migration 025): the Google Calendar incremental-sync
  // cursor. null until the first sync; cleared + re-seeded on a 410 (stale token).
  calendar_sync_token: string | null
  calendar_synced_at: Timestamp | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type CoachClient = {
  coach_id: string
  client_id: string
  role: string // 'primary' | 'shared'
  created_at: Timestamp
}

export type Appointment = {
  id: string
  coach_id: string | null
  // Nullable: an external booking we captured from the calendar but couldn't tie
  // to a roster client sits here as client_id=null (the unmatched review queue).
  client_id: string | null
  scheduled_at: Timestamp
  duration_minutes: number
  google_event_id: string | null
  status: string // scheduled | cancelled | completed | ignored
  // External booking capture (migration 025). source is best-effort/cosmetic.
  source: string // native | calendly | hubspot | external
  attendee_email: string | null
  title: string | null
  raw_event: Record<string, unknown> | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type NudgeSettings = {
  // Don't send a nudge if the client got any nudge/communication within this many
  // days (the spacing rule).
  nudge_spacing_days: number
  // Re-engagement (Phase A.5): first touch after N days with no booked session,
  // and the max number of re-engagement touches before stopping.
  reengagement_first_after_days: number
  reengagement_max_touches: number
  // Vault connection (migrations 023/024): the single folder in the vault repo the
  // garden indexer reads. Leaves are detected structurally (frontmatter
  // nudge_eligible / themes), so there is no tag to configure.
  vault_folder_path: string
}

export type Nudge = {
  id: string
  coach_id: string
  client_id: string
  source_session_id: string | null
  type: string // action_checkin | insight | framework | reengagement
  origin: string // mentioned | suggested | auto | manual
  trigger_excerpt: string | null
  rationale: string | null
  framework_slug: string | null
  linked_resource_slug: string | null
  draft_subject: string | null
  draft_body: string | null
  coach_note: string | null
  status: string // draft | approved | scheduled | sent | skipped | snoozed
  scheduled_for: Timestamp | null
  sent_at: Timestamp | null
  communication_id: string | null
  created_at: Timestamp
  updated_at: Timestamp
}

// A leaf in the coach's mind garden (derived index over the vault repo). `id` is
// the frontmatter slug — the edge endpoint, unique per coach (composite PK with
// coach_id). Note bodies are never stored; this is pointers + the graph only.
export type GardenNote = {
  coach_id: string
  id: string
  title: string
  type: string | null
  themes: string[]
  summary: string | null
  nudge_eligible: boolean
  aliases: string[]
  vault_path: string
  blob_sha: string | null
  last_synced_at: Timestamp
  created_at: Timestamp
  updated_at: Timestamp
}

// A 1-hop edge between two garden_notes (by their `id`). `relation` records where
// the link came from: 'parent' | 'framework' | 'link' (inline body wikilink).
export type GardenEdge = {
  id: string
  coach_id: string
  source_id: string
  target_id: string
  relation: string
  created_at: Timestamp
}

export type AppointmentReminder = {
  id: string
  appointment_id: string
  kind: string // confirmation | nudge_24h
  sent_at: Timestamp
}

export type EmailSignature = {
  id: string
  // null = the global default signature; a coach-specific row overrides it.
  coach_id: string | null
  html: string
  logo_url: string | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type Communication = {
  id: string
  coach_id: string | null
  client_id: string
  type: string // 'email' | 'reminder' | 'prep_sheet'
  direction: string // 'outbound' | 'inbound'
  subject: string | null
  preview: string | null
  body_html: string | null
  status: string // 'sent' | 'failed' | 'scheduled'
  gmail_message_id: string | null
  error_detail: string | null
  sent_at: Timestamp
}

// Per-coach customizable dashboard layout (migration 026). One row per coach per
// surface; `blocks` is the placed-card list (lib/dashboard validates it on r/w).
export type DashboardLayout = {
  id: string
  coach_id: string
  surface: string // 'dashboard'
  blocks: CardPlacement[]
  updated_at: Timestamp
}

// One band in a growth area's 1–5 scale. Generated by AI from the coach's
// anchor phrases; any band the coach hand-edits gets coach_edited = true so
// AI re-gen never overwrites it.
export type GrowthAreaBand = {
  band: 1 | 2 | 3 | 4 | 5
  description: string
  coach_edited: boolean
}

// A coach-defined development focus for their own craft (coach-scoped).
// up to 5 active at a time (enforced in code). Not client-facing.
export type CoachGrowthArea = {
  id: string
  coach_id: string
  title: string
  description: string
  least_proficient_when: string
  most_proficient_when: string
  band_scale: GrowthAreaBand[]
  status: 'active' | 'archived'
  definition_version: number
  created_at: Timestamp
  updated_at: Timestamp
}

// Output of the growth pass for one growth area on one scored session.
export type GrowthAreaAssessment = {
  id: string
  growth_area_id: string
  session_id: string
  coach_id: string
  observed: boolean
  band: number | null
  evidence: { quote_or_paraphrase: string; timestamp: string | null }[]
  developmental_note: string
  definition_version_snapshot: number
  created_at: Timestamp
}

export type PrepSheet = {
  id: string
  coach_id: string | null
  client_id: string
  content: PrepContent
  html: string | null
  sent_at: Timestamp
  created_at: Timestamp
}

export type Transcript = {
  id: string
  coach_id: string | null
  client_id: string | null
  client_initials: string | null
  source: string
  drive_file_id: string | null
  filename: string | null
  title: string | null // human-readable title (calendar/Plaud-derived, coach-editable)
  raw_md: string
  content_hash: string
  session_date: DateString | null
  match_status: string // matched | needs_review | unmatched
  match_confidence: number | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type SessionReport = {
  id: string
  transcript_id: string
  coach_id: string | null
  client_id: string | null
  client_initials: string | null
  session_date: DateString | null
  session_type: string | null
  session_number: number | null
  engagement_total: number | null
  overall_score: number | null
  band: string | null
  report: SessionReportJson
  coach_self_scores: Record<string, number> | null
  coach_overall: number | null
  coach_notes: string | null
  status: string // scored | reviewed
  created_at: Timestamp
  updated_at: Timestamp
}

/**
 * Insert shape: columns with DB defaults (id, timestamps) are optional, and
 * any nullable column is optional too (Postgres fills NULL). Everything else
 * is required.
 */
type Defaulted = 'id' | 'created_at' | 'updated_at' | 'sent_at' | 'agreement_on_file' | 'client_type'
type NullableKeys<T> = { [K in keyof T]-?: null extends T[K] ? K : never }[keyof T]
type OptionalOnInsert<T> = Defaulted | Extract<keyof T, NullableKeys<T>>

type Insertable<T> = Omit<T, OptionalOnInsert<T>> &
  Partial<Pick<T, Extract<keyof T, OptionalOnInsert<T>>>>
type Updatable<T> = Partial<Insertable<T>>

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: Client
        Insert: Insertable<Client>
        Update: Updatable<Client>
        Relationships: []
      }
      notes: {
        Row: Note
        Insert: Insertable<Note>
        Update: Updatable<Note>
        Relationships: []
      }
      actions: {
        Row: Action
        Insert: Insertable<Action>
        Update: Updatable<Action>
        Relationships: []
      }
      coaches: {
        Row: Coach
        Insert: Insertable<Coach>
        Update: Updatable<Coach>
        Relationships: []
      }
      note_templates: {
        Row: NoteTemplate
        Insert: Insertable<NoteTemplate>
        Update: Updatable<NoteTemplate>
        Relationships: []
      }
      library_folders: {
        Row: LibraryFolder
        Insert: Insertable<LibraryFolder>
        Update: Updatable<LibraryFolder>
        Relationships: []
      }
      pdf_resources: {
        Row: PdfResource
        Insert: Insertable<PdfResource>
        Update: Updatable<PdfResource>
        Relationships: []
      }
      agreements: {
        Row: Agreement
        Insert: Insertable<Agreement>
        Update: Updatable<Agreement>
        Relationships: []
      }
      agreement_templates: {
        Row: AgreementTemplate
        Insert: Insertable<AgreementTemplate>
        Update: Updatable<AgreementTemplate>
        Relationships: []
      }
      agenda_requests: {
        Row: AgendaRequest
        Insert: Insertable<AgendaRequest>
        Update: Updatable<AgendaRequest>
        Relationships: []
      }
      transcripts: {
        Row: Transcript
        Insert: Insertable<Transcript>
        Update: Updatable<Transcript>
        Relationships: []
      }
      session_reports: {
        Row: SessionReport
        Insert: Insertable<SessionReport>
        Update: Updatable<SessionReport>
        Relationships: []
      }
      prep_sheets: {
        Row: PrepSheet
        Insert: Insertable<PrepSheet>
        Update: Updatable<PrepSheet>
        Relationships: []
      }
      email_signatures: {
        Row: EmailSignature
        Insert: Insertable<EmailSignature>
        Update: Updatable<EmailSignature>
        Relationships: []
      }
      communications: {
        Row: Communication
        Insert: Insertable<Communication>
        Update: Updatable<Communication>
        Relationships: []
      }
      coach_clients: {
        Row: CoachClient
        Insert: Insertable<CoachClient>
        Update: Updatable<CoachClient>
        Relationships: []
      }
      appointments: {
        Row: Appointment
        Insert: Insertable<Appointment>
        Update: Updatable<Appointment>
        Relationships: []
      }
      appointment_reminders: {
        Row: AppointmentReminder
        Insert: Insertable<AppointmentReminder>
        Update: Updatable<AppointmentReminder>
        Relationships: []
      }
      nudges: {
        Row: Nudge
        Insert: Insertable<Nudge>
        Update: Updatable<Nudge>
        Relationships: []
      }
      garden_notes: {
        Row: GardenNote
        Insert: Insertable<GardenNote>
        Update: Updatable<GardenNote>
        Relationships: []
      }
      garden_edges: {
        Row: GardenEdge
        Insert: Insertable<GardenEdge>
        Update: Updatable<GardenEdge>
        Relationships: []
      }
      dashboard_layouts: {
        Row: DashboardLayout
        Insert: Insertable<DashboardLayout>
        Update: Updatable<DashboardLayout>
        Relationships: []
      }
      coach_growth_areas: {
        Row: CoachGrowthArea
        Insert: Insertable<CoachGrowthArea>
        Update: Updatable<CoachGrowthArea>
        Relationships: []
      }
      growth_area_assessments: {
        Row: GrowthAreaAssessment
        Insert: Insertable<GrowthAreaAssessment>
        Update: Updatable<GrowthAreaAssessment>
        Relationships: []
      }
      billing_accounts: {
        Row: BillingAccount
        Insert: Insertable<BillingAccount>
        Update: Updatable<BillingAccount>
        Relationships: []
      }
      coachees: {
        Row: Coachee
        Insert: Insertable<Coachee>
        Update: Updatable<Coachee>
        Relationships: []
      }
      engagements: {
        Row: Engagement
        Insert: Insertable<Engagement>
        Update: Updatable<Engagement>
        Relationships: []
      }
      billable_sessions: {
        Row: BillableSession
        Insert: Insertable<BillableSession>
        Update: Updatable<BillableSession>
        Relationships: []
      }
      invoices: {
        Row: Invoice
        Insert: Insertable<Invoice>
        Update: Updatable<Invoice>
        Relationships: []
      }
      invoice_lines: {
        Row: InvoiceLine
        Insert: Insertable<InvoiceLine>
        Update: Updatable<InvoiceLine>
        Relationships: []
      }
      invoice_reminders: {
        Row: InvoiceReminder
        Insert: Insertable<InvoiceReminder>
        Update: Updatable<InvoiceReminder>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
