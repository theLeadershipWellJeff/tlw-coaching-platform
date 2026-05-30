/**
 * Database types for the Supabase schema (see supabase/migrations/001_init.sql).
 *
 * Hand-written for now. Once the Supabase CLI is set up you can regenerate
 * this exactly with:
 *   npx supabase gen types typescript --project-id <ref> > lib/supabase/types.ts
 */

type Timestamp = string // ISO 8601
type DateString = string // YYYY-MM-DD

export interface Client {
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

export interface Note {
  id: string
  client_id: string
  session_date: DateString
  title: string | null
  content: string
  calendar_event_id: string | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface Action {
  id: string
  client_id: string
  note_id: string | null
  description: string
  due_date: DateString | null
  status: string
  created_at: Timestamp
  updated_at: Timestamp
}

// Insert/Update shapes: server provides id/timestamps via defaults.
type GeneratedKey = 'id' | 'created_at' | 'updated_at'
type Insertable<T> = Omit<T, GeneratedKey> &
  Partial<Pick<T, Extract<keyof T, GeneratedKey>>>
type Updatable<T> = Partial<Insertable<T>>

export interface Database {
  public: {
    Tables: {
      clients: { Row: Client; Insert: Insertable<Client>; Update: Updatable<Client> }
      notes: { Row: Note; Insert: Insertable<Note>; Update: Updatable<Note> }
      actions: { Row: Action; Insert: Insertable<Action>; Update: Updatable<Action> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
