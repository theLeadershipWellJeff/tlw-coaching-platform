/**
 * The communications log — the outbound record behind the Recent Communication
 * card (migration 017). Every send (success or failure) writes a row here so a
 * send is never silently dropped. Forward-compatible: `type`/`direction` let
 * reminders and future inbound reply-capture share the same table.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Communication, Database } from './supabase/types'

/**
 * Strip tags + collapse whitespace from an HTML body. Decodes the handful of
 * entities our own signature/body builders emit so the result reads as plain
 * text. Used for the card preview line and, at full length, to feed a sent
 * email's text to the portal chat + search.
 */
export function htmlToPlainText(html: string): string {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&middot;/gi, '·')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `htmlToPlainText`, truncated to `max` chars — the card preview line. */
export function htmlToPreview(html: string, max = 140): string {
  const text = htmlToPlainText(html)
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/**
 * Insert a communications row and return it. Used on both the success and the
 * failure path of a send (status / error_detail differ). Returns null only if
 * the insert itself fails — logged, never thrown, so a logging hiccup can't mask
 * a send that already happened.
 */
export async function logCommunication(
  supabase: SupabaseClient<Database>,
  row: Database['public']['Tables']['communications']['Insert']
): Promise<Communication | null> {
  const { data, error } = await supabase.from('communications').insert(row).select('*').single()
  if (error) {
    console.error('Failed to log communication:', error.message)
    return null
  }
  return data
}
