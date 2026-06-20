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
  // Assign this exact client and skip matching — used by per-client import,
  // where the coach has already told us whose session this is.
  forceClient?: { id: string; name: string }
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

/**
 * Canonicalize transcript text before hashing so the same session ingested via
 * different transports dedupes. Zapier posts the markdown as a JSON string
 * (often CRLF / trailing newlines); the Drive import reads it as `alt:'media'`
 * (often LF) — identical content, different bytes. Strip the BOM, normalize line
 * endings, drop trailing whitespace, and trim so both land on one hash.
 */
function canonicalizeForHash(md: string): string {
  return md
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function ingestMarkdown(
  supabase: SupabaseClient<Database>,
  input: IngestInput
): Promise<IngestResult> {
  const { coach, markdown } = input
  const filename = input.filename ?? null
  const contentHash = createHash('sha256').update(canonicalizeForHash(markdown)).digest('hex')

  // Idempotency: already ingested this exact transcript?
  const { data: dupe } = await supabase
    .from('transcripts')
    .select('id, client_id, match_status, match_confidence, client_initials')
    .eq('content_hash', contentHash)
    .maybeSingle()
  if (dupe) {
    // A forced re-import (per-client "Import from Plaud") of a session already
    // ingested — e.g. Zapier parked it in the review queue. Adopt the existing
    // row and assign the client instead of creating a second copy; the caller
    // (or auto-score) then scores that one row.
    if (input.forceClient) {
      const fc = input.forceClient
      const initials = deriveInitials(fc.name)
      if (dupe.client_id !== fc.id || dupe.match_status !== 'matched') {
        await supabase
          .from('transcripts')
          .update({
            client_id: fc.id,
            client_initials: initials,
            match_status: 'matched',
            match_confidence: 1,
          })
          .eq('id', dupe.id)
      }
      return {
        duplicate: true,
        transcriptId: dupe.id,
        matchStatus: 'matched',
        matchConfidence: 1,
        clientInitials: initials,
        speakerSeparated: parseTranscript(filename, markdown).isSpeakerSeparated,
        reportId: null,
        scoringError: null,
      }
    }
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

  let match: { clientId: string | null; confidence: number; status: string }
  let matchedName: string | null = null

  if (input.forceClient) {
    // Coach picked the client (per-client import) — trust it, skip matching.
    match = { clientId: input.forceClient.id, confidence: 1, status: 'matched' }
    matchedName = input.forceClient.name
  } else {
    const { data: roster } = await supabase.from('clients').select('id, name, email')
    const clients = (roster || []) as RosterClientWithEmail[]

    // 1) Match on a name in the title/front matter (when the file is named).
    match = matchClient(
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
    matchedName = match.clientId ? clients.find((c) => c.id === match.clientId)?.name || null : null
  }

  // Initials come from the matched roster client when we have one (privacy §3),
  // else from whatever name the file carried.
  const clientInitials = matchedName ? deriveInitials(matchedName) : parsed.clientInitials

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
      const report = await runAndStoreReport(supabase, transcript, coach)
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
