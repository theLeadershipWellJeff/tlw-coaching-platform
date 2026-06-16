import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

// Update a note (title / content / session date).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; noteId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const allowed = ['title', 'content', 'session_date', 'calendar_event_id', 'duration_minutes'] as const
  const patch: Database['public']['Tables']['notes']['Update'] = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('notes')
    .update(patch)
    .eq('id', params.noteId)
    .eq('client_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ note: data })
}

// Delete a note.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; noteId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', params.noteId)
    .eq('client_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
