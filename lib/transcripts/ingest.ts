/**
 * Shared transcript ingestion: hash-dedupe, parse, fuzzy-match the roster, and
 * (on a confident match) score. Used by both the Zapier webhook
 * (/api/transcripts/ingest) and the in-app manual add (/api/transcripts/manual)
 * so the two paths behave identically — the only difference is how the coach is
 * resolved and how the request is authenticated.
 */
import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Coach, Database } from '@/lib/supabase/types'
import { parseTranscript, deriveInitials } from './parse'
import { matchClient, type RosterClient } from './match'
import { runAndStoreReport } from '@/lib/scoring/store'
import {
  findClientFromCalendar,
  zonedWallClockToUtc,
  type RosterClientWithEmail,
} from '@/lib/calendar'

export interface IngestInput {
  coach: Coach
  markdown: string
  filename?: string | null
  driveFileId?: string | null
  source?: string
  sessionDate?: string | null // override (YYYY-MM-DD), used by manual add
  autoScore?: boolean
}

export interface IngestResult {
  duplicate?: boolean
  transcriptId: string
  matchStatus: string
  matchConfidence: number
  clientInitials: string | null
  speakerSeparated: boolean
  reportId: string | null
  scoringError: string | null
}

export async function ingestMarkdown(
  supabase: SupabaseClient<Database>,
  input: IngestInput
): Promise<IngestResult> {
  const { coach, markdown } = input
  const filename = input.filename ?? null
  const contentHash = createHash('sha256').update(markdown).digest('hex')

  // Idempotency: already ingested this exact transcript?
  const { data: dupe } = await supabase
    .from('transcripts')
    .select('id, match_status, match_confidence, client_initials')
    .eq('content_hash', contentHash)
    .maybeSingle()
  if (dupe) {
    return {
      duplicate: true,
      transcriptId: dupe.id,
      matchStatus: dupe.match_status,
      matchConfidence: dupe.match_confidence ?? 0,
      clientInitials: dupe.client_initials,
      speakerSeparated: parseTranscript(filename, markdown).isSpeakerSeparated,
      reportId: null,
      scoringError: null,
    }
  }

  const parsed = parseTranscript(filename, markdown)

  const { data: roster } = await supabase.from('clients').select('id, name, email')
  const clients = (roster || []) as RosterClientWithEmail[]

  // 1) Match on a name in the title/front matter (when the file is named).
  let match = matchClient(
    parsed.clientNameRaw,
    clients.map((c) => ({ id: c.id, name: c.name }) as RosterClient)
  )

  // 2) Otherwise, resolve by timestamp: align the recording time (local wall
  //    clock, the coach's timezone) with the calendar and read the guest.
  if (match.status !== 'matched' && parsed.sessionDate && parsed.sessionTime) {
    const instant = zonedWallClockToUtc(parsed.sessionDate, parsed.sessionTime, coach.timezone)
    if (instant) {
      const cal = await findClientFromCalendar(coach, instant, clients)
      if (cal.status === 'matched' && cal.clientId) {
        match = { clientId: cal.clientId, confidence: cal.confidence, status: 'matched' }
      }
    }
  }

  // Initials come from the matched roster client when we have one (privacy §3),
  // else from whatever name the file carried.
  const matchedClient = match.clientId ? clients.find((c) => c.id === match.clientId) : null
  const clientInitials = matchedClient
    ? deriveInitials(matchedClient.name)
    : parsed.clientInitials

  const insert: Database['public']['Tables']['transcripts']['Insert'] = {
    coach_id: coach.id,
    client_id: match.clientId,
    client_initials: clientInitials,
    source: input.source || 'plaud',
    drive_file_id: input.driveFileId ?? null,
    filename,
    raw_md: markdown,
    content_hash: contentHash,
    session_date: input.sessionDate || parsed.sessionDate,
    match_status: match.status,
    match_confidence: match.confidence,
  }

  const { data: transcript, error: insErr } = await supabase
    .from('transcripts')
    .insert(insert)
    .select('*')
    .single()
  if (insErr) throw new Error(`Supabase: ${insErr.message}`)

  const autoScore = input.autoScore !== false
  let reportId: string | null = null
  let scoringError: string | null = null

  if (autoScore && match.status === 'matched' && match.clientId) {
    if (!parsed.isSpeakerSeparated) {
      scoringError = 'Transcript is not speaker-separated; conversation metrics will be unavailable.'
    }
    try {
      const report = await runAndStoreReport(supabase, transcript, coach.name)
      reportId = report.id
    } catch (e: any) {
      scoringError = e.message
    }
  }

  return {
    transcriptId: transcript.id,
    matchStatus: match.status,
    matchConfidence: Number(match.confidence.toFixed(2)),
    clientInitials: parsed.clientInitials,
    speakerSeparated: parsed.isSpeakerSeparated,
    reportId,
    scoringError,
  }
}
