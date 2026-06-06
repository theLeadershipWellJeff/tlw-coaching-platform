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

type Timestamp = string // ISO 8601
type DateString = string // YYYY-MM-DD

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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
