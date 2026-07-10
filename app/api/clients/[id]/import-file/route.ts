import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { ingestMarkdown } from '@/lib/transcripts/ingest'
import { extractTranscriptText } from '@/lib/transcripts/extract'

export const runtime = 'nodejs'

const MAX_BYTES = 4 * 1024 * 1024 // 4 MB (serverless request-body ceiling)

/**
 * Import an uploaded transcript file (md/txt/vtt/srt/docx/pdf) and attach it
 * to this client. The coach picked the file for this specific client, so we
 * force the match and skip matching. Not scored here — the UI fires the
 * background score afterward (same pattern as the review queue), so the coach
 * isn't blocked for the ~2-minute engine run.
 *
 * Multipart form-data: file. One file per request; the modal loops.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)

    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A transcript file is required.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `"${file.name}" is too large (max 4 MB).` }, { status: 400 })
    }

    const { data: client } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', params.id)
      .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    let markdown: string
    try {
      markdown = await extractTranscriptText(file.name, Buffer.from(await file.arrayBuffer()))
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Could not read the file.' }, { status: 400 })
    }

    const result = await ingestMarkdown(supabase, {
      coach,
      markdown,
      filename: file.name,
      source: 'upload',
      forceClient: { id: client.id, name: client.name },
      autoScore: false,
    })

    return NextResponse.json({
      transcriptId: result.transcriptId,
      duplicate: result.duplicate || false,
      title: result.title,
      speakerSeparated: result.speakerSeparated,
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}
