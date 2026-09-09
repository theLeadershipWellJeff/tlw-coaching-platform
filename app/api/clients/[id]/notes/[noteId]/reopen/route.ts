import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { ApiError, toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import type { Database } from '@/lib/supabase/types'

export const runtime = 'nodejs'

/**
 * "Reopen and revise" the COACH note behind a sent/filed session. Logged on
 * the row (reopen_count + reopened_at). The sent client narrative is NOT
 * affected — it stays read-only forever (the narrative PATCH/POST refuse once
 * sent_to_client_at is set). A filed note returns to 'draft'; a sent note
 * stays 'sent' (the send is a fact), it just becomes editable again.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string; noteId: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)
    const { data: note, error } = await supabase
      .from('notes')
      .select('id, status, reopen_count, sent_to_client_at')
      .eq('id', params.noteId)
      .eq('client_id', params.id)
      .maybeSingle()
    if (error) throw new ApiError(500, error.message)
    if (!note) throw new ApiError(404, 'Note not found.')
    const patch: Database['public']['Tables']['notes']['Update'] = {
      reopen_count: (note.reopen_count ?? 0) + 1,
      reopened_at: new Date().toISOString(),
    }
    if (note.status === 'filed' && !note.sent_to_client_at) {
      patch.status = 'draft'
      patch.filed_at = null
    }
    const { data, error: upErr } = await supabase.from('notes').update(patch).eq('id', params.noteId).eq('client_id', params.id).select().single()
    if (upErr) throw new ApiError(500, upErr.message)
    return NextResponse.json({ note: data })
  } catch (e) {
    return toErrorResponse(e)
  }
}
