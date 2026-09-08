import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { STANDARD_FOLDER_ID, standardTemplatesAsRows } from '@/lib/standard-templates'

// List the signed-in coach's note templates (newest first). Optionally scope to
// a folder: ?folderId=<uuid> for that folder, ?folderId=none for unfiled,
// ?folderId=standard for theLeadershipWell's shared standards (read-only, code-
// defined — no coach filter), or omit it entirely (the note editor's Templates
// dropdown lists the coach's own templates PLUS the standards under `standard`).
export async function GET(req: NextRequest) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const folderId = req.nextUrl.searchParams.get('folderId')
  if (folderId === STANDARD_FOLDER_ID) {
    return NextResponse.json({ templates: standardTemplatesAsRows(), standard: true })
  }

  let query = supabase.from('note_templates').select('*').eq('coach_id', coach.id)
  if (folderId === 'none') query = query.is('folder_id', null)
  else if (folderId) query = query.eq('folder_id', folderId)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    templates: data || [],
    // Only the unscoped list (the editor) carries the standards alongside.
    ...(folderId ? {} : { standard: standardTemplatesAsRows() }),
  })
}

// Create a note template for the signed-in coach.
export async function POST(req: NextRequest) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const name = (body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'A template name is required.' }, { status: 400 })

  const { data, error } = await supabase
    .from('note_templates')
    .insert({
      coach_id: coach.id,
      folder_id: body.folder_id || null,
      name,
      content: typeof body.content === 'string' ? body.content : '',
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ template: data }, { status: 201 })
}
