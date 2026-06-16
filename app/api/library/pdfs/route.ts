import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { PDF_BUCKET, ensurePdfBucket } from '@/lib/library-storage'

export const runtime = 'nodejs'

const MAX_BYTES = 4 * 1024 * 1024 // 4 MB (serverless request-body ceiling)

// List PDFs in a folder (?folderId=…), newest first.
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
  if (!folderId) return NextResponse.json({ error: 'A folder is required.' }, { status: 400 })

  const { data, error } = await supabase
    .from('pdf_resources')
    .select('id, name, size_bytes, created_at')
    .eq('coach_id', coach.id)
    .eq('folder_id', folderId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ pdfs: data || [] })
}

// Upload a PDF into a folder (multipart form-data: folderId, file).
export async function POST(req: NextRequest) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const folderId = form ? String(form.get('folderId') || '') : ''
  const file = form?.get('file')
  if (!folderId || !(file instanceof File)) {
    return NextResponse.json({ error: 'A folder and a file are required.' }, { status: 400 })
  }
  if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are supported.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'PDF is too large (max 4 MB for now).' }, { status: 400 })
  }

  const { data: folder } = await supabase
    .from('library_folders')
    .select('id')
    .eq('id', folderId)
    .eq('coach_id', coach.id)
    .eq('section', 'pdf')
    .maybeSingle()
  if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })

  try {
    await ensurePdfBucket(supabase)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Storage is not configured.' }, { status: 500 })
  }

  const path = `${coach.id}/${folderId}/${randomUUID()}.pdf`
  const buf = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(path, buf, { contentType: 'application/pdf', upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data, error } = await supabase
    .from('pdf_resources')
    .insert({ coach_id: coach.id, folder_id: folderId, name: file.name, storage_path: path, size_bytes: file.size })
    .select('id, name, size_bytes, created_at')
    .single()
  if (error) {
    await supabase.storage.from(PDF_BUCKET).remove([path])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ pdf: data }, { status: 201 })
}
