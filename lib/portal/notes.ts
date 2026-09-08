/**
 * "My notes" (migration 063) — the client's private journal in the portal.
 * Read by the portal routes and the chat context ONLY. Never by a coach-side
 * query: a note here is the client's own thinking, not a coaching record.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'

export const MAX_PORTAL_NOTES = 200
export const MAX_NOTE_TITLE = 160
export const MAX_NOTE_BODY = 20000
/** How much of the journal the assistant sees, newest first. */
export const NOTES_CHAT_CHAR_BUDGET = 8000
const NOTE_CHAT_CHARS = 2500

export function cleanNoteInput(input: unknown): { ok: true; title: string | null; body: string } | { ok: false; error: string } {
  const g = (input || {}) as Record<string, unknown>
  const title = String(g.title || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_TITLE) || null
  const body = String(g.body || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_NOTE_BODY)
  if (!body && !title) return { ok: false, error: 'Write something first.' }
  return { ok: true, title, body }
}

/** The newest notes, clipped to a budget, for the assistant's context. */
export async function loadNotesForChat(clientId: string): Promise<Array<{ title: string; date: string; text: string }>> {
  const supabase = getSupabaseAdmin()
  try {
    const { data, error } = await supabase
      .from('portal_notes')
      .select('title, body, updated_at')
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false })
      .limit(12)
    if (error) return []
    const out: Array<{ title: string; date: string; text: string }> = []
    let budget = NOTES_CHAT_CHAR_BUDGET
    for (const n of data || []) {
      if (budget <= 0) break
      const text = (n.body || '').trim().slice(0, Math.min(NOTE_CHAT_CHARS, budget))
      if (!text && !n.title) continue
      budget -= text.length
      out.push({ title: n.title || 'Untitled note', date: (n.updated_at || '').slice(0, 10), text })
    }
    return out
  } catch {
    return []
  }
}

export function formatNotesForPrompt(notes: Array<{ title: string; date: string; text: string }>): string {
  return notes.map((n) => `## ${n.title}${n.date ? ` — ${n.date}` : ''}\n${n.text}`).join('\n\n')
}
