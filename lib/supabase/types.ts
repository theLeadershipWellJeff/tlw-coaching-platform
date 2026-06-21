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
  client_id: string
  scheduled_at: Timestamp
  duration_minutes: number
  google_event_id: string | null
  status: string // scheduled | cancelled | completed
  created_at: Timestamp
  updated_at: Timestamp
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
type Defaulted = 'id' | 'created_at' | 'updated_at' | 'sent_at' | 'agreement_on_file'
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
