import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import type { Database } from '@/lib/supabase/types'
import { syncNoteActions } from '@/lib/notes/sync-actions'

// Update a note (title / content / session date).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; noteId: string } }
) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const body = await req.json().catch(() => ({}))
    const allowed = ['title', 'content', 'session_date', 'calendar_event_id', 'duration_minutes'] as const
    const patch: Database['public']['Tables']['notes']['Update'] = {}
    for (const key of allowed) {
      if (key in body) patch[key] = body[key]
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('notes')
      .update(patch)
      .eq('id', params.noteId)
      .eq('client_id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Keep the note's persisted ACTION: items in step with its content, so they
    // flow to the workspace and the {{unfinished_actions}} field as the coach
    // edits — and so the capture panel's checkboxes can mark them done.
    let actions
    if ('content' in patch) {
      actions = await syncNoteActions(supabase, params.id, params.noteId, data.content || '')
    }

    return NextResponse.json({ note: data, actions })
  } catch (e) {
    return toErrorResponse(e)
  }
}

// Delete a note.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; noteId: string } }
) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', params.noteId)
      .eq('client_id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}
