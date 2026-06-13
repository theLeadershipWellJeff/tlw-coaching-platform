import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { driveClient, findFolderId, listTranscriptFiles } from '@/lib/drive'

export const runtime = 'nodejs'

const DEFAULT_FOLDER = process.env.PLAUD_DRIVE_FOLDER || 'Plaud-Transcripts'

// List the transcript files in the coach's Plaud Drive folder, for the
// per-client import picker. Requires the drive.readonly scope (granted on
// re-consent) — a 403 means the coach needs to sign out and back in.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const folderName = req.nextUrl.searchParams.get('folder') || DEFAULT_FOLDER

  try {
    const drive = driveClient(session.accessToken as string)
    const folderId = await findFolderId(drive, folderName)
    if (!folderId) {
      return NextResponse.json(
        { error: `Couldn't find a Drive folder named "${folderName}".` },
        { status: 404 }
      )
    }
    const files = await listTranscriptFiles(drive, folderId)
    return NextResponse.json({ folder: folderName, files })
  } catch (e: any) {
    const msg: string = e?.message || 'Drive request failed.'
    const needsScope = /insufficient|scope|permission|403/i.test(msg)
    return NextResponse.json(
      {
        error: needsScope
          ? 'Drive access not granted yet — sign out and back in to allow it.'
          : msg,
      },
      { status: needsScope ? 403 : 502 }
    )
  }
}
