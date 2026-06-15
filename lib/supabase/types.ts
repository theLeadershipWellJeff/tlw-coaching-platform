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

type Timestamp = string // ISO 8601
type DateString = string // YYYY-MM-DD

export type CoachingGoal = {
  title: string
  description: string
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
  created_at: Timestamp
  updated_at: Timestamp
}

export type Coach = {
  id: string
  email: string
  name: string
  role: string // coach | supervisor
  google_refresh_token: string | null
  timezone: string
  supervisor_email: string | null
  created_at: Timestamp
  updated_at: Timestamp
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
