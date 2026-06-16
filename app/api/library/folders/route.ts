import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

const SECTIONS = ['templates', 'pdf']

// List the coach's folders in a section (?section=templates|pdf), with the
// number of items in each.
export async function GET(req: NextRequest) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const section = req.nextUrl.searchParams.get('section') || 'templates'
  if (!SECTIONS.includes(section)) return NextResponse.json({ error: 'Unknown section' }, { status: 400 })

  const { data: folders, error } = await supabase
    .from('library_folders')
    .select('*')
    .eq('coach_id', coach.id)
    .eq('section', section)
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Item counts per folder (templates or pdfs depending on section).
  const table = section === 'pdf' ? 'pdf_resources' : 'note_templates'
  const counts = new Map<string, number>()
  const ids = (folders || []).map((f) => f.id)
  if (ids.length > 0) {
    const { data: rows } = await supabase.from(table).select('folder_id').in('folder_id', ids)
    for (const r of rows || []) counts.set(r.folder_id as string, (counts.get(r.folder_id as string) || 0) + 1)
  }

  const withCounts = (folders || []).map((f) => ({ ...f, count: counts.get(f.id) || 0 }))
  return NextResponse.json({ folders: withCounts })
}

// Create a folder in a section. Body: { section, name }
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
  const section = body.section
  const name = (body.name || '').trim()
  if (!SECTIONS.includes(section)) return NextResponse.json({ error: 'Unknown section' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'A folder name is required.' }, { status: 400 })

  const { data, error } = await supabase
    .from('library_folders')
    .insert({ coach_id: coach.id, section, name })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ folder: data }, { status: 201 })
}
