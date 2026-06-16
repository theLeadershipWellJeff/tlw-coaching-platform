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
  ca_client_id: string | null
  tags: string[]
  bio: string | null
  address: string | null
  coaching_goals: CoachingGoal[] | null
  key_info: string | null
  coaching_map: string | null
  // Flat per-session fee, in dollars. Drives the Practice revenue cards.
  session_fee: number | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type Note = {
  id: string
  client_id: string
  session_date: DateString
  title: string | null
  content: string
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
  template_id: string | null
  title: string
  body_html: string
  status: string // sent | signed
  sign_token: string
  sent_at: Timestamp
  signed_at: Timestamp | null
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
  created_at: Timestamp
  updated_at: Timestamp
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
type Defaulted = 'id' | 'created_at' | 'updated_at'
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
