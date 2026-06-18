import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Action } from '@/lib/supabase/types'
import { extractCaptures } from '@/lib/notes/extract'

// Strip a note's rich-text HTML down to plain text (block tags → newlines) so
// the ACTION: capture sees the same lines the editor does. Mirrors the helper
// used in /api/clients/[id]/template-render.
function htmlToText(html: string): string {
  return (html || '')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

type ActionRow = Pick<
  Action,
  'id' | 'description' | 'status' | 'due_date' | 'completed_at' | 'created_at'
>

/**
 * Reconcile the persisted `actions` rows for a single note against the ACTION:
 * lines currently in its content, so a note's actions flow to the client
 * workspace and the {{unfinished_actions}} merge field without waiting for a
 * "send to client". Idempotent — safe to call on every load and save.
 *
 *  - inserts a row (with a stable complete_token) for each new ACTION: line;
 *  - drops still-open rows whose line the coach has since edited or removed,
 *    while leaving any `done`/`dropped` rows intact (history is preserved);
 *  - returns the note's actions, oldest first, for the capture panel.
 */
export async function syncNoteActions(
  supabase: SupabaseClient<Database>,
  clientId: string,
  noteId: string,
  content: string
): Promise<ActionRow[]> {
  const text = htmlToText(content)
  const wanted = Array.from(
    new Set(extractCaptures(text).actions.map((a) => a.text.trim()).filter(Boolean))
  )

  const { data: existing } = await supabase
    .from('actions')
    .select('id, description, status')
    .eq('client_id', clientId)
    .eq('note_id', noteId)

  const haveDesc = new Set((existing || []).map((a) => a.description))

  // Insert the action lines we don't have a row for yet.
  const toInsert = wanted
    .filter((d) => !haveDesc.has(d))
    .map((description) => ({
      client_id: clientId,
      note_id: noteId,
      description,
      status: 'open',
      complete_token: randomUUID(),
    }))
  if (toInsert.length) await supabase.from('actions').insert(toInsert)

  // Drop open rows whose line is gone (edited/removed); keep completed history.
  const stale = (existing || []).filter(
    (a) => a.status === 'open' && !wanted.includes(a.description)
  )
  if (stale.length) {
    await supabase
      .from('actions')
      .delete()
      .in('id', stale.map((a) => a.id))
  }

  const { data } = await supabase
    .from('actions')
    .select('id, description, status, due_date, completed_at, created_at')
    .eq('client_id', clientId)
    .eq('note_id', noteId)
    .order('created_at', { ascending: true })

  return data || []
}
