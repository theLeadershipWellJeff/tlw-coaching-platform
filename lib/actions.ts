import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { getBaseUrl } from '@/lib/url'

export type ActionLink = { description: string; url: string }

/**
 * Persist a client's action items so completions can be logged, and return a
 * click-to-log link per action. Re-uses an existing row for the same
 * client + note + description (keeps the token stable across re-sends), so the
 * same action emailed twice points at the same record.
 *
 * Shared by the note "send to client" flow (note_id set) and the session-prep
 * email (note_id null).
 */
export async function persistActionLinks(
  supabase: SupabaseClient<Database>,
  clientId: string,
  noteId: string | null,
  descriptions: string[]
): Promise<ActionLink[]> {
  const clean = descriptions.map((d) => String(d || '').trim()).filter(Boolean)
  if (clean.length === 0) return []

  let query = supabase.from('actions').select('id, description, complete_token').eq('client_id', clientId)
  query = noteId ? query.eq('note_id', noteId) : query.is('note_id', null)
  const { data: existing } = await query
  const byDesc = new Map((existing || []).map((a) => [a.description, a]))

  const base = getBaseUrl()
  const links: ActionLink[] = []
  for (const description of clean) {
    const found = byDesc.get(description)
    let token = found?.complete_token || null
    if (!found) {
      token = randomUUID()
      await supabase
        .from('actions')
        .insert({ client_id: clientId, note_id: noteId, description, status: 'open', complete_token: token })
    }
    if (token) links.push({ description, url: `${base}/api/actions/complete?token=${token}` })
  }
  return links
}
