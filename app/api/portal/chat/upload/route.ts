import { NextRequest, NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { extractTranscriptText } from '@/lib/transcripts/extract'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 4 * 1024 * 1024
const MAX_TEXT = 30000

/** A portal client attaches a document to the chat. We extract its text (PDF /
 *  Word / text) and return it to the client to include with their next message —
 *  the file itself is not stored. Scoped to the authenticated portal client. */
export async function POST(req: NextRequest) {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `"${file.name}" is too large (max 4 MB).` }, { status: 400 })
  }

  try {
    const raw = await extractTranscriptText(file.name, Buffer.from(await file.arrayBuffer()))
    const text = (raw || '').trim()
    if (!text) {
      return NextResponse.json({ error: 'Could not read any text from that file.' }, { status: 400 })
    }
    return NextResponse.json({
      filename: file.name,
      text: text.slice(0, MAX_TEXT),
      truncated: text.length > MAX_TEXT,
    })
  } catch {
    return NextResponse.json(
      { error: 'Could not read that file. Supported: PDF, Word, or text.' },
      { status: 400 }
    )
  }
}
