import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { PDF_BUCKET } from '@/lib/library-storage'

// Return a short-lived signed URL to view/download the PDF.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: pdf } = await supabase
    .from('pdf_resources')
    .select('storage_path')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!pdf) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase.storage.from(PDF_BUCKET).createSignedUrl(pdf.storage_path, 300)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not open the file.' }, { status: 500 })

  return NextResponse.json({ url: data.signedUrl })
}

// Delete a PDF (Storage object + row).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: pdf } = await supabase
    .from('pdf_resources')
    .select('id, storage_path')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!pdf) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase.storage.from(PDF_BUCKET).remove([pdf.storage_path])
  const { error } = await supabase.from('pdf_resources').delete().eq('id', pdf.id).eq('coach_id', coach.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
