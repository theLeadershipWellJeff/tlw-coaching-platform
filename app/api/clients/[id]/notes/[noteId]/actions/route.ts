import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { syncNoteActions } from '@/lib/notes/sync-actions'

// POST /api/clients/[id]/notes/[noteId]/actions
// Reconcile this note's persisted action items against its current content and
// return them. Called when the editor opens so an older note's ACTION: lines
// are persisted (and therefore checkable / flowing to the workspace) on view.
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; noteId: string } }
) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { data: note } = await supabase
      .from('notes')
      .select('content')
      .eq('id', params.noteId)
      .eq('client_id', params.id)
      .maybeSingle()
    if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

    const actions = await syncNoteActions(supabase, params.id, params.noteId, note.content || '')
    return NextResponse.json({ actions })
  } catch (e) {
    return toErrorResponse(e)
  }
}
