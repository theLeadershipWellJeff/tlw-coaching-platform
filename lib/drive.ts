/**
 * Read-only Google Drive access for importing Plaud transcript files.
 *
 * Plaud drops transcript markdown into a Drive folder (via Zapier). The client
 * workspace's "import from Plaud" flow lists that folder and reads the files
 * the coach picks. Uses the signed-in coach's access token (which carries the
 * drive.readonly scope after re-consent), mirroring how the calendar/email
 * routes use the session token.
 */
import { google, type drive_v3 } from 'googleapis'

export function driveClient(accessToken: string): drive_v3.Drive {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ access_token: accessToken })
  return google.drive({ version: 'v3', auth })
}

/** Find a (non-trashed) folder by exact name; returns its id or null. */
export async function findFolderId(drive: drive_v3.Drive, name: string): Promise<string | null> {
  const res = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and name = '${name.replace(/'/g, "\\'")}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 5,
  })
  return res.data.files?.[0]?.id || null
}

export interface DriveFile {
  id: string
  name: string
  modifiedTime: string
}

/** List the transcript files in a folder, most recently modified first. */
export async function listTranscriptFiles(drive: drive_v3.Drive, folderId: string): Promise<DriveFile[]> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 100,
  })
  return (res.data.files || []).map((f) => ({
    id: f.id || '',
    name: f.name || 'transcript',
    modifiedTime: f.modifiedTime || '',
  }))
}

/** Read a Drive file's content as text (works for uploaded .md/.txt files). */
export async function readFileText(drive: drive_v3.Drive, fileId: string): Promise<string> {
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' })
  return typeof res.data === 'string' ? res.data : String(res.data ?? '')
}
