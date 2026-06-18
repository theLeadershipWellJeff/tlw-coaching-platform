import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { syncNoteActions } from '@/lib/notes/sync-actions'

// POST /api/clients/[id]/notes/[noteId]/actions
// Reconcile this note's persisted action items against its current content and
// return them. Called when the editor opens so an older note's ACTION: lines
// are persisted (and therefore checkable / flowing to the workspace) on view.
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; noteId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: note } = await supabase
    .from('notes')
    .select('content')
    .eq('id', params.noteId)
    .eq('client_id', params.id)
    .maybeSingle()
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

  const actions = await syncNoteActions(supabase, params.id, params.noteId, note.content || '')
  return NextResponse.json({ actions })
}
