import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { driveClient, readFileText } from '@/lib/drive'
import { ingestMarkdown } from '@/lib/transcripts/ingest'

export const runtime = 'nodejs'
// Scoring a full transcript can exceed a minute (engine times out at 100s).
export const maxDuration = 120

/**
 * Import selected Plaud transcript files from Drive and attach them to this
 * client. The coach has already chosen whose sessions these are, so we force
 * the client and skip matching. Transcripts are stored (deduped) but NOT scored
 * here — the UI scores them one at a time afterward to stay within request
 * limits. Body: { fileIds: string[] }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const fileIds: string[] = Array.isArray(body.fileIds) ? body.fileIds : []
  if (fileIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one file to import.' }, { status: 400 })
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', params.id)
    .maybeSingle()
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const drive = driveClient(session.accessToken as string)
  const results: { fileId: string; transcriptId?: string; duplicate?: boolean; error?: string }[] = []

  for (const fileId of fileIds) {
    try {
      const meta = await drive.files.get({ fileId, fields: 'name' })
      const markdown = await readFileText(drive, fileId)
      if (!markdown.trim()) {
        results.push({ fileId, error: 'File is empty.' })
        continue
      }
      const res = await ingestMarkdown(supabase, {
        coach,
        markdown,
        filename: meta.data.name || null,
        driveFileId: fileId,
        source: 'plaud-drive',
        forceClient: { id: client.id, name: client.name },
        autoScore: false,
      })
      results.push({ fileId, transcriptId: res.transcriptId, duplicate: res.duplicate })
    } catch (e: any) {
      results.push({ fileId, error: e?.message || 'Import failed.' })
    }
  }

  return NextResponse.json({ results })
}
