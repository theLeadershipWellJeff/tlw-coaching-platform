import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { PDF_BUCKET } from '@/lib/library-storage'

// Delete a folder and everything in it (templates cascade via FK; PDF files are
// removed from Storage here, then their rows cascade). Scoped to the coach.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: folder } = await supabase
    .from('library_folders')
    .select('id, section')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (folder.section === 'pdf') {
    const { data: pdfs } = await supabase.from('pdf_resources').select('storage_path').eq('folder_id', folder.id)
    const paths = (pdfs || []).map((p) => p.storage_path).filter(Boolean)
    if (paths.length > 0) await supabase.storage.from(PDF_BUCKET).remove(paths)
  }

  const { error } = await supabase.from('library_folders').delete().eq('id', folder.id).eq('coach_id', coach.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
