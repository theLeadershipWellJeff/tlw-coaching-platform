/**
 * Resolve a roster client from an email and/or a name, email first. Several
 * routes (session-prep send, prep generation) need "find the client this email
 * is for" and were each inlining the same email-then-name lookup; centralizing
 * it means the matching rule lives in one place.
 *
 * Matching is exact (case-insensitive) on the whole email or whole name — NOT
 * the token/substring matcher used by the transcript pipeline. That keeps it
 * clear of the "Michel W" substring-match class of bug (see CLAUDE.md): a short
 * stored name can never partial-match a longer string here.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './supabase/types'

export interface ClientRef {
  id: string
  name: string
  email: string | null
}

export async function findClientByEmailOrName(
  supabase: SupabaseClient<Database>,
  opts: { email?: string | null; name?: string | null }
): Promise<ClientRef | null> {
  const email = opts.email?.trim()
  const name = opts.name?.trim()

  if (email) {
    const { data } = await supabase
      .from('clients')
      .select('id, name, email')
      .ilike('email', email)
      .limit(1)
      .maybeSingle()
    if (data) return data as ClientRef
  }

  if (name) {
    const { data } = await supabase
      .from('clients')
      .select('id, name, email')
      .ilike('name', name)
      .limit(1)
      .maybeSingle()
    if (data) return data as ClientRef
  }

  return null
}
